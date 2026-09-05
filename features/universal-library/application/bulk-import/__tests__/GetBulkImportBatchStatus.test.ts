import {
  describe,
  expect,
  it,
} from "vitest";

import {
  GetBulkImportBatchStatus,
  type IBulkImportBatchStatusRepository,
} from "../GetBulkImportBatchStatus";
import type { BulkImportRunRecord } from "../RunBulkImportFile";

function run(
  chunkIndex: number,
  chunkCount: number,
  status:
    BulkImportRunRecord["status"],
  overrides: Partial<BulkImportRunRecord> = {},
): BulkImportRunRecord {
  return {
    id:
      overrides.id ??
      `run-${chunkIndex}-${status}`,

    sourceId: "source-1",
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
      mode: "BULK_JSONL",
      batchExternalKey:
        "SECURITY_BATCH_001",
      sourceNamespace:
        "VOKA_UCL_SECURITY",
      chunk: {
        index: chunkIndex,
        count: chunkCount,
        recordCount: 1000,
      },
    },

    safeErrorSummary:
      status === "FAILED"
        ? "Injected failure"
        : null,

    startedAt:
      overrides.startedAt ??
      new Date(
        `2026-09-05T00:0${chunkIndex}:00.000Z`,
      ),

    completedAt:
      new Date(
        "2026-09-05T01:00:00.000Z",
      ),

    ...overrides,
  };
}

function repository(
  runs: BulkImportRunRecord[],
): IBulkImportBatchStatusRepository {
  return {
    async findBatchRuns() {
      return runs;
    },
  };
}

describe(
  "GetBulkImportBatchStatus",
  () => {
    it(
      "reports a fully completed logical batch",
      async () => {
        const useCase =
          new GetBulkImportBatchStatus(
            repository([
              run(
                1,
                3,
                "COMPLETED",
              ),
              run(
                2,
                3,
                "COMPLETED",
              ),
              run(
                3,
                3,
                "COMPLETED",
                {
                  requestedLimit:
                    634,
                  fetchedCount:
                    634,
                  acceptedCount:
                    634,
                  stagedCount:
                    634,
                  policySnapshot: {
                    mode:
                      "BULK_JSONL",
                    batchExternalKey:
                      "SECURITY_BATCH_001",
                    sourceNamespace:
                      "VOKA_UCL_SECURITY",
                    chunk: {
                      index: 3,
                      count: 3,
                      recordCount:
                        634,
                    },
                  },
                },
              ),
            ]),
          );

        const result =
          await useCase.execute({
            sourceId:
              "source-1",
            batchExternalKey:
              "SECURITY_BATCH_001",
            sourceNamespace:
              "VOKA_UCL_SECURITY",
          });

        expect(result).not
          .toBeNull();

        expect(result).toMatchObject({
          overallStatus:
            "COMPLETED",
          expectedChunks: 3,
          completedChunks: 3,
          partialChunks: 0,
          failedChunks: 0,
          activeChunks: 0,
          missingChunks: 0,
          retryChunkIndexes: [],
        });

        expect(
          result!.totals
            .fetchedCount,
        ).toBe(2634);

        expect(
          result!.totals
            .publishedCount,
        ).toBe(0);
      },
    );

    it(
      "detects failed and missing chunks for resume",
      async () => {
        const useCase =
          new GetBulkImportBatchStatus(
            repository([
              run(
                1,
                3,
                "COMPLETED",
              ),
              run(
                2,
                3,
                "FAILED",
              ),
            ]),
          );

        const result =
          await useCase.execute({
            sourceId:
              "source-1",
            batchExternalKey:
              "SECURITY_BATCH_001",
            sourceNamespace:
              "VOKA_UCL_SECURITY",
          });

        expect(result).toMatchObject({
          overallStatus:
            "NEEDS_ATTENTION",
          expectedChunks: 3,
          completedChunks: 1,
          failedChunks: 1,
          missingChunks: 1,
          retryChunkIndexes: [
            2,
            3,
          ],
        });

        expect(
          result!.chunks[2],
        ).toMatchObject({
          chunkIndex: 3,
          status: "MISSING",
          retryRequired: true,
        });
      },
    );

    it(
      "uses the latest attempt for a retried chunk",
      async () => {
        const older =
          run(
            2,
            2,
            "FAILED",
            {
              id: "older-failed",
              startedAt:
                new Date(
                  "2026-09-05T00:01:00.000Z",
                ),
            },
          );

        const newer =
          run(
            2,
            2,
            "COMPLETED",
            {
              id: "newer-completed",
              startedAt:
                new Date(
                  "2026-09-05T00:05:00.000Z",
                ),
            },
          );

        const useCase =
          new GetBulkImportBatchStatus(
            repository([
              run(
                1,
                2,
                "COMPLETED",
              ),
              older,
              newer,
            ]),
          );

        const result =
          await useCase.execute({
            sourceId:
              "source-1",
            batchExternalKey:
              "SECURITY_BATCH_001",
            sourceNamespace:
              "VOKA_UCL_SECURITY",
          });

        expect(
          result!.overallStatus,
        ).toBe("COMPLETED");

        expect(
          result!.chunks[1],
        ).toMatchObject({
          chunkIndex: 2,
          status: "COMPLETED",
          attemptCount: 2,
          latestRunId:
            "newer-completed",
          retryRequired: false,
        });
      },
    );

    it(
      "reports active batches as in progress",
      async () => {
        const useCase =
          new GetBulkImportBatchStatus(
            repository([
              run(
                1,
                2,
                "COMPLETED",
              ),
              run(
                2,
                2,
                "RUNNING",
              ),
            ]),
          );

        const result =
          await useCase.execute({
            sourceId:
              "source-1",
            batchExternalKey:
              "SECURITY_BATCH_001",
            sourceNamespace:
              "VOKA_UCL_SECURITY",
          });

        expect(
          result!.overallStatus,
        ).toBe(
          "IN_PROGRESS",
        );

        expect(
          result!.activeChunks,
        ).toBe(1);
      },
    );

    it(
      "fails closed if bulk status ever detects publication",
      async () => {
        const published =
          run(
            1,
            1,
            "COMPLETED",
            {
              publishedCount: 1,
            },
          );

        const useCase =
          new GetBulkImportBatchStatus(
            repository([
              published,
            ]),
          );

        await expect(
          useCase.execute({
            sourceId:
              "source-1",
            batchExternalKey:
              "SECURITY_BATCH_001",
            sourceNamespace:
              "VOKA_UCL_SECURITY",
          }),
        ).rejects.toThrow(
          "Bulk staging safety violation",
        );
      },
    );
  },
);
