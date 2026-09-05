import type { PrismaClient } from "@/lib/generated/prisma/client";

import type {
  BulkImportBatchStatusQuery,
  IBulkImportBatchStatusRepository,
} from "../../application/bulk-import/GetBulkImportBatchStatus";
import type { BulkImportRunRecord } from "../../application/bulk-import/RunBulkImportFile";

export class PrismaBulkImportBatchStatusRepository
  implements IBulkImportBatchStatusRepository
{
  public constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findBatchRuns(
    input: BulkImportBatchStatusQuery,
  ): Promise<BulkImportRunRecord[]> {
    const records: any[] =
      await (this.prisma as any)
        .universalAcquisitionRun
        .findMany({
          where: {
            sourceId:
              input.sourceId,

            policySnapshot: {
              path: [
                "batchExternalKey",
              ],
              equals:
                input.batchExternalKey,
            },
          },

          orderBy: [
            {
              startedAt: "asc",
            },
            {
              id: "asc",
            },
          ],
        });

    return records
      .map((record) =>
        this.mapRun(record),
      )
      .filter((run) => {
        if (
          !input.sourceNamespace
        ) {
          return true;
        }

        const namespace =
          run.policySnapshot
            .sourceNamespace;

        return (
          namespace ===
          input.sourceNamespace
        );
      });
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
