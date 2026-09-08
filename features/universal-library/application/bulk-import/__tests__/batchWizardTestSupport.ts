import {
  UniversalCatalogItem,
  UniversalIngestionRecord,
  UniversalSource,
  type BulkWizardRecordCounts,
  type IUniversalLibraryRepository,
  emptyBulkWizardRecordCounts,
} from "../../../domain";
import type { BulkImportRunRecord } from "../RunBulkImportFile";
import type { IBulkImportBatchStatusRepository } from "../GetBulkImportBatchStatus";

export function bulkRun(
  overrides: Partial<BulkImportRunRecord> = {},
): BulkImportRunRecord {
  return {
    id: "run-1",
    sourceId: "source-1",
    initiatedByUserId: "user-1",
    dryRun: false,
    status: "COMPLETED",
    requestedLimit: 2,
    fetchedCount: 2,
    acceptedCount: 2,
    stagedCount: 2,
    duplicateCount: 0,
    changedCount: 0,
    reviewRequiredCount: 0,
    publishedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    retryCount: 0,
    policySnapshot: {
      mode: "BULK_JSONL",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
      chunk: {
        index: 1,
        count: 1,
        recordCount: 2,
      },
    },
    safeErrorSummary: null,
    startedAt: new Date("2026-09-08T00:00:00.000Z"),
    completedAt: new Date("2026-09-08T00:01:00.000Z"),
    ...overrides,
  };
}

export function ingestion(
  overrides: Partial<UniversalIngestionRecord> = {},
): UniversalIngestionRecord {
  return new UniversalIngestionRecord({
    id: "rec-1",
    sourceId: "source-1",
    sourceExternalId: "ext-1",
    entityType: "PRODUCT_MODEL",
    rawPayload: {
      schemaVersion: "1.0",
      entityType: "PRODUCT_MODEL",
      externalKey: "ext-1",
      payload: {
        name: "Wizard Camera",
        manufacturerName: "Hikvision",
        modelNumber: "DS-TEST",
      },
    },
    payloadHash: "hash-1",
    status: "RECEIVED",
    normalizedData: null,
    matchedItemId: null,
    errorMessage: null,
    retryCount: 0,
    processingStartedAt: null,
    processedAt: null,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    acquisitionRunId: "run-1",
    ...overrides,
  });
}

export class InMemoryBulkWizardRepository
  implements Partial<IUniversalLibraryRepository>
{
  public sources = new Map<string, UniversalSource>();
  public records = new Map<string, UniversalIngestionRecord>();
  public items = new Map<string, UniversalCatalogItem>();
  public identifierLookupError: Error | null = null;
  public identifierLookupFailuresRemaining = 0;

  public async getSourceById(sourceId: string) {
    return this.sources.get(sourceId) ?? null;
  }

  public async getIngestionRecordBySourceExternalId(
    sourceId: string,
    sourceExternalId: string,
  ) {
    for (const record of this.records.values()) {
      if (
        record.sourceId === sourceId &&
        record.sourceExternalId === sourceExternalId
      ) {
        return record;
      }
    }
    return null;
  }

  public async getItemById(id: string) {
    return this.items.get(id) ?? null;
  }

  public async findActiveItemIdsByIdentifier() {
    if (
      this.identifierLookupError &&
      this.identifierLookupFailuresRemaining > 0
    ) {
      this.identifierLookupFailuresRemaining -= 1;
      throw this.identifierLookupError;
    }
    return [];
  }

  public async findActiveItemIdsByManufacturerIdentifier() {
    return [];
  }

  public async findActiveItemIdsByManufacturerModel() {
    return [];
  }

  public async findActiveItemIdsByName() {
    return [];
  }

  public async saveIngestionRecord(input: any) {
    const existing = await this.getIngestionRecordBySourceExternalId(
      input.sourceId,
      input.sourceExternalId,
    );

    const record = new UniversalIngestionRecord({
      id:
        existing?.id ||
        `rec-${this.records.size + 1}-${Math.random().toString(36).slice(2, 7)}`,
      sourceId: input.sourceId,
      sourceExternalId: input.sourceExternalId,
      entityType: input.entityType || "ITEM",
      rawPayload: input.rawPayload,
      payloadHash: input.payloadHash,
      status: input.status,
      normalizedData: input.normalizedData ?? null,
      matchedItemId: input.matchedItemId ?? null,
      errorMessage: input.errorMessage ?? null,
      retryCount: 0,
      processingStartedAt: null,
      processedAt: null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
      acquisitionRunId: input.acquisitionRunId ?? existing?.acquisitionRunId,
    });

    this.records.set(record.id, record);
    return record;
  }

  public async claimBulkWizardIngestionRecords(
    acquisitionRunIds: string[],
    limit = 50,
    excludeRecordIds: string[] = [],
  ) {
    const claimed: UniversalIngestionRecord[] = [];
    const runSet = new Set(acquisitionRunIds);
    const excluded = new Set(excludeRecordIds);

    for (const record of this.records.values()) {
      if (claimed.length >= limit) {
        break;
      }

      if (excluded.has(record.id)) {
        continue;
      }

      if (
        !record.acquisitionRunId ||
        !runSet.has(record.acquisitionRunId)
      ) {
        continue;
      }

      const incompleteReview =
        record.status === "NEEDS_REVIEW" && !record.normalizedData;

      const processable = [
        "RECEIVED",
        "NORMALIZED",
        "MATCHED",
        "FAILED",
      ].includes(record.status);

      if (!processable && !incompleteReview) {
        continue;
      }

      const next = new UniversalIngestionRecord({
        ...record,
        status: "PROCESSING",
        processingStartedAt: new Date(),
        retryCount: record.retryCount + 1,
        updatedAt: new Date(),
      });

      this.records.set(next.id, next);
      claimed.push(next);
    }

    return claimed;
  }

  public async countBulkWizardIngestionRecords(
    acquisitionRunIds: string[],
  ): Promise<BulkWizardRecordCounts> {
    const runSet = new Set(acquisitionRunIds);
    const counts = emptyBulkWizardRecordCounts();

    for (const record of this.records.values()) {
      if (
        !record.acquisitionRunId ||
        !runSet.has(record.acquisitionRunId)
      ) {
        continue;
      }

      counts.total += 1;

      switch (record.status) {
        case "RECEIVED":
          counts.received += 1;
          break;
        case "NORMALIZED":
          counts.normalized += 1;
          break;
        case "MATCHED":
          counts.matched += 1;
          break;
        case "PROCESSING":
          counts.processing += 1;
          break;
        case "NEEDS_REVIEW":
          counts.needsReview += 1;
          if (!record.normalizedData) {
            counts.incompleteReview += 1;
          }
          break;
        case "PUBLISHED":
          counts.published += 1;
          break;
        case "REJECTED":
          counts.rejected += 1;
          break;
        case "FAILED":
          counts.failed += 1;
          break;
        default:
          break;
      }
    }

    return counts;
  }

  public async updateIngestionRecordStatus(
    id: string,
    status: any,
    extra?: any,
  ) {
    const existing = this.records.get(id);
    if (!existing) {
      throw new Error("Record not found");
    }

    const updated = new UniversalIngestionRecord({
      ...existing,
      status,
      normalizedData:
        extra?.normalizedData !== undefined
          ? extra.normalizedData
          : existing.normalizedData,
      matchedItemId:
        extra?.matchedItemId !== undefined
          ? extra.matchedItemId
          : existing.matchedItemId,
      errorMessage:
        extra?.errorMessage !== undefined
          ? extra.errorMessage
          : existing.errorMessage,
      processedAt:
        extra?.processedAt !== undefined
          ? extra.processedAt
          : existing.processedAt,
      updatedAt: new Date(),
    });

    this.records.set(id, updated);
    return updated;
  }

  public async publishIngestionRecord(input: any) {
    const rec = this.records.get(input.ingestionRecordId);
    if (!rec) {
      throw new Error("Record not found");
    }
    if (rec.status !== "NEEDS_REVIEW") {
      throw new Error("Record is not awaiting review");
    }
    if (!rec.normalizedData) {
      throw new Error("Reviewed ingestion record has no normalized payload.");
    }

    const item = new UniversalCatalogItem({
      id: `item-${rec.id}`,
      type: "PRODUCT",
      name: (rec.normalizedData as any).name,
      nameAr: null,
      nameEn: null,
      searchName: String((rec.normalizedData as any).name).toLowerCase(),
      description: null,
      descriptionAr: null,
      descriptionEn: null,
      categoryId: null,
      manufacturerId: null,
      brandId: null,
      familyId: null,
      modelNumber: (rec.normalizedData as any).modelNumber ?? null,
      variantName: null,
      parentId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.items.set(item.id, item);

    await this.updateIngestionRecordStatus(rec.id, "PUBLISHED", {
      matchedItemId: item.id,
      processedAt: new Date(),
      errorMessage: null,
    });

    return { item, isNewItem: true };
  }

  public async rejectIngestionRecord(input: any) {
    return this.updateIngestionRecordStatus(
      input.ingestionRecordId,
      "REJECTED",
      {
        processedAt: new Date(),
        errorMessage: input.reviewNote ?? "Rejected",
      },
    );
  }
}

export function batchStatusRepository(
  runs: BulkImportRunRecord[],
): IBulkImportBatchStatusRepository {
  return {
    async findBatchRuns() {
      return runs;
    },
  };
}
