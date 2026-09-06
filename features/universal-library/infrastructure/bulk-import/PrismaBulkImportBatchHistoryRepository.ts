import type { PrismaClient } from "@/lib/generated/prisma/client";

import type {
  IBulkImportBatchHistoryRepository,
} from "../../application/bulk-import/ListBulkImportBatches";
import type { BulkImportRunRecord } from "../../application/bulk-import/RunBulkImportFile";

export class PrismaBulkImportBatchHistoryRepository
  implements IBulkImportBatchHistoryRepository
{
  public constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findRecentBulkRuns(
    input: {
      limit: number;
      sourceId?: string;
    },
  ): Promise<BulkImportRunRecord[]> {
    const records: any[] =
      await (this.prisma as any)
        .universalAcquisitionRun
        .findMany({
          where: {
            ...(input.sourceId
              ? {
                  sourceId:
                    input.sourceId,
                }
              : {}),

            policySnapshot: {
              path: ["mode"],
              equals:
                "BULK_JSONL",
            },
          },

          orderBy: {
            createdAt:
              "desc",
          },

          take:
            input.limit,
        });

    return records.map(
      (record) =>
        this.mapRun(record),
    );
  }

  private mapRun(
    record: any,
  ): BulkImportRunRecord {
    return {
      id: record.id,
      sourceId:
        record.sourceId,
      initiatedByUserId:
        record.initiatedByUserId,
      dryRun:
        record.dryRun,
      status:
        record.status,
      requestedLimit:
        record.requestedLimit,

      fetchedCount:
        record.fetchedCount,
      acceptedCount:
        record.acceptedCount,
      stagedCount:
        record.stagedCount,
      duplicateCount:
        record.duplicateCount,
      changedCount:
        record.changedCount,
      reviewRequiredCount:
        record.reviewRequiredCount,
      publishedCount:
        record.publishedCount,
      rejectedCount:
        record.rejectedCount,
      failedCount:
        record.failedCount,
      retryCount:
        record.retryCount,

      policySnapshot:
        record.policySnapshot as Record<
          string,
          unknown
        >,

      safeErrorSummary:
        record.safeErrorSummary,
      startedAt:
        record.startedAt,
      completedAt:
        record.completedAt,
    };
  }
}
