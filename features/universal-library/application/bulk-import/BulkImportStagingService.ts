import { createHash } from "node:crypto";

import type {
  BulkImportEvidence,
  BulkImportMarketRelevance,
  BulkImportRecordEnvelope,
} from "../../domain/bulk-import/BulkImportContract";
import type { UniversalIngestionRecord } from "../../domain/entities/UniversalIngestionRecord";
import type { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { stableJsonStringify } from "../../domain/normalization/stableJson";
import type {
  JsonlInvalidResult,
  JsonlParseResult,
} from "../../infrastructure/bulk-import/jsonl/JsonlProcessor";

export type BulkImportStagingDisposition =
  | "NEW"
  | "UNCHANGED"
  | "CHANGED"
  | "INVALID";

export interface BulkImportStagingRecordResult {
  lineNumber: number;
  externalKey: string | null;
  disposition: BulkImportStagingDisposition;
  ingestionRecord: UniversalIngestionRecord | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface BulkImportStagingSummary {
  sourceId: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  newRecords: number;
  unchangedRecords: number;
  changedRecords: number;
  results: BulkImportStagingRecordResult[];
}

export interface BulkImportStagingOptions {
  sourceId: string;
  acquisitionRunId?: string | null;
  attributionText?: string | null;
}

const VOLATILE_HASH_KEYS = new Set([
  "observedAt",
  "sourceUpdatedAt",
]);

function sanitizeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeHashValue);
  }

  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (VOLATILE_HASH_KEYS.has(key)) {
        continue;
      }

      sanitized[key] = sanitizeHashValue(childValue);
    }

    return sanitized;
  }

  return value;
}

function createHashMaterial(
  envelope: BulkImportRecordEnvelope,
): Record<string, unknown> {
  return sanitizeHashValue(
    envelope as unknown as Record<string, unknown>,
  ) as Record<string, unknown>;
}

export function computeBulkImportContentHash(
  envelope: BulkImportRecordEnvelope,
): string {
  return createHash("sha256")
    .update(stableJsonStringify(createHashMaterial(envelope)))
    .digest("hex");
}

function rawEnvelope(
  envelope: BulkImportRecordEnvelope,
): Record<string, unknown> {
  return envelope as unknown as Record<string, unknown>;
}

export class BulkImportStagingService {
  public constructor(
    private readonly repository: IUniversalLibraryRepository,
  ) {}

  public async stage(
    parsedRecords: AsyncIterable<JsonlParseResult>,
    options: BulkImportStagingOptions,
  ): Promise<BulkImportStagingSummary> {
    const sourceId = options.sourceId.trim();

    if (!sourceId) {
      throw new Error("sourceId is required.");
    }

    const source = await this.repository.getSourceById(sourceId);

    if (!source) {
      throw new Error(
        `Universal source with ID '${sourceId}' not found.`,
      );
    }

    if (!source.isActive) {
      throw new Error(
        `Universal source '${source.name}' (${sourceId}) is currently inactive.`,
      );
    }

    const summary: BulkImportStagingSummary = {
      sourceId,
      totalRecords: 0,
      validRecords: 0,
      invalidRecords: 0,
      newRecords: 0,
      unchangedRecords: 0,
      changedRecords: 0,
      results: [],
    };

    for await (const parsed of parsedRecords) {
      summary.totalRecords += 1;

      if (parsed.outcome === "invalid") {
        this.recordInvalid(summary, parsed);
        continue;
      }

      summary.validRecords += 1;

      const envelope = parsed.envelope;
      const payloadHash = computeBulkImportContentHash(envelope);

      const existing =
        await this.repository.getIngestionRecordBySourceExternalId(
          sourceId,
          envelope.externalKey,
        );

      if (
        existing &&
        existing.payloadHash === payloadHash &&
        existing.status !== "FAILED"
      ) {
        summary.unchangedRecords += 1;
        summary.results.push({
          lineNumber: parsed.lineNumber,
          externalKey: envelope.externalKey,
          disposition: "UNCHANGED",
          ingestionRecord: existing,
          errorCode: null,
          errorMessage: null,
        });
        continue;
      }

      const isChanged = existing !== null;
      const status = isChanged ? "NEEDS_REVIEW" : "RECEIVED";

      const canonicalSourceUrl =
        envelope.evidence?.find(
          (item) =>
            typeof item.url === "string" &&
            item.url.trim().length > 0,
        )?.url ?? null;

      const attributionText =
        options.attributionText ??
        envelope.evidence?.find(
          (item) =>
            typeof item.attribution === "string" &&
            item.attribution.trim().length > 0,
        )?.attribution ??
        null;

      const fetchedAt =
        envelope.observedAt &&
        !Number.isNaN(Date.parse(envelope.observedAt))
          ? new Date(envelope.observedAt)
          : null;

      const ingestionRecord =
        await this.repository.saveIngestionRecord({
          sourceId,
          sourceExternalId: envelope.externalKey,
          entityType: envelope.entityType,
          rawPayload: rawEnvelope(envelope),
          payloadHash,
          status,
          normalizedData: null,
          matchedItemId: existing?.matchedItemId ?? null,
          errorMessage: isChanged
            ? "Bulk source content changed and requires governed review."
            : null,
          acquisitionRunId: options.acquisitionRunId ?? null,
          canonicalSourceUrl,
          fetchedAt,
          attributionText,
        });

      if (isChanged) {
        summary.changedRecords += 1;
      } else {
        summary.newRecords += 1;
      }

      summary.results.push({
        lineNumber: parsed.lineNumber,
        externalKey: envelope.externalKey,
        disposition: isChanged ? "CHANGED" : "NEW",
        ingestionRecord,
        errorCode: null,
        errorMessage: isChanged
          ? "Bulk source content changed and requires governed review."
          : null,
      });
    }

    return summary;
  }

  private recordInvalid(
    summary: BulkImportStagingSummary,
    parsed: JsonlInvalidResult,
  ): void {
    summary.invalidRecords += 1;

    summary.results.push({
      lineNumber: parsed.lineNumber,
      externalKey: null,
      disposition: "INVALID",
      ingestionRecord: null,
      errorCode: parsed.error.code,
      errorMessage: parsed.error.message,
    });
  }
}

