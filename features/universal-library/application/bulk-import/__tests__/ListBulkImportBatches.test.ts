import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ListBulkImportBatches,
  type IBulkImportBatchHistoryRepository,
} from "../ListBulkImportBatches";
import type { BulkImportRunRecord } from "../RunBulkImportFile";

function makeRun(
  batch: string,
  chunkIndex: number,
  chunkCount: number,
  status:
    BulkImportRunRecord["status"],
  overrides:
    Partial<BulkImportRunRecord> = {},
): BulkImportRunRecord {
  return {
    id:
      overrides.id ??
      `${batch}-${chunkIndex}-${status}`,

    sourceId:
      "source-1",
    initiatedByUserId:
      "user-1",
    dryRun: false,
    status,
    requestedLimit: 1000,

    fetchedCount: 1000,
    acceptedCount: 1000,
    stagedCount:
      status === "COMPLETED"
        ? 1000
        : 0,
    duplicateCount: 0,
    changedCount: 0,
    reviewRequiredCount: 0,
    publishedCount: 0,
    rejectedCount: 0,
    failedCount:
      status === "FAILED"
        ? 1
        : 0,
    retryCount: 0,

    policySnapshot: {
      mode:
        "BULK_JSONL",
      batchExternalKey:
        batch,
      sourceNamespace:
        "VOKA_TEST",
      fileName:
        `${batch}.jsonl`,
      chunk: {
        index:
          chunkIndex,
        count:
          chunkCount,
        recordCount:
          1000,
      },
    },

    startedAt:
      overrides.startedAt ??
      new Date(
        `2026-09-05T0${chunkIndex}:00:00.000Z`,
      ),

    completedAt:
      overrides.completedAt ??
      new Date(
        `2026-09-05T0${chunkIndex}:05:00.000Z`,
      ),

    safeErrorSummary:
      null,

    ...overrides,
  };
}

function repository(
  runs: BulkImportRunRecord[],
): IBulkImportBatchHistoryRepository {
  return {
    async findRecentBulkRuns() {
      return runs;
    },
  };
}

describe(
  "ListBulkImportBatches",
  () => {
    it(
      "groups chunk runs into logical batches",
      async () => {
        const useCase =
          new ListBulkImportBatches(
            repository([
              makeRun(
                "BATCH-1",
                1,
                2,
                "COMPLETED",
              ),
              makeRun(
                "BATCH-1",
                2,
                2,
                "COMPLETED",
              ),
              makeRun(
                "BATCH-2",
                1,
                2,
                "COMPLETED",
              ),
              makeRun(
                "BATCH-2",
                2,
                2,
                "FAILED",
              ),
            ]),
          );

        const result =
          await useCase.execute();

        expect(
          result.items,
        ).toHaveLength(2);

        expect(
          result.items.find(
            (item) =>
              item.batchExternalKey ===
              "BATCH-1",
          ),
        ).toMatchObject({
          status:
            "COMPLETED",
          expectedChunks: 2,
          completedChunks: 2,
          failedChunks: 0,
          publishedCount: 0,
        });

        expect(
          result.items.find(
            (item) =>
              item.batchExternalKey ===
              "BATCH-2",
          ),
        ).toMatchObject({
          status:
            "NEEDS_ATTENTION",
          expectedChunks: 2,
          completedChunks: 1,
          failedChunks: 1,
        });
      },
    );

    it(
      "uses latest execution counters while preserving historical staged contribution",
      async () => {
        const original =
          makeRun(
            "BATCH-1",
            1,
            1,
            "COMPLETED",
            {
              id:
                "original-success",
              stagedCount:
                1000,
              duplicateCount:
                0,
              startedAt:
                new Date(
                  "2026-09-05T01:00:00Z",
                ),
              completedAt:
                new Date(
                  "2026-09-05T01:01:00Z",
                ),
            },
          );

        const unchangedRetry =
          makeRun(
            "BATCH-1",
            1,
            1,
            "COMPLETED",
            {
              id:
                "unchanged-retry",
              stagedCount:
                0,
              duplicateCount:
                1000,
              startedAt:
                new Date(
                  "2026-09-05T02:00:00Z",
                ),
              completedAt:
                new Date(
                  "2026-09-05T02:01:00Z",
                ),
            },
          );

        const useCase =
          new ListBulkImportBatches(
            repository([
              original,
              unchangedRetry,
            ]),
          );

        const result =
          await useCase.execute();

        expect(
          result.items[0],
        ).toMatchObject({
          status:
            "COMPLETED",
          completedChunks: 1,
          failedChunks: 0,

          // Execution truth comes from the latest attempt.
          stagedCount: 0,
          duplicateCount: 1000,

          // Historical batch contribution is not erased by an unchanged retry.
          stagedContributionCount: 1000,
        });
      },
    );
it(
      "fails closed if publication is detected",
      async () => {
        const useCase =
          new ListBulkImportBatches(
            repository([
              makeRun(
                "BATCH-1",
                1,
                1,
                "COMPLETED",
                {
                  publishedCount:
                    1,
                },
              ),
            ]),
          );

        await expect(
          useCase.execute(),
        ).rejects.toThrow(
          "Bulk staging safety violation",
        );
      },
    );
  },
);
