import type { BulkImportRunRecord } from "./RunBulkImportFile";
import type { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { awaitingBulkWizardProcess } from "../../domain/bulk-import/BatchWizardContract";

export interface BulkImportBatchHistoryQuery {
  limit?: number;
  sourceId?: string;
}

export interface IBulkImportBatchHistoryRepository {
  findRecentBulkRuns(
    input: {
      limit: number;
      sourceId?: string;
    },
  ): Promise<BulkImportRunRecord[]>;
}

export interface BulkImportBatchHistoryItem {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace: string | null;

  fileName: string | null;

  status:
    | "COMPLETED"
    | "IN_PROGRESS"
    | "NEEDS_ATTENTION"
    | "READY_TO_PROCESS"
    | "IN_REVIEW"
    | "FAILED";

  uploadStatus?:
    | "COMPLETED"
    | "IN_PROGRESS"
    | "NEEDS_ATTENTION";

  journeyStatus?:
    | "READY_TO_PROCESS"
    | "IN_REVIEW"
    | "COMPLETE"
    | "FAILED"
    | "NEEDS_ATTENTION"
    | "IN_PROGRESS";

  expectedChunks: number;
  completedChunks: number;
  partialChunks: number;
  failedChunks: number;
  activeChunks: number;

  fetchedCount: number;
  stagedCount: number;
  stagedContributionCount: number;
  duplicateCount: number;
  changedCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  publishedCount: number;

  firstStartedAt: Date;
  lastActivityAt: Date;
}

export interface BulkImportBatchHistoryResult {
  items: BulkImportBatchHistoryItem[];
  total: number;
}

function stringValue(
  snapshot: Record<string, unknown>,
  key: string,
): string | null {
  const value = snapshot[key];

  return typeof value === "string"
    ? value
    : null;
}

function chunkMetadata(
  run: BulkImportRunRecord,
): {
  index: number;
  count: number;
} | null {
  const raw =
    run.policySnapshot.chunk;

  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const chunk =
    raw as Record<string, unknown>;

  if (
    !Number.isInteger(chunk.index) ||
    !Number.isInteger(chunk.count)
  ) {
    return null;
  }

  const index =
    Number(chunk.index);

  const count =
    Number(chunk.count);

  if (
    index < 1 ||
    count < 1 ||
    index > count
  ) {
    return null;
  }

  return {
    index,
    count,
  };
}

function latestAttempt(
  runs: BulkImportRunRecord[],
): BulkImportRunRecord {
  return [...runs].sort(
    (left, right) => {
      const rightTime =
        (
          right.completedAt ??
          right.startedAt
        ).getTime();

      const leftTime =
        (
          left.completedAt ??
          left.startedAt
        ).getTime();

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id.localeCompare(
        left.id,
      );
    },
  )[0];
}

export class ListBulkImportBatches {
  public constructor(
    private readonly repository:
      IBulkImportBatchHistoryRepository,
    private readonly libraryRepository?:
      IUniversalLibraryRepository,
  ) {}

  public async execute(
    input: BulkImportBatchHistoryQuery = {},
  ): Promise<BulkImportBatchHistoryResult> {
    const limit =
      input.limit ?? 50;

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200
    ) {
      throw new Error(
        "limit must be between 1 and 200.",
      );
    }

    const runs =
      await this.repository.findRecentBulkRuns({
        limit: Math.min(
          limit * 20,
          4000,
        ),
        sourceId:
          input.sourceId?.trim() ||
          undefined,
      });

    const bulkRuns =
      runs.filter(
        (run) =>
          stringValue(
            run.policySnapshot,
            "mode",
          ) === "BULK_JSONL" &&
          Boolean(
            stringValue(
              run.policySnapshot,
              "batchExternalKey",
            ),
          ),
      );

    const groups =
      new Map<
        string,
        BulkImportRunRecord[]
      >();

    for (const run of bulkRuns) {
      const batchExternalKey =
        stringValue(
          run.policySnapshot,
          "batchExternalKey",
        )!;

      const sourceNamespace =
        stringValue(
          run.policySnapshot,
          "sourceNamespace",
        ) ?? "";

      const key = [
        run.sourceId,
        sourceNamespace,
        batchExternalKey,
      ].join("::");

      const group =
        groups.get(key) ?? [];

      group.push(run);

      groups.set(
        key,
        group,
      );
    }

    const items:
      BulkImportBatchHistoryItem[] = [];

    for (const group of groups.values()) {
      const first =
        group[0];

      const batchExternalKey =
        stringValue(
          first.policySnapshot,
          "batchExternalKey",
        )!;

      const sourceNamespace =
        stringValue(
          first.policySnapshot,
          "sourceNamespace",
        );

      const fileName =
        stringValue(
          first.policySnapshot,
          "fileName",
        );

      const parsed =
        group
          .map((run) => ({
            run,
            chunk:
              chunkMetadata(run),
          }))
          .filter(
            (
              entry,
            ): entry is {
              run: BulkImportRunRecord;
              chunk: {
                index: number;
                count: number;
              };
            } =>
              entry.chunk !== null,
          );

      if (parsed.length === 0) {
        continue;
      }

      const expectedChunks =
        Math.max(
          ...parsed.map(
            (entry) =>
              entry.chunk.count,
          ),
        );

      const attemptsByChunk =
        new Map<
          number,
          BulkImportRunRecord[]
        >();

      for (const entry of parsed) {
        const attempts =
          attemptsByChunk.get(
            entry.chunk.index,
          ) ?? [];

        attempts.push(
          entry.run,
        );

        attemptsByChunk.set(
          entry.chunk.index,
          attempts,
        );
      }

      const latestRuns:
        BulkImportRunRecord[] = [];

      for (
        let index = 1;
        index <= expectedChunks;
        index += 1
      ) {
        const attempts =
          attemptsByChunk.get(index);

        if (!attempts?.length) {
          continue;
        }

        latestRuns.push(
          latestAttempt(attempts),
        );
      }

      const completedChunks =
        latestRuns.filter(
          (run) =>
            run.status ===
            "COMPLETED",
        ).length;

      const partialChunks =
        latestRuns.filter(
          (run) =>
            run.status ===
            "PARTIAL",
        ).length;

      const failedChunks =
        latestRuns.filter(
          (run) =>
            run.status ===
              "FAILED" ||
            run.status ===
              "BLOCKED" ||
            run.status ===
              "CANCELLED",
        ).length;

      const activeChunks =
        latestRuns.filter(
          (run) =>
            run.status ===
              "RUNNING" ||
            run.status ===
              "QUEUED",
        ).length;

      const missingChunks =
        expectedChunks -
        latestRuns.length;

      const uploadStatus: NonNullable<BulkImportBatchHistoryItem["uploadStatus"]> =
        completedChunks ===
          expectedChunks &&
        partialChunks === 0 &&
        failedChunks === 0 &&
        activeChunks === 0 &&
        missingChunks === 0
          ? "COMPLETED"
          : activeChunks > 0
            ? "IN_PROGRESS"
            : "NEEDS_ATTENTION";

      const runIds = group.map((run) => run.id);
      const recordCounts = this.libraryRepository
        ? await this.libraryRepository.countBulkWizardIngestionRecords(runIds)
        : null;

      let status: BulkImportBatchHistoryItem["status"] = uploadStatus;
      let journeyStatus: BulkImportBatchHistoryItem["journeyStatus"] = undefined;

      if (recordCounts && recordCounts.total > 0) {
        const awaiting = awaitingBulkWizardProcess(recordCounts);
        if (uploadStatus === "NEEDS_ATTENTION") {
          status = "NEEDS_ATTENTION";
          journeyStatus = "NEEDS_ATTENTION";
        } else if (uploadStatus === "IN_PROGRESS") {
          status = "IN_PROGRESS";
          journeyStatus = "IN_PROGRESS";
        } else if (awaiting > 0 && recordCounts.failed === recordCounts.total) {
          status = "FAILED";
          journeyStatus = "FAILED";
        } else if (awaiting > 0) {
          status = "READY_TO_PROCESS";
          journeyStatus = "READY_TO_PROCESS";
        } else if (recordCounts.needsReview > 0) {
          status = "IN_REVIEW";
          journeyStatus = "IN_REVIEW";
        } else if (recordCounts.published > 0) {
          status = "COMPLETED";
          journeyStatus = "COMPLETE";
        } else if (recordCounts.failed > 0) {
          status = "FAILED";
          journeyStatus = "FAILED";
        } else {
          status = "COMPLETED";
          journeyStatus = "COMPLETE";
        }
      }

      const publishedCount =
        latestRuns.reduce(
          (sum, run) =>
            sum +
            run.publishedCount,
          0,
        );

      if (publishedCount !== 0) {
        throw new Error(
          "Bulk staging safety violation: published records were detected in bulk history.",
        );
      }

      const dates =
        group.map(
          (run) =>
            run.completedAt ??
            run.startedAt,
        );

      const firstStartedAt =
        new Date(
          Math.min(
            ...group.map(
              (run) =>
                run.startedAt.getTime(),
            ),
          ),
        );

      const lastActivityAt =
        new Date(
          Math.max(
            ...dates.map(
              (date) =>
                date.getTime(),
            ),
          ),
        );

      items.push({
        sourceId:
          first.sourceId,
        batchExternalKey,
        sourceNamespace,
        fileName,
        status,
        uploadStatus,
        journeyStatus,

        expectedChunks,
        completedChunks,
        partialChunks,
        failedChunks,
        activeChunks,

        fetchedCount:
          latestRuns.reduce(
            (sum, run) =>
              sum +
              run.fetchedCount,
            0,
          ),

        // Latest-attempt staged count remains useful for execution truth.
        stagedCount:
          latestRuns.reduce(
            (sum, run) =>
              sum +
              run.stagedCount,
            0,
          ),

        // Historical contribution preserves what this logical batch
        // actually added to staging across its durable attempts.
        // Idempotent unchanged retries contribute zero additional staging.
        stagedContributionCount:
          group.reduce(
            (sum, run) =>
              sum +
              run.stagedCount,
            0,
          ),

        duplicateCount:
          latestRuns.reduce(
            (sum, run) =>
              sum +
              run.duplicateCount,
            0,
          ),

        changedCount:
          latestRuns.reduce(
            (sum, run) =>
              sum +
              run.changedCount,
            0,
          ),

        reviewRequiredCount:
          recordCounts
            ? recordCounts.needsReview
            : latestRuns.reduce(
                (sum, run) =>
                  sum +
                  run.reviewRequiredCount,
                0,
              ),

        rejectedCount:
          recordCounts
            ? recordCounts.rejected
            : latestRuns.reduce(
                (sum, run) =>
                  sum +
                  run.rejectedCount,
                0,
              ),

        publishedCount:
          recordCounts
            ? recordCounts.published
            : publishedCount,

        firstStartedAt,
        lastActivityAt,
      });
    }

    items.sort(
      (left, right) =>
        right.lastActivityAt.getTime() -
        left.lastActivityAt.getTime(),
    );

    const bounded =
      items.slice(
        0,
        limit,
      );

    return {
      items: bounded,
      total:
        bounded.length,
    };
  }
}
