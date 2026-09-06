import { IUniversalLibraryRepository, DEFAULT_INGESTION_BATCH_LIMIT, MAX_INGESTION_BATCH_LIMIT } from "../../domain/repositories/UniversalLibraryRepository";

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
    if (!Number.isInteger(rawBatchSize) || rawBatchSize < 1 || rawBatchSize > MAX_INGESTION_BATCH_LIMIT) {
      throw new Error(`batchSize must be an integer between 1 and ${MAX_INGESTION_BATCH_LIMIT}`);
    }
    const batchSize = rawBatchSize;

    const pendingRecords = await this.repository.claimPendingIngestionRecords(batchSize);

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

      if (!record.normalizedData) {
        await this.repository.updateIngestionRecordStatus(record.id, "FAILED", {
          errorMessage: "Record lacks normalizedData payload",
          processedAt: new Date(),
        });
        summary.failedCount++;
        continue;
      }

      try {
        await this.repository.updateIngestionRecordStatus(
          record.id,
          "NEEDS_REVIEW",
          {
            errorMessage:
              "Awaiting explicit platform review before canonical publication",
            processedAt: null,
          },
        );

        summary.needsReviewCount++;
      } catch (err: any) {
        await this.repository.updateIngestionRecordStatus(record.id, "FAILED", {
          errorMessage:
            err.message || "Failed while routing record to review",
          processedAt: new Date(),
        });

        summary.failedCount++;
      }
    }

    return summary;
  }
}
