import { IUniversalLibraryRepository, DEFAULT_INGESTION_BATCH_LIMIT, MAX_INGESTION_BATCH_LIMIT } from "../../domain/repositories/UniversalLibraryRepository";
import { NormalizedIngestionPayload } from "../../domain/normalization/NormalizationPipelineService";

export interface ProcessIngestionBatchParams {
  batchSize?: number;
}

export interface ProcessIngestionBatchSummary {
  processedCount: number;
  publishedCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  failedCount: number;
  recordIds: string[];
}

export class ProcessIngestionBatch {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  public async execute(params: ProcessIngestionBatchParams = {}): Promise<ProcessIngestionBatchSummary> {
    const rawBatchSize = params.batchSize ?? DEFAULT_INGESTION_BATCH_LIMIT;
    const batchSize = Math.min(Math.max(1, rawBatchSize), MAX_INGESTION_BATCH_LIMIT);

    const pendingRecords = await this.repository.getPendingIngestionRecords(batchSize);

    const summary: ProcessIngestionBatchSummary = {
      processedCount: pendingRecords.length,
      publishedCount: 0,
      needsReviewCount: 0,
      rejectedCount: 0,
      failedCount: 0,
      recordIds: [],
    };

    for (const record of pendingRecords) {
      summary.recordIds.push(record.id);

      if (record.status === "NEEDS_REVIEW") {
        summary.needsReviewCount++;
        continue;
      }

      if (record.status === "REJECTED") {
        summary.rejectedCount++;
        continue;
      }

      if (!record.normalizedData) {
        await this.repository.updateIngestionRecordStatus(record.id, "REJECTED", {
          errorMessage: "Record lacks normalizedData payload",
          processedAt: new Date(),
        });
        summary.rejectedCount++;
        continue;
      }

      try {
        const normalizedPayload = record.normalizedData as unknown as NormalizedIngestionPayload;
        await this.repository.publishIngestionRecord({
          ingestionRecordId: record.id,
          normalizedPayload,
          matchedItemId: record.matchedItemId,
        });

        summary.publishedCount++;
      } catch (err: any) {
        await this.repository.updateIngestionRecordStatus(record.id, "FAILED", {
          errorMessage: err.message || "Failed during transactional publication",
          processedAt: new Date(),
        });
        summary.failedCount++;
      }
    }

    return summary;
  }
}
