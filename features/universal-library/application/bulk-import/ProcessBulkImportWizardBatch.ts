import {
  DEFAULT_INGESTION_BATCH_LIMIT,
  MAX_INGESTION_BATCH_LIMIT,
  type IUniversalLibraryRepository,
} from "../../domain/repositories/UniversalLibraryRepository";
import { IdentityResolutionService } from "../../domain/identity-resolution/IdentityResolutionService";
import { NormalizationPipelineService } from "../../domain/normalization/NormalizationPipelineService";
import { mapBulkEnvelopeToRawPayload } from "../../domain/bulk-import/mapBulkEnvelopeToRawPayload";
import type { UniversalIngestionRecord } from "../../domain/entities/UniversalIngestionRecord";
import {
  GetBulkImportBatchStatus,
  type IBulkImportBatchStatusRepository,
} from "./GetBulkImportBatchStatus";

export const MAX_WIZARD_PROCESS_RECORDS = 1000;

export interface ProcessBulkImportWizardBatchInput {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace?: string;
  batchSize?: number;
  maxRecords?: number;
}

export interface ProcessBulkImportWizardBatchSummary {
  processedCount: number;
  needsReviewCount: number;
  failedCount: number;
  publishedCount: number;
  recordIds: string[];
  failedRecordIds: string[];
  remainingCount: number;
  overallStatus:
    | "READY_TO_PROCESS"
    | "IN_REVIEW"
    | "FAILED"
    | "COMPLETE";
}

function identityLookups(
  repository: IUniversalLibraryRepository,
) {
  return {
    findItemBySourceExternalRef: async (
      sourceId: string,
      sourceExternalId: string,
    ) => {
      const rec =
        await repository.getIngestionRecordBySourceExternalId(
          sourceId,
          sourceExternalId,
        );

      if (!rec?.matchedItemId) {
        return null;
      }

      const item = await repository.getItemById(rec.matchedItemId);
      return item?.isActive ? { id: item.id } : null;
    },
    findItemsByGlobalIdentifier: async (
      type: string,
      value: string,
    ) =>
      (
        await repository.findActiveItemIdsByIdentifier({
          identifierType: type as any,
          value,
        })
      ).map((id) => ({ id })),
    findItemsByManufacturerMpn: async (
      manufacturerName: string,
      mpn: string,
    ) =>
      (
        await repository.findActiveItemIdsByManufacturerIdentifier(
          manufacturerName,
          "MPN",
          mpn,
        )
      ).map((id) => ({ id })),
    findItemsByManufacturerModel: async (
      manufacturerName: string,
      model: string,
    ) =>
      (
        await repository.findActiveItemIdsByManufacturerModel(
          manufacturerName,
          model,
        )
      ).map((id) => ({ id })),
    findItemsByConservativeName: async (
      name: string,
      manufacturerName: string | null,
    ) =>
      (
        await repository.findActiveItemIdsByName(
          name,
          manufacturerName,
        )
      ).map((id) => ({ id })),
  };
}

export class ProcessBulkImportWizardBatch {
  public constructor(
    private readonly batchStatusRepository: IBulkImportBatchStatusRepository,
    private readonly repository: IUniversalLibraryRepository,
  ) {}

  public async execute(
    input: ProcessBulkImportWizardBatchInput,
  ): Promise<ProcessBulkImportWizardBatchSummary> {
    const sourceId = input.sourceId?.trim();
    const batchExternalKey = input.batchExternalKey?.trim();
    const sourceNamespace = input.sourceNamespace?.trim() || undefined;

    if (!sourceId) {
      throw new Error("sourceId is required.");
    }

    if (!batchExternalKey) {
      throw new Error("batchExternalKey is required.");
    }

    const batchSize =
      input.batchSize ?? DEFAULT_INGESTION_BATCH_LIMIT;

    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_INGESTION_BATCH_LIMIT
    ) {
      throw new Error(
        `batchSize must be an integer between 1 and ${MAX_INGESTION_BATCH_LIMIT}`,
      );
    }

    const maxRecords = input.maxRecords ?? MAX_WIZARD_PROCESS_RECORDS;

    if (
      !Number.isInteger(maxRecords) ||
      maxRecords < 1 ||
      maxRecords > MAX_WIZARD_PROCESS_RECORDS
    ) {
      throw new Error(
        `maxRecords must be an integer between 1 and ${MAX_WIZARD_PROCESS_RECORDS}`,
      );
    }

    const batchStatus = await new GetBulkImportBatchStatus(
      this.batchStatusRepository,
    ).execute({
      sourceId,
      batchExternalKey,
      sourceNamespace,
    });

    if (!batchStatus) {
      throw new Error("Bulk import batch was not found.");
    }

    const runIds = [
      ...new Set(
        batchStatus.chunks
          .map((chunk) => chunk.latestRunId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const allRuns = await this.batchStatusRepository.findBatchRuns({
      sourceId,
      batchExternalKey,
      sourceNamespace,
    });

    const acquisitionRunIds = [
      ...new Set(allRuns.map((run) => run.id)),
    ];

    if (acquisitionRunIds.length === 0 && runIds.length === 0) {
      throw new Error("Bulk import batch has no durable chunk runs.");
    }

    const effectiveRunIds =
      acquisitionRunIds.length > 0 ? acquisitionRunIds : runIds;

    const summary: ProcessBulkImportWizardBatchSummary = {
      processedCount: 0,
      needsReviewCount: 0,
      failedCount: 0,
      publishedCount: 0,
      recordIds: [],
      failedRecordIds: [],
      remainingCount: 0,
      overallStatus: "READY_TO_PROCESS",
    };

    const lookups = identityLookups(this.repository);
    const claimedIds: string[] = [];

    while (summary.processedCount < maxRecords) {
      const remaining = maxRecords - summary.processedCount;
      const claimed =
        await this.repository.claimBulkWizardIngestionRecords(
          effectiveRunIds,
          Math.min(batchSize, remaining),
          claimedIds,
        );

      if (claimed.length === 0) {
        break;
      }

      for (const record of claimed) {
        claimedIds.push(record.id);
        summary.processedCount += 1;
        summary.recordIds.push(record.id);
        await this.processRecord(record, lookups, summary);
      }
    }

    if (summary.publishedCount !== 0) {
      throw new Error(
        "Bulk wizard safety violation: publication occurred during process.",
      );
    }

    const counts =
      await this.repository.countBulkWizardIngestionRecords(
        effectiveRunIds,
      );

    summary.remainingCount =
      counts.received +
      counts.normalized +
      counts.matched +
      counts.failed +
      counts.incompleteReview;

    if (summary.remainingCount > 0 && summary.needsReviewCount === 0 && summary.failedCount > 0 && counts.needsReview === 0) {
      summary.overallStatus = "FAILED";
    } else if (summary.remainingCount > 0) {
      summary.overallStatus = "READY_TO_PROCESS";
    } else if (counts.needsReview > 0 || counts.published > 0 || counts.rejected > 0) {
      summary.overallStatus = "IN_REVIEW";
    } else if (summary.failedCount > 0 || counts.failed > 0) {
      summary.overallStatus = "FAILED";
    } else {
      summary.overallStatus = "COMPLETE";
    }

    return summary;
  }

  private async processRecord(
    record: UniversalIngestionRecord,
    lookups: ReturnType<typeof identityLookups>,
    summary: ProcessBulkImportWizardBatchSummary,
  ): Promise<void> {
    try {
      const raw = mapBulkEnvelopeToRawPayload(
        record.rawPayload,
        record.entityType,
        record.sourceExternalId,
      );

      const normalized = NormalizationPipelineService.normalize(
        raw,
        { externalIdentifierSource: record.sourceId },
      );

      const resolution = await IdentityResolutionService.resolveIdentity(
        normalized,
        record.sourceId,
        record.sourceExternalId,
        lookups,
      );

      await this.repository.updateIngestionRecordStatus(
        record.id,
        "NEEDS_REVIEW",
        {
          normalizedData: normalized as unknown as Record<string, unknown>,
          matchedItemId: resolution.matchedItemId ?? record.matchedItemId,
          errorMessage:
            "Awaiting explicit platform review before canonical publication",
          processedAt: null,
        },
      );

      summary.needsReviewCount += 1;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed while processing bulk wizard record";

      await this.repository.updateIngestionRecordStatus(
        record.id,
        "FAILED",
        {
          errorMessage: message.slice(0, 500),
          processedAt: new Date(),
        },
      );

      summary.failedCount += 1;
      summary.failedRecordIds.push(record.id);
    }
  }
}
