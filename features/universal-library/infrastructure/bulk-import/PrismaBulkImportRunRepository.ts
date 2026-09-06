import type { PrismaClient } from "@/lib/generated/prisma/client";

import type {
  AcquisitionRunCounters,
  AcquisitionRunStatus,
} from "../../domain/acquisition/AcquisitionContracts";
import type {
  BulkImportChunkRunMetadata,
  BulkImportRunRecord,
  IBulkImportRunRepository,
} from "../../application/bulk-import/RunBulkImportFile";

export class PrismaBulkImportRunRepository
  implements IBulkImportRunRepository
{
  public constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async createRun(
    input: BulkImportChunkRunMetadata,
  ): Promise<BulkImportRunRecord> {
    if (
      input.chunkRecordCount < 1 ||
      input.chunkRecordCount > 1000
    ) {
      throw new Error(
        "Bulk chunk size must be between 1 and 1000 records.",
      );
    }

    const source: any =
      await (this.prisma as any).universalSource.findUnique({
        where: {
          id: input.sourceId,
        },
      });

    if (!source) {
      throw new Error(
        `Universal source with ID '${input.sourceId}' not found.`,
      );
    }

    if (!source.isActive) {
      throw new Error(
        `Universal source '${source.name}' is inactive.`,
      );
    }

    const policySnapshot = {
      mode: "BULK_JSONL",
      contractVersion: "1.0",
      schemaVersion: "1.0",
      noDirectPublication: true,

      fileName: input.fileName,
      contentHash: input.contentHash,
      byteLength: input.byteLength,

      batchExternalKey:
        input.batchExternalKey ?? null,

      sourceNamespace:
        input.sourceNamespace ?? null,

      totalRecordCount: input.recordCount,

      chunk: {
        index: input.chunkIndex,
        count: input.chunkCount,
        recordCount: input.chunkRecordCount,
        sizeLimit: 1000,
      },

      execution: {
        resumable: true,
        independentChunkRuns: true,
        continueAfterChunkFailure: true,
        publicationAllowed: false,
        reservationSemantics:
          "BULK_INTERNAL_CHUNK",
      },

      sourceGovernance: {
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        approvalState: source.approvalState,
        commercialUseState:
          source.commercialUseState,
        redistributionState:
          source.redistributionState,
        verificationStatus:
          source.verificationStatus,
        healthStatus:
          source.healthStatus,
      },
    };

    const record: any =
      await (this.prisma as any).universalAcquisitionRun.create({
        data: {
          sourceId: input.sourceId,
          initiatedByUserId:
            input.initiatedByUserId,
          dryRun: false,
          status: "RUNNING",

          // Existing DB constraint requires 1..1000.
          requestedLimit:
            input.chunkRecordCount,

          // Existing acquisition table requires 1..6.
          // For bulk this represents one internal chunk reservation,
          // not an external HTTP request.
          reservedRequestCount: 1,

          policySnapshot,
        },
      });

    return this.mapRun(record);
  }

  public async completeRun(
    id: string,
    status: AcquisitionRunStatus,
    counters: AcquisitionRunCounters,
    safeErrorSummary?: string,
  ): Promise<BulkImportRunRecord> {
    if (
      counters.acceptedCount +
        counters.rejectedCount >
      counters.fetchedCount
    ) {
      throw new Error(
        "Bulk import counters are inconsistent.",
      );
    }

    if (
      counters.stagedCount >
      counters.acceptedCount
    ) {
      throw new Error(
        "Bulk import staged count is inconsistent.",
      );
    }

    if (counters.publishedCount !== 0) {
      throw new Error(
        "Bulk import staging must never publish canonical records.",
      );
    }

    const record: any =
      await (this.prisma as any).universalAcquisitionRun.update({
        where: {
          id,
        },
        data: {
          status,
          ...counters,
          safeErrorSummary:
            safeErrorSummary?.slice(0, 500) ??
            null,
          completedAt: new Date(),
        },
      });

    return this.mapRun(record);
  }

  private mapRun(
    record: any,
  ): BulkImportRunRecord {
    return {
      id: record.id,
      sourceId: record.sourceId,
      initiatedByUserId:
        record.initiatedByUserId,
      dryRun: record.dryRun,
      status: record.status,
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
      startedAt: record.startedAt,
      completedAt:
        record.completedAt,
    };
  }
}
