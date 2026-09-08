import type { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import {
  BATCH_WIZARD_STEPS,
  awaitingBulkWizardProcess,
  emptyBulkWizardRecordCounts,
  pendingBulkWizardRecords,
  succeededBulkWizardRecords,
  type BatchWizardOverallStatus,
  type BatchWizardStepId,
  type BatchWizardStepState,
  type BulkWizardRecordCounts,
} from "../../domain/bulk-import/BatchWizardContract";
import {
  GetBulkImportBatchStatus,
  type BulkImportBatchStatusResult,
  type IBulkImportBatchStatusRepository,
} from "./GetBulkImportBatchStatus";

export interface GetBatchWizardJourneyInput {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace?: string;
}

export interface BatchWizardStepView {
  id: BatchWizardStepId;
  label: string;
  href: string;
  state: BatchWizardStepState;
}

export interface BatchWizardJourney {
  steps: BatchWizardStepView[];
  overallStatus: BatchWizardOverallStatus;
  batch: BulkImportBatchStatusResult | null;
  records: BulkWizardRecordCounts & {
    awaitingProcess: number;
    pending: number;
    succeeded: number;
  };
  progress: {
    expectedChunks: number;
    completedChunks: number;
    failedChunks: number;
    partialChunks: number;
    missingChunks: number;
    chunkPercent: number;
    pendingCount: number;
    succeededCount: number;
    failedCount: number;
    publishedCount: number;
    rejectedCount: number;
    recordPercent: number;
  };
  canProcess: boolean;
  canRetryFailedRecords: boolean;
  canResumeChunks: boolean;
  retryChunkIndexes: number[];
}

function stepState(
  id: BatchWizardStepId,
  batch: BulkImportBatchStatusResult | null,
  records: BulkWizardRecordCounts,
  awaitingProcess: number,
): BatchWizardStepState {
  if (!batch) {
    return id === "FILE" ? "READY" : "LOCKED";
  }

  switch (id) {
    case "FILE":
      return "COMPLETE";
    case "UPLOAD":
      if (batch.overallStatus === "IN_PROGRESS") {
        return "IN_PROGRESS";
      }
      if (batch.failedChunks > 0 && batch.completedChunks === 0) {
        return "ERROR";
      }
      if (batch.failedChunks > 0 || batch.partialChunks > 0) {
        return "PARTIAL";
      }
      return batch.completedChunks > 0 ? "COMPLETE" : "READY";
    case "BATCH":
      if (batch.overallStatus === "IN_PROGRESS") {
        return "IN_PROGRESS";
      }
      if (batch.overallStatus === "NEEDS_ATTENTION") {
        return "PARTIAL";
      }
      return "COMPLETE";
    case "PROCESS":
      if (awaitingProcess > 0 && records.needsReview > 0) {
        return "PARTIAL";
      }
      if (awaitingProcess > 0) {
        return "READY";
      }
      if (records.failed > 0 && records.needsReview === 0 && records.published === 0) {
        return "ERROR";
      }
      if (records.total > 0) {
        return "COMPLETE";
      }
      return batch.completedChunks > 0 || batch.partialChunks > 0
        ? "READY"
        : "LOCKED";
    case "STAGING":
    case "HIERARCHY":
    case "PRODUCTS":
      return records.total > 0 ? "COMPLETE" : "LOCKED";
    case "REVIEW":
      if (records.needsReview > 0) {
        return "READY";
      }
      if (records.published > 0 || records.rejected > 0) {
        return "COMPLETE";
      }
      return "LOCKED";
    case "PUBLISH":
      if (records.published > 0 && records.needsReview > 0) {
        return "PARTIAL";
      }
      if (records.published > 0) {
        return "COMPLETE";
      }
      return records.needsReview > 0 ? "READY" : "LOCKED";
    case "STATUS_HISTORY":
      return "COMPLETE";
    default:
      return "LOCKED";
  }
}

function overallStatus(
  batch: BulkImportBatchStatusResult | null,
  records: BulkWizardRecordCounts,
  awaitingProcess: number,
): BatchWizardOverallStatus {
  if (!batch) {
    return "IDLE";
  }

  if (batch.overallStatus === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }

  if (batch.overallStatus === "NEEDS_ATTENTION") {
    return "NEEDS_ATTENTION";
  }

  if (awaitingProcess > 0 && records.failed === records.total && records.total > 0) {
    return "FAILED";
  }

  if (awaitingProcess > 0) {
    return "READY_TO_PROCESS";
  }

  if (records.needsReview > 0) {
    return "IN_REVIEW";
  }

  if (records.published > 0 && records.needsReview === 0) {
    return "COMPLETE";
  }

  if (records.failed > 0 && records.needsReview === 0 && records.published === 0) {
    return "FAILED";
  }

  return records.total > 0 ? "COMPLETE" : "NEEDS_ATTENTION";
}

export class GetBatchWizardJourney {
  public constructor(
    private readonly batchStatusRepository: IBulkImportBatchStatusRepository,
    private readonly repository: IUniversalLibraryRepository,
  ) {}

  public async execute(
    input: GetBatchWizardJourneyInput,
  ): Promise<BatchWizardJourney> {
    const sourceId = input.sourceId?.trim();
    const batchExternalKey = input.batchExternalKey?.trim();
    const sourceNamespace = input.sourceNamespace?.trim() || undefined;

    if (!sourceId) {
      throw new Error("sourceId is required.");
    }

    if (!batchExternalKey) {
      throw new Error("batchExternalKey is required.");
    }

    const batch = await new GetBulkImportBatchStatus(
      this.batchStatusRepository,
    ).execute({
      sourceId,
      batchExternalKey,
      sourceNamespace,
    });

    const runIds = batch
      ? [
          ...new Set(
            (
              await this.batchStatusRepository.findBatchRuns({
                sourceId,
                batchExternalKey,
                sourceNamespace,
              })
            ).map((run) => run.id),
          ),
        ]
      : [];

    const records = batch
      ? await this.repository.countBulkWizardIngestionRecords(runIds)
      : emptyBulkWizardRecordCounts();

    const awaitingProcess = awaitingBulkWizardProcess(records);
    const pending = pendingBulkWizardRecords(records);
    const succeeded = succeededBulkWizardRecords(records);
    const expectedChunks = batch?.expectedChunks ?? 0;
    const completedChunks = batch?.completedChunks ?? 0;
    const settledRecords =
      succeeded + records.published + records.rejected;
    const recordPercent =
      records.total > 0
        ? Math.round((settledRecords / records.total) * 100)
        : 0;
    const chunkPercent =
      expectedChunks > 0
        ? Math.round((completedChunks / expectedChunks) * 100)
        : 0;

    const steps = BATCH_WIZARD_STEPS.map((step) => ({
      id: step.id,
      label: step.label,
      href: step.href,
      state: stepState(step.id, batch, records, awaitingProcess),
    }));

    return {
      steps,
      overallStatus: overallStatus(batch, records, awaitingProcess),
      batch,
      records: {
        ...records,
        awaitingProcess,
        pending,
        succeeded,
      },
      progress: {
        expectedChunks,
        completedChunks,
        failedChunks: batch?.failedChunks ?? 0,
        partialChunks: batch?.partialChunks ?? 0,
        missingChunks: batch?.missingChunks ?? 0,
        chunkPercent,
        pendingCount: pending,
        succeededCount: succeeded,
        failedCount: records.failed,
        publishedCount: records.published,
        rejectedCount: records.rejected,
        recordPercent,
      },
      canProcess: awaitingProcess > 0,
      canRetryFailedRecords: records.failed > 0,
      canResumeChunks: (batch?.retryChunkIndexes.length ?? 0) > 0,
      retryChunkIndexes: batch?.retryChunkIndexes ?? [],
    };
  }
}
