import type {
  AcquisitionRunCounters,
  AcquisitionRunStatus,
} from "../../domain/acquisition/AcquisitionContracts";
import type { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { FileSystemJsonlRepository } from "../../infrastructure/bulk-import/jsonl/JsonlRepository";
import type { JsonlParseResult } from "../../infrastructure/bulk-import/jsonl/JsonlProcessor";
import { BulkImportStagingService } from "./BulkImportStagingService";

export const BULK_IMPORT_CHUNK_SIZE = 1000;

export interface BulkImportRunMetadata {
  sourceId: string;
  initiatedByUserId: string;
  filePath: string;
  fileName: string;
  contentHash: string;
  byteLength: number;
  recordCount: number;
  batchExternalKey?: string | null;
  sourceNamespace?: string | null;
}

export interface BulkImportChunkRunMetadata extends BulkImportRunMetadata {
  chunkIndex: number;
  chunkCount: number;
  chunkRecordCount: number;
}

export interface BulkImportRunRecord extends AcquisitionRunCounters {
  id: string;
  sourceId: string;
  initiatedByUserId: string;
  dryRun: boolean;
  status: AcquisitionRunStatus;
  requestedLimit: number;
  policySnapshot: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date | null;
  safeErrorSummary?: string | null;
}

export interface IBulkImportRunRepository {
  createRun(
    input: BulkImportChunkRunMetadata,
  ): Promise<BulkImportRunRecord>;

  completeRun(
    id: string,
    status: AcquisitionRunStatus,
    counters: AcquisitionRunCounters,
    safeErrorSummary?: string,
  ): Promise<BulkImportRunRecord>;
}

export interface BulkImportExecutionSummary {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  newRecords: number;
  unchangedRecords: number;
  changedRecords: number;
  stagedRecords: number;
  publishedRecords: number;
  completedChunks: number;
  partialChunks: number;
  failedChunks: number;
  chunkCount: number;
}

export interface BulkImportExecutionResult {
  runs: BulkImportRunRecord[];
  summary: BulkImportExecutionSummary;
  errors: Array<{
    chunkIndex: number;
    message: string;
  }>;
}

const emptyCounters = (): AcquisitionRunCounters => ({
  fetchedCount: 0,
  acceptedCount: 0,
  stagedCount: 0,
  duplicateCount: 0,
  changedCount: 0,
  reviewRequiredCount: 0,
  publishedCount: 0,
  rejectedCount: 0,
  failedCount: 0,
  retryCount: 0,
});

async function* recordsFromChunk(
  chunk: JsonlParseResult[],
): AsyncIterable<JsonlParseResult> {
  for (const record of chunk) {
    yield record;
  }
}

async function* chunkRecords(
  records: AsyncIterable<JsonlParseResult>,
  chunkSize: number,
): AsyncIterable<JsonlParseResult[]> {
  let chunk: JsonlParseResult[] = [];

  for await (const record of records) {
    chunk.push(record);

    if (chunk.length >= chunkSize) {
      yield chunk;
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}

export class RunBulkImportFile {
  public constructor(
    private readonly runRepository: IBulkImportRunRepository,
    private readonly universalRepository: IUniversalLibraryRepository,
    private readonly jsonlRepository: FileSystemJsonlRepository = new FileSystemJsonlRepository(),
  ) {}

  public async execute(
    input: BulkImportRunMetadata,
  ): Promise<BulkImportExecutionResult> {
    if (!input.sourceId?.trim()) {
      throw new Error("sourceId is required.");
    }

    if (!input.initiatedByUserId?.trim()) {
      throw new Error("initiatedByUserId is required.");
    }

    if (!input.filePath?.trim()) {
      throw new Error("filePath is required.");
    }

    if (!Number.isInteger(input.recordCount) || input.recordCount < 1) {
      throw new Error("recordCount must be a positive integer.");
    }

    const expectedChunkCount = Math.ceil(
      input.recordCount / BULK_IMPORT_CHUNK_SIZE,
    );

    const runs: BulkImportRunRecord[] = [];
    const errors: Array<{
      chunkIndex: number;
      message: string;
    }> = [];

    const aggregate: BulkImportExecutionSummary = {
      totalRecords: 0,
      validRecords: 0,
      invalidRecords: 0,
      newRecords: 0,
      unchangedRecords: 0,
      changedRecords: 0,
      stagedRecords: 0,
      publishedRecords: 0,
      completedChunks: 0,
      partialChunks: 0,
      failedChunks: 0,
      chunkCount: expectedChunkCount,
    };

    let chunkIndex = 0;

    const parsedRecords =
      this.jsonlRepository.processFile(input.filePath);

    for await (const chunk of chunkRecords(
      parsedRecords,
      BULK_IMPORT_CHUNK_SIZE,
    )) {
      chunkIndex += 1;

      let run: BulkImportRunRecord | null = null;

      try {
        run = await this.runRepository.createRun({
          ...input,
          chunkIndex,
          chunkCount: expectedChunkCount,
          chunkRecordCount: chunk.length,
        });

        const stagingService = new BulkImportStagingService(
          this.universalRepository,
        );

        const summary = await stagingService.stage(
          recordsFromChunk(chunk),
          {
            sourceId: input.sourceId,
            acquisitionRunId: run.id,
          },
        );

        const counters = emptyCounters();

        counters.fetchedCount = summary.totalRecords;
        counters.acceptedCount = summary.validRecords;
        counters.stagedCount =
          summary.newRecords + summary.changedRecords;
        counters.duplicateCount =
          summary.unchangedRecords;
        counters.changedCount = summary.changedRecords;
        counters.reviewRequiredCount =
          summary.changedRecords;
        counters.publishedCount = 0;
        counters.rejectedCount =
          summary.invalidRecords;

        const status: AcquisitionRunStatus =
          summary.invalidRecords > 0
            ? "PARTIAL"
            : "COMPLETED";

        const completedRun =
          await this.runRepository.completeRun(
            run.id,
            status,
            counters,
          );

        runs.push(completedRun);

        aggregate.totalRecords +=
          summary.totalRecords;
        aggregate.validRecords +=
          summary.validRecords;
        aggregate.invalidRecords +=
          summary.invalidRecords;
        aggregate.newRecords +=
          summary.newRecords;
        aggregate.unchangedRecords +=
          summary.unchangedRecords;
        aggregate.changedRecords +=
          summary.changedRecords;
        aggregate.stagedRecords +=
          summary.newRecords +
          summary.changedRecords;

        if (status === "PARTIAL") {
          aggregate.partialChunks += 1;
        } else {
          aggregate.completedChunks += 1;
        }
      } catch (error) {
        aggregate.failedChunks += 1;

        const message =
          error instanceof Error
            ? error.message
            : "Bulk import chunk failed.";

        errors.push({
          chunkIndex,
          message,
        });

        if (run) {
          const failedCounters = emptyCounters();

          failedCounters.fetchedCount =
            chunk.length;
          failedCounters.failedCount = 1;

          try {
            const failedRun =
              await this.runRepository.completeRun(
                run.id,
                "FAILED",
                failedCounters,
                message,
              );

            runs.push(failedRun);
          } catch (completionError) {
            errors.push({
              chunkIndex,
              message:
                completionError instanceof Error
                  ? `Failed to close chunk run: ${completionError.message}`
                  : "Failed to close chunk run.",
            });
          }
        }

        // Deliberately continue.
        // One failed chunk must never block later chunks.
      }
    }

    aggregate.publishedRecords = runs.reduce(
      (total, run) =>
        total + run.publishedCount,
      0,
    );

    if (aggregate.publishedRecords !== 0) {
      throw new Error(
        "Bulk staging safety violation: publication occurred during bulk import.",
      );
    }

    return {
      runs,
      summary: aggregate,
      errors,
    };
  }
}
