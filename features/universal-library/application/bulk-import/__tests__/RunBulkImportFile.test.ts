import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BULK_IMPORT_CHUNK_SIZE,
  RunBulkImportFile,
  type BulkImportChunkRunMetadata,
  type BulkImportRunRecord,
  type IBulkImportRunRepository,
} from "../RunBulkImportFile";
import { BulkImportStagingService } from "../BulkImportStagingService";

function makeRun(
  id: string,
  input: BulkImportChunkRunMetadata,
): BulkImportRunRecord {
  return {
    id,
    sourceId: input.sourceId,
    initiatedByUserId: input.initiatedByUserId,
    dryRun: false,
    status: "RUNNING",
    requestedLimit: input.chunkRecordCount,
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
    policySnapshot: {
      chunk: {
        index: input.chunkIndex,
        count: input.chunkCount,
        recordCount: input.chunkRecordCount,
      },
    },
    startedAt: new Date("2026-09-05T00:00:00.000Z"),
    completedAt: null,
    safeErrorSummary: null,
  };
}

function makeRunRepository() {
  const created: BulkImportChunkRunMetadata[] = [];
  const completed: Array<{
    id: string;
    status: string;
    counters: any;
  }> = [];

  const runs = new Map<string, BulkImportRunRecord>();

  const repository: IBulkImportRunRepository = {
    async createRun(input) {
      created.push(input);

      const run = makeRun(
        `run-${input.chunkIndex}`,
        input,
      );

      runs.set(run.id, run);
      return run;
    },

    async completeRun(
      id,
      status,
      counters,
      safeErrorSummary,
    ) {
      completed.push({
        id,
        status,
        counters,
      });

      const existing = runs.get(id);

      if (!existing) {
        throw new Error(`Missing run ${id}`);
      }

      const updated: BulkImportRunRecord = {
        ...existing,
        ...counters,
        status,
        safeErrorSummary:
          safeErrorSummary ?? null,
        completedAt: new Date(
          "2026-09-05T00:01:00.000Z",
        ),
      };

      runs.set(id, updated);
      return updated;
    },
  };

  return {
    repository,
    created,
    completed,
  };
}

function makeJsonlRepository(recordCount: number) {
  return {
    async *processFile() {
      for (let index = 0; index < recordCount; index += 1) {
        yield {
          lineNumber: index + 1,
          valid: true,
          record: {},
        } as any;
      }
    },
  } as any;
}

function makeInput(recordCount: number) {
  return {
    sourceId: "source-1",
    initiatedByUserId: "user-1",
    filePath: "C:\\tmp\\batch.jsonl",
    fileName: "batch.jsonl",
    contentHash:
      "a".repeat(64),
    byteLength: 123456,
    recordCount,
    batchExternalKey: "BATCH-001",
    sourceNamespace: "VOKA_TEST",
  };
}

describe("RunBulkImportFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("splits 2634 records into 1000, 1000, and 634 independent runs", async () => {
    const runRepository =
      makeRunRepository();

    vi.spyOn(
      BulkImportStagingService.prototype,
      "stage",
    )
      .mockResolvedValueOnce({
        totalRecords: 1000,
        validRecords: 1000,
        invalidRecords: 0,
        newRecords: 1000,
        unchangedRecords: 0,
        changedRecords: 0,
      } as any)
      .mockResolvedValueOnce({
        totalRecords: 1000,
        validRecords: 1000,
        invalidRecords: 0,
        newRecords: 1000,
        unchangedRecords: 0,
        changedRecords: 0,
      } as any)
      .mockResolvedValueOnce({
        totalRecords: 634,
        validRecords: 634,
        invalidRecords: 0,
        newRecords: 634,
        unchangedRecords: 0,
        changedRecords: 0,
      } as any);

    const runner = new RunBulkImportFile(
      runRepository.repository,
      {} as any,
      makeJsonlRepository(2634),
    );

    const result = await runner.execute(
      makeInput(2634),
    );

    expect(BULK_IMPORT_CHUNK_SIZE).toBe(1000);

    expect(
      runRepository.created.map(
        (input) => input.chunkRecordCount,
      ),
    ).toEqual([1000, 1000, 634]);

    expect(
      runRepository.created.map(
        (input) => input.chunkIndex,
      ),
    ).toEqual([1, 2, 3]);

    expect(
      runRepository.created.every(
        (input) => input.chunkCount === 3,
      ),
    ).toBe(true);

    expect(result.summary).toMatchObject({
      totalRecords: 2634,
      validRecords: 2634,
      invalidRecords: 0,
      newRecords: 2634,
      unchangedRecords: 0,
      changedRecords: 0,
      stagedRecords: 2634,
      publishedRecords: 0,
      completedChunks: 3,
      partialChunks: 0,
      failedChunks: 0,
      chunkCount: 3,
    });

    expect(result.errors).toEqual([]);
  });

  it("continues to later chunks when the middle chunk fails", async () => {
    const runRepository =
      makeRunRepository();

    vi.spyOn(
      BulkImportStagingService.prototype,
      "stage",
    )
      .mockResolvedValueOnce({
        totalRecords: 1000,
        validRecords: 1000,
        invalidRecords: 0,
        newRecords: 1000,
        unchangedRecords: 0,
        changedRecords: 0,
      } as any)
      .mockRejectedValueOnce(
        new Error("Injected chunk failure"),
      )
      .mockResolvedValueOnce({
        totalRecords: 634,
        validRecords: 634,
        invalidRecords: 0,
        newRecords: 634,
        unchangedRecords: 0,
        changedRecords: 0,
      } as any);

    const runner = new RunBulkImportFile(
      runRepository.repository,
      {} as any,
      makeJsonlRepository(2634),
    );

    const result = await runner.execute(
      makeInput(2634),
    );

    expect(runRepository.created).toHaveLength(3);

    expect(
      result.runs.map((run) => run.status),
    ).toEqual([
      "COMPLETED",
      "FAILED",
      "COMPLETED",
    ]);

    expect(result.summary.completedChunks).toBe(2);
    expect(result.summary.failedChunks).toBe(1);

    expect(result.errors).toEqual([
      {
        chunkIndex: 2,
        message: "Injected chunk failure",
      },
    ]);

    expect(
      runRepository.completed.some(
        (entry) =>
          entry.id === "run-3" &&
          entry.status === "COMPLETED",
      ),
    ).toBe(true);
  });

  it("supports an idempotent unchanged pass without staging duplicates", async () => {
    const runRepository =
      makeRunRepository();

    vi.spyOn(
      BulkImportStagingService.prototype,
      "stage",
    )
      .mockResolvedValueOnce({
        totalRecords: 1000,
        validRecords: 1000,
        invalidRecords: 0,
        newRecords: 0,
        unchangedRecords: 1000,
        changedRecords: 0,
      } as any)
      .mockResolvedValueOnce({
        totalRecords: 1000,
        validRecords: 1000,
        invalidRecords: 0,
        newRecords: 0,
        unchangedRecords: 1000,
        changedRecords: 0,
      } as any)
      .mockResolvedValueOnce({
        totalRecords: 634,
        validRecords: 634,
        invalidRecords: 0,
        newRecords: 0,
        unchangedRecords: 634,
        changedRecords: 0,
      } as any);

    const runner = new RunBulkImportFile(
      runRepository.repository,
      {} as any,
      makeJsonlRepository(2634),
    );

    const result = await runner.execute(
      makeInput(2634),
    );

    expect(result.summary).toMatchObject({
      totalRecords: 2634,
      validRecords: 2634,
      newRecords: 0,
      unchangedRecords: 2634,
      changedRecords: 0,
      stagedRecords: 0,
      publishedRecords: 0,
      completedChunks: 3,
      failedChunks: 0,
    });

    expect(
      result.runs.reduce(
        (total, run) =>
          total + run.duplicateCount,
        0,
      ),
    ).toBe(2634);
  });

  it("fails closed if any bulk run reports publication", async () => {
    const base =
      makeRunRepository();

    const unsafeRepository: IBulkImportRunRepository = {
      ...base.repository,

      async completeRun(
        id,
        status,
        counters,
        safeErrorSummary,
      ) {
        const run =
          await base.repository.completeRun(
            id,
            status,
            counters,
            safeErrorSummary,
          );

        if (status === "COMPLETED") {
          return {
            ...run,
            publishedCount: 1,
          };
        }

        return run;
      },
    };

    vi.spyOn(
      BulkImportStagingService.prototype,
      "stage",
    ).mockResolvedValue({
      totalRecords: 10,
      validRecords: 10,
      invalidRecords: 0,
      newRecords: 10,
      unchangedRecords: 0,
      changedRecords: 0,
    } as any);

    const runner = new RunBulkImportFile(
      unsafeRepository,
      {} as any,
      makeJsonlRepository(10),
    );

    await expect(
      runner.execute(makeInput(10)),
    ).rejects.toThrow(
      "Bulk staging safety violation: publication occurred during bulk import.",
    );
  });
});
