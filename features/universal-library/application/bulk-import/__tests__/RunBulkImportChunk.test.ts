import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  MAX_BULK_IMPORT_CHUNK_RECORDS,
  RunBulkImportChunk,
} from "../RunBulkImportChunk";
import { BulkImportStagingService } from "../BulkImportStagingService";
import type {
  BulkImportChunkRunMetadata,
  BulkImportRunRecord,
  IBulkImportRunRepository,
} from "../RunBulkImportFile";

function runRecord(
  input: BulkImportChunkRunMetadata,
): BulkImportRunRecord {
  return {
    id: `run-${input.chunkIndex}`,
    sourceId: input.sourceId,
    initiatedByUserId:
      input.initiatedByUserId,
    dryRun: false,
    status: "RUNNING",
    requestedLimit:
      input.chunkRecordCount,
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
      batchExternalKey:
        input.batchExternalKey,
      chunk: {
        index: input.chunkIndex,
        count: input.chunkCount,
        recordCount:
          input.chunkRecordCount,
      },
    },
    startedAt: new Date(
      "2026-09-05T00:00:00.000Z",
    ),
    completedAt: null,
    safeErrorSummary: null,
  };
}

function repository() {
  const created:
    BulkImportChunkRunMetadata[] = [];

  const completed: Array<{
    status: string;
    run: BulkImportRunRecord;
  }> = [];

  const runs =
    new Map<
      string,
      BulkImportRunRecord
    >();

  const repo:
    IBulkImportRunRepository = {
    async createRun(input) {
      created.push(input);

      const run =
        runRecord(input);

      runs.set(run.id, run);

      return run;
    },

    async completeRun(
      id,
      status,
      counters,
      safeErrorSummary,
    ) {
      const current =
        runs.get(id);

      if (!current) {
        throw new Error(
          `Unknown run ${id}`,
        );
      }

      const updated = {
        ...current,
        ...counters,
        status,
        safeErrorSummary:
          safeErrorSummary ?? null,
        completedAt: new Date(
          "2026-09-05T00:01:00.000Z",
        ),
      } as BulkImportRunRecord;

      runs.set(id, updated);

      completed.push({
        status,
        run: updated,
      });

      return updated;
    },
  };

  return {
    repo,
    created,
    completed,
  };
}

function jsonlRepository() {
  return {
    async *processFile() {
      yield {
        lineNumber: 1,
        valid: true,
        record: {},
      };
    },
  } as any;
}

function input(
  overrides: Record<
    string,
    unknown
  > = {},
) {
  return {
    sourceId: "source-1",
    initiatedByUserId:
      "user-1",

    filePath:
      "C:\\tmp\\chunk-2.jsonl",
    fileName:
      "chunk-2.jsonl",

    contentHash:
      "a".repeat(64),
    byteLength: 100,
    recordCount: 634,

    batchExternalKey:
      "SECURITY_BATCH_001",
    sourceNamespace:
      "VOKA_UCL_SECURITY",

    chunkIndex: 3,
    chunkCount: 3,

    ...overrides,
  };
}

describe(
  "RunBulkImportChunk",
  () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it(
      "stages one bounded logical chunk",
      async () => {
        const state =
          repository();

        vi.spyOn(
          BulkImportStagingService
            .prototype,
          "stage",
        ).mockResolvedValue({
          totalRecords: 634,
          validRecords: 634,
          invalidRecords: 0,
          newRecords: 634,
          unchangedRecords: 0,
          changedRecords: 0,
        } as any);

        const runner =
          new RunBulkImportChunk(
            state.repo,
            {} as any,
            jsonlRepository(),
          );

        const result =
          await runner.execute(
            input(),
          );

        expect(
          MAX_BULK_IMPORT_CHUNK_RECORDS,
        ).toBe(1000);

        expect(
          state.created,
        ).toHaveLength(1);

        expect(
          state.created[0],
        ).toMatchObject({
          batchExternalKey:
            "SECURITY_BATCH_001",
          chunkIndex: 3,
          chunkCount: 3,
          chunkRecordCount: 634,
        });

        expect(
          result.run.status,
        ).toBe("COMPLETED");

        expect(
          result.summary,
        ).toMatchObject({
          totalRecords: 634,
          validRecords: 634,
          newRecords: 634,
          stagedRecords: 634,
          publishedRecords: 0,
        });
      },
    );

    it(
      "rejects chunks larger than 1000 records",
      async () => {
        const state =
          repository();

        const runner =
          new RunBulkImportChunk(
            state.repo,
            {} as any,
            jsonlRepository(),
          );

        await expect(
          runner.execute(
            input({
              recordCount: 1001,
            }),
          ),
        ).rejects.toThrow(
          "recordCount must be between 1 and 1000.",
        );

        expect(
          state.created,
        ).toHaveLength(0);
      },
    );

    it(
      "rejects invalid logical chunk coordinates",
      async () => {
        const state =
          repository();

        const runner =
          new RunBulkImportChunk(
            state.repo,
            {} as any,
            jsonlRepository(),
          );

        await expect(
          runner.execute(
            input({
              chunkIndex: 4,
              chunkCount: 3,
            }),
          ),
        ).rejects.toThrow(
          "chunkIndex must be between 1 and chunkCount.",
        );

        expect(
          state.created,
        ).toHaveLength(0);
      },
    );

    it(
      "marks a failed chunk without affecting another request",
      async () => {
        const state =
          repository();

        vi.spyOn(
          BulkImportStagingService
            .prototype,
          "stage",
        ).mockRejectedValue(
          new Error(
            "Injected staging failure",
          ),
        );

        const runner =
          new RunBulkImportChunk(
            state.repo,
            {} as any,
            jsonlRepository(),
          );

        await expect(
          runner.execute(
            input(),
          ),
        ).rejects.toThrow(
          "Injected staging failure",
        );

        expect(
          state.completed.some(
            (entry) =>
              entry.status ===
              "FAILED",
          ),
        ).toBe(true);
      },
    );

    it(
      "supports an unchanged retry without staging a duplicate",
      async () => {
        const state =
          repository();

        vi.spyOn(
          BulkImportStagingService
            .prototype,
          "stage",
        ).mockResolvedValue({
          totalRecords: 634,
          validRecords: 634,
          invalidRecords: 0,
          newRecords: 0,
          unchangedRecords: 634,
          changedRecords: 0,
        } as any);

        const runner =
          new RunBulkImportChunk(
            state.repo,
            {} as any,
            jsonlRepository(),
          );

        const result =
          await runner.execute(
            input(),
          );

        expect(
          result.summary
            .unchangedRecords,
        ).toBe(634);

        expect(
          result.summary
            .stagedRecords,
        ).toBe(0);

        expect(
          result.summary
            .publishedRecords,
        ).toBe(0);
      },
    );
  },
);
