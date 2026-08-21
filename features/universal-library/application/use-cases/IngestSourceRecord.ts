import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { UniversalIngestionRecord } from "../../domain/entities/UniversalIngestionRecord";
import { NormalizationPipelineService, RawIngestionPayloadInput } from "../../domain/normalization/NormalizationPipelineService";
import { IdentityResolutionService } from "../../domain/identity-resolution/IdentityResolutionService";
import { createHash } from "crypto";
import { stableJsonStringify } from "../../domain/normalization/stableJson";

export interface IngestSourceRecordParams {
  sourceId: string;
  sourceExternalId: string;
  entityType?: string;
  rawPayload: RawIngestionPayloadInput;
}

export interface IngestSourceRecordResult {
  ingestionRecord: UniversalIngestionRecord;
  isDuplicatePayload: boolean;
  isNewRecord: boolean;
}

export class IngestSourceRecord {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  public async execute(params: IngestSourceRecordParams): Promise<IngestSourceRecordResult> {
    const sourceId = params.sourceId.trim();
    const sourceExternalId = params.sourceExternalId.trim();
    const { entityType, rawPayload } = params;

    if (!sourceId || sourceId.trim() === "") {
      throw new Error("sourceId is required");
    }
    if (!sourceExternalId || sourceExternalId.trim() === "") {
      throw new Error("sourceExternalId is required");
    }

    // 1. Verify source existence and active status
    const source = await this.repository.getSourceById(sourceId);
    if (!source) {
      throw new Error(`Universal source with ID '${sourceId}' not found.`);
    }
    if (!source.isActive) {
      throw new Error(`Universal source '${source.name}' (${sourceId}) is currently inactive.`);
    }

    // 2. Compute payload SHA-256 fingerprint hash
    const rawPayloadJson = rawPayload as unknown as Record<string, unknown>;
    const payloadHash = createHash("sha256")
      .update(stableJsonStringify(rawPayloadJson))
      .digest("hex");

    // 3. Check existing record for idempotency
    const existing = await this.repository.getIngestionRecordBySourceExternalId(sourceId, sourceExternalId);

    if (existing) {
      if (existing.payloadHash === payloadHash && existing.status !== "FAILED") {
        // Idempotent hit: exact same payload received repeatedly
        return {
          ingestionRecord: existing,
          isDuplicatePayload: true,
          isNewRecord: false,
        };
      }
      if (existing.status === "PUBLISHED") {
        const normalized = NormalizationPipelineService.normalize(rawPayload, { externalIdentifierSource: sourceId });
        const record = await this.repository.saveIngestionRecord({
          sourceId,
          sourceExternalId,
          entityType: entityType || existing.entityType,
          rawPayload: rawPayloadJson,
          payloadHash,
          status: "NEEDS_REVIEW",
          normalizedData: normalized as unknown as Record<string, unknown>,
          matchedItemId: existing.matchedItemId,
          errorMessage: "Published source payload changed and requires manual review",
        });
        return { ingestionRecord: record, isDuplicatePayload: false, isNewRecord: false };
      }
    }

    // 4. Normalize payload safely
    let normalized;
    let normalizeError: string | null = null;
    try {
      normalized = NormalizationPipelineService.normalize(rawPayload, { externalIdentifierSource: sourceId });
    } catch (err: any) {
      normalizeError = err.message || "Failed to normalize raw payload";
    }

    if (normalizeError || !normalized) {
      const record = await this.repository.saveIngestionRecord({
        sourceId,
        sourceExternalId,
        entityType: entityType || "ITEM",
        rawPayload: rawPayloadJson,
        payloadHash,
        status: "REJECTED",
        errorMessage: normalizeError || "Invalid raw payload",
      });
      return {
        ingestionRecord: record,
        isDuplicatePayload: false,
        isNewRecord: !existing,
      };
    }

    // 5. Identity resolution lookup with strict manufacturer scoping
    const resolution = await IdentityResolutionService.resolveIdentity(
      normalized,
      sourceId,
      sourceExternalId,
      {
        findItemBySourceExternalRef: async (sId, extId) => {
          const rec = await this.repository.getIngestionRecordBySourceExternalId(sId, extId);
          if (!rec?.matchedItemId) return null;
          const item = await this.repository.getItemById(rec.matchedItemId);
          return item?.isActive ? { id: item.id } : null;
        },
        findItemsByGlobalIdentifier: async (type, val) => (await this.repository.findActiveItemIdsByIdentifier({ identifierType: type as any, value: val })).map(id => ({ id })),
        findItemsByManufacturerMpn: async (mName, mpn) => (await this.repository.findActiveItemIdsByManufacturerIdentifier(mName, "MPN", mpn)).map(id => ({ id })),
        findItemsByManufacturerModel: async (mName, model) => (await this.repository.findActiveItemIdsByManufacturerModel(mName, model)).map(id => ({ id })),
        findItemsByConservativeName: async (name, mName) => {
          return (await this.repository.findActiveItemIdsByName(name, mName)).map(id => ({ id }));
        },
      }
    );

    const record = await this.repository.saveIngestionRecord({
      sourceId,
      sourceExternalId,
      entityType: entityType || "ITEM",
      rawPayload: rawPayloadJson,
      payloadHash,
      status: resolution.status as any,
      normalizedData: normalized as unknown as Record<string, unknown>,
      matchedItemId: resolution.matchedItemId,
      errorMessage: resolution.status === "NEEDS_REVIEW" ? "Ambiguous match or low confidence requires manual review" : null,
    });

    return {
      ingestionRecord: record,
      isDuplicatePayload: false,
      isNewRecord: !existing,
    };
  }
}
