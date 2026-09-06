import type {
  AcquisitionRunCounters,
  AcquisitionRunStatus,
} from "../../domain/acquisition/AcquisitionContracts";
import type { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { FileSystemJsonlRepository } from "../../infrastructure/bulk-import/jsonl/JsonlRepository";
import type {
  BulkImportRunRecord,
  IBulkImportRunRepository,
} from "./RunBulkImportFile";
import { BulkImportStagingService } from "./BulkImportStagingService";

export const MAX_BULK_IMPORT_CHUNK_RECORDS = 1000;

export interface RunBulkImportChunkInput {
  sourceId: string;
  initiatedByUserId: string;

  filePath: string;
  fileName: string;

  contentHash: string;
  byteLength: number;
  recordCount: number;

  batchExternalKey: string;
  sourceNamespace?: string | null;

  chunkIndex: number;
  chunkCount: number;
}

export interface BulkImportChunkExecutionResult {
  run: BulkImportRunRecord;
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    newRecords: number;
    unchangedRecords: number;
    changedRecords: number;
    stagedRecords: number;
    publishedRecords: number;
  };
}

function emptyCounters(): AcquisitionRunCounters {
  return {
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
  };
}

export class RunBulkImportChunk {
  public constructor(
    private readonly runRepository: IBulkImportRunRepository,
    private readonly universalRepository: IUniversalLibraryRepository,
    private readonly jsonlRepository:
      FileSystemJsonlRepository =
      new FileSystemJsonlRepository(),
  ) {}

  public async execute(
    input: RunBulkImportChunkInput,
  ): Promise<BulkImportChunkExecutionResult> {
    this.validate(input);

    let run: BulkImportRunRecord | null = null;

    try {
      run = await this.runRepository.createRun({
        sourceId: input.sourceId,
        initiatedByUserId: input.initiatedByUserId,
        filePath: input.filePath,
        fileName: input.fileName,
        contentHash: input.contentHash,
        byteLength: input.byteLength,
        recordCount: input.recordCount,
        batchExternalKey: input.batchExternalKey,
        sourceNamespace:
          input.sourceNamespace ?? null,

        chunkIndex: input.chunkIndex,
        chunkCount: input.chunkCount,
        chunkRecordCount: input.recordCount,
      });

      const stagingService =
        new BulkImportStagingService(
          this.universalRepository,
        );

      const summary = await stagingService.stage(
        this.jsonlRepository.processFile(
          input.filePath,
        ),
        {
          sourceId: input.sourceId,
          acquisitionRunId: run.id,
        },
      );

      const counters =
        emptyCounters();

      counters.fetchedCount =
        summary.totalRecords;
      counters.acceptedCount =
        summary.validRecords;
      counters.stagedCount =
        summary.newRecords +
        summary.changedRecords;
      counters.duplicateCount =
        summary.unchangedRecords;
      counters.changedCount =
        summary.changedRecords;
      counters.reviewRequiredCount =
        summary.changedRecords;
      counters.publishedCount = 0;
      counters.rejectedCount =
        summary.invalidRecords;

      const status: AcquisitionRunStatus =
        summary.invalidRecords > 0
          ? "PARTIAL"
          : "COMPLETED";

      const completed =
        await this.runRepository.completeRun(
          run.id,
          status,
          counters,
        );

      if (completed.publishedCount !== 0) {
        throw new Error(
          "Bulk staging safety violation: publication occurred during chunk import.",
        );
      }

      return {
        run: completed,
        summary: {
          ...summary,
          stagedRecords:
            summary.newRecords +
            summary.changedRecords,
          publishedRecords: 0,
        },
      };
    } catch (error) {
      if (run) {
        const counters =
          emptyCounters();

        counters.fetchedCount =
          input.recordCount;
        counters.failedCount = 1;

        try {
          await this.runRepository.completeRun(
            run.id,
            "FAILED",
            counters,
            error instanceof Error
              ? error.message
              : "Bulk import chunk failed.",
          );
        } catch {
          // Preserve the original execution error.
        }
      }

      throw error;
    }
  }

  private validate(
    input: RunBulkImportChunkInput,
  ): void {
    if (!input.sourceId?.trim()) {
      throw new Error(
        "sourceId is required.",
      );
    }

    if (!input.initiatedByUserId?.trim()) {
      throw new Error(
        "initiatedByUserId is required.",
      );
    }

    if (!input.filePath?.trim()) {
      throw new Error(
        "filePath is required.",
      );
    }

    if (!input.batchExternalKey?.trim()) {
      throw new Error(
        "batchExternalKey is required.",
      );
    }

    if (
      !Number.isInteger(input.recordCount) ||
      input.recordCount < 1 ||
      input.recordCount >
        MAX_BULK_IMPORT_CHUNK_RECORDS
    ) {
      throw new Error(
        "recordCount must be between 1 and 1000.",
      );
    }

    if (
      !Number.isInteger(input.chunkCount) ||
      input.chunkCount < 1
    ) {
      throw new Error(
        "chunkCount must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(input.chunkIndex) ||
      input.chunkIndex < 1 ||
      input.chunkIndex > input.chunkCount
    ) {
      throw new Error(
        "chunkIndex must be between 1 and chunkCount.",
      );
    }

    if (
      !/^[0-9a-f]{64}$/.test(
        input.contentHash,
      )
    ) {
      throw new Error(
        "contentHash must be a SHA-256 hex digest.",
      );
    }

    if (
      !Number.isInteger(input.byteLength) ||
      input.byteLength < 1
    ) {
      throw new Error(
        "byteLength must be a positive integer.",
      );
    }
  }
}
