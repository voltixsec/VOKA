import type { BulkImportRunRecord } from "./RunBulkImportFile";

export type BulkImportBatchOverallStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NEEDS_ATTENTION";

export interface BulkImportBatchStatusQuery {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace?: string;
}

export interface IBulkImportBatchStatusRepository {
  findBatchRuns(
    input: BulkImportBatchStatusQuery,
  ): Promise<BulkImportRunRecord[]>;
}

export interface BulkImportBatchChunkStatus {
  chunkIndex: number;
  status:
    | BulkImportRunRecord["status"]
    | "MISSING";
  attemptCount: number;
  latestRunId: string | null;
  recordCount: number | null;
  fetchedCount: number;
  acceptedCount: number;
  stagedCount: number;
  duplicateCount: number;
  changedCount: number;
  reviewRequiredCount: number;
  publishedCount: number;
  rejectedCount: number;
  failedCount: number;
  retryCount: number;
  retryRequired: boolean;
  safeErrorSummary: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface BulkImportBatchStatusResult {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace: string | null;
  overallStatus: BulkImportBatchOverallStatus;

  expectedChunks: number;
  completedChunks: number;
  partialChunks: number;
  failedChunks: number;
  activeChunks: number;
  missingChunks: number;

  retryChunkIndexes: number[];

  totals: {
    fetchedCount: number;
    acceptedCount: number;
    stagedCount: number;
    duplicateCount: number;
    changedCount: number;
    reviewRequiredCount: number;
    publishedCount: number;
    rejectedCount: number;
    failedCount: number;
  };

  chunks: BulkImportBatchChunkStatus[];
}

type ChunkMetadata = {
  index: number;
  count: number;
  recordCount: number | null;
};

function snapshotString(
  snapshot: Record<string, unknown>,
  key: string,
): string | null {
  const value = snapshot[key];

  return typeof value === "string"
    ? value
    : null;
}

function readChunkMetadata(
  run: BulkImportRunRecord,
): ChunkMetadata | null {
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

  const index = chunk.index;
  const count = chunk.count;
  const recordCount =
    chunk.recordCount;

  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    Number(index) < 1 ||
    Number(count) < 1 ||
    Number(index) > Number(count)
  ) {
    return null;
  }

  return {
    index: Number(index),
    count: Number(count),
    recordCount:
      Number.isInteger(recordCount) &&
      Number(recordCount) >= 0
        ? Number(recordCount)
        : null,
  };
}

function newestRun(
  runs: BulkImportRunRecord[],
): BulkImportRunRecord {
  return [...runs].sort(
    (left, right) => {
      const timeDifference =
        right.startedAt.getTime() -
        left.startedAt.getTime();

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return right.id.localeCompare(
        left.id,
      );
    },
  )[0];
}

export class GetBulkImportBatchStatus {
  public constructor(
    private readonly repository:
      IBulkImportBatchStatusRepository,
  ) {}

  public async execute(
    input: BulkImportBatchStatusQuery,
  ): Promise<BulkImportBatchStatusResult | null> {
    const sourceId =
      input.sourceId?.trim();

    const batchExternalKey =
      input.batchExternalKey?.trim();

    const requestedNamespace =
      input.sourceNamespace?.trim() ||
      undefined;

    if (!sourceId) {
      throw new Error(
        "sourceId is required.",
      );
    }

    if (!batchExternalKey) {
      throw new Error(
        "batchExternalKey is required.",
      );
    }

    const foundRuns =
      await this.repository.findBatchRuns({
        sourceId,
        batchExternalKey,
        sourceNamespace:
          requestedNamespace,
      });

    const bulkRuns =
      foundRuns.filter((run) => {
        const mode =
          snapshotString(
            run.policySnapshot,
            "mode",
          );

        const key =
          snapshotString(
            run.policySnapshot,
            "batchExternalKey",
          );

        return (
          mode === "BULK_JSONL" &&
          key === batchExternalKey
        );
      });

    if (bulkRuns.length === 0) {
      return null;
    }

    const namespaces =
      new Set(
        bulkRuns.map(
          (run) =>
            snapshotString(
              run.policySnapshot,
              "sourceNamespace",
            ) ?? "",
        ),
      );

    if (
      !requestedNamespace &&
      namespaces.size > 1
    ) {
      throw new Error(
        "Bulk batch identity is ambiguous; specify sourceNamespace.",
      );
    }

    const effectiveNamespace =
      requestedNamespace ??
      (
        Array.from(namespaces)[0] ||
        null
      );

    const namespaceRuns =
      bulkRuns.filter((run) => {
        const namespace =
          snapshotString(
            run.policySnapshot,
            "sourceNamespace",
          );

        return (
          effectiveNamespace === null ||
          namespace ===
            effectiveNamespace
        );
      });

    if (namespaceRuns.length === 0) {
      return null;
    }

    const parsed = namespaceRuns.map(
      (run) => ({
        run,
        chunk: readChunkMetadata(run),
      }),
    );

    if (
      parsed.some(
        (entry) => !entry.chunk,
      )
    ) {
      throw new Error(
        "Bulk batch contains invalid chunk metadata.",
      );
    }

    const chunkCounts =
      new Set(
        parsed.map(
          (entry) =>
            entry.chunk!.count,
        ),
      );

    if (chunkCounts.size !== 1) {
      throw new Error(
        "Bulk batch contains inconsistent chunk counts.",
      );
    }

    const expectedChunks =
      Array.from(chunkCounts)[0];

    const attemptsByChunk =
      new Map<
        number,
        BulkImportRunRecord[]
      >();

    for (const entry of parsed) {
      const index =
        entry.chunk!.index;

      const attempts =
        attemptsByChunk.get(index) ??
        [];

      attempts.push(entry.run);

      attemptsByChunk.set(
        index,
        attempts,
      );
    }

    const chunks:
      BulkImportBatchChunkStatus[] = [];

    for (
      let chunkIndex = 1;
      chunkIndex <= expectedChunks;
      chunkIndex += 1
    ) {
      const attempts =
        attemptsByChunk.get(
          chunkIndex,
        ) ?? [];

      if (attempts.length === 0) {
        chunks.push({
          chunkIndex,
          status: "MISSING",
          attemptCount: 0,
          latestRunId: null,
          recordCount: null,
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
          retryRequired: true,
          safeErrorSummary: null,
          startedAt: null,
          completedAt: null,
        });

        continue;
      }

      const latest =
        newestRun(attempts);

      const metadata =
        readChunkMetadata(latest)!;

      const retryRequired =
        latest.status === "FAILED" ||
        latest.status === "PARTIAL" ||
        latest.status === "BLOCKED" ||
        latest.status === "CANCELLED";

      chunks.push({
        chunkIndex,
        status: latest.status,
        attemptCount:
          attempts.length,
        latestRunId:
          latest.id,
        recordCount:
          metadata.recordCount,

        fetchedCount:
          latest.fetchedCount,
        acceptedCount:
          latest.acceptedCount,
        stagedCount:
          latest.stagedCount,
        duplicateCount:
          latest.duplicateCount,
        changedCount:
          latest.changedCount,
        reviewRequiredCount:
          latest.reviewRequiredCount,
        publishedCount:
          latest.publishedCount,
        rejectedCount:
          latest.rejectedCount,
        failedCount:
          latest.failedCount,
        retryCount:
          latest.retryCount,

        retryRequired,
        safeErrorSummary:
          latest.safeErrorSummary ??
          null,
        startedAt:
          latest.startedAt,
        completedAt:
          latest.completedAt ??
          null,
      });
    }

    const publishedCount =
      chunks.reduce(
        (total, chunk) =>
          total +
          chunk.publishedCount,
        0,
      );

    if (publishedCount !== 0) {
      throw new Error(
        "Bulk staging safety violation: published records were detected in a bulk batch.",
      );
    }

    const completedChunks =
      chunks.filter(
        (chunk) =>
          chunk.status ===
          "COMPLETED",
      ).length;

    const partialChunks =
      chunks.filter(
        (chunk) =>
          chunk.status ===
          "PARTIAL",
      ).length;

    const failedChunks =
      chunks.filter(
        (chunk) =>
          chunk.status ===
            "FAILED" ||
          chunk.status ===
            "BLOCKED" ||
          chunk.status ===
            "CANCELLED",
      ).length;

    const activeChunks =
      chunks.filter(
        (chunk) =>
          chunk.status ===
            "RUNNING" ||
          chunk.status ===
            "QUEUED",
      ).length;

    const missingChunks =
      chunks.filter(
        (chunk) =>
          chunk.status ===
          "MISSING",
      ).length;

    const retryChunkIndexes =
      chunks
        .filter(
          (chunk) =>
            chunk.retryRequired,
        )
        .map(
          (chunk) =>
            chunk.chunkIndex,
        );

    let overallStatus:
      BulkImportBatchOverallStatus;

    if (
      completedChunks ===
        expectedChunks &&
      partialChunks === 0 &&
      failedChunks === 0 &&
      activeChunks === 0 &&
      missingChunks === 0
    ) {
      overallStatus =
        "COMPLETED";
    } else if (
      activeChunks > 0
    ) {
      overallStatus =
        "IN_PROGRESS";
    } else {
      overallStatus =
        "NEEDS_ATTENTION";
    }

    return {
      sourceId,
      batchExternalKey,
      sourceNamespace:
        effectiveNamespace,
      overallStatus,

      expectedChunks,
      completedChunks,
      partialChunks,
      failedChunks,
      activeChunks,
      missingChunks,

      retryChunkIndexes,

      totals: {
        fetchedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.fetchedCount,
            0,
          ),

        acceptedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.acceptedCount,
            0,
          ),

        stagedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.stagedCount,
            0,
          ),

        duplicateCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.duplicateCount,
            0,
          ),

        changedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.changedCount,
            0,
          ),

        reviewRequiredCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.reviewRequiredCount,
            0,
          ),

        publishedCount,

        rejectedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.rejectedCount,
            0,
          ),

        failedCount:
          chunks.reduce(
            (sum, chunk) =>
              sum +
              chunk.failedCount,
            0,
          ),
      },

      chunks,
    };
  }
}
