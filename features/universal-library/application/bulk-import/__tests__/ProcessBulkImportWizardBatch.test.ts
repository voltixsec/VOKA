import { describe, expect, it } from "vitest";

import { ProcessBulkImportWizardBatch } from "../ProcessBulkImportWizardBatch";
import {
  batchStatusRepository,
  bulkRun,
  ingestion,
  InMemoryBulkWizardRepository,
} from "./batchWizardTestSupport";

describe("ProcessBulkImportWizardBatch", () => {
  it.each(["PUBLISHED", "REJECTED"] as const)("does not replay terminal %s records or claim review is outstanding", async status => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set("rec-1", ingestion({ status }));
    const result = await new ProcessBulkImportWizardBatch(batchStatusRepository([bulkRun()]), repo as any).execute({ sourceId: "source-1", batchExternalKey: "WIZARD_BATCH_001" });
    expect(result.processedCount).toBe(0);
    expect(result.overallStatus).toBe("COMPLETE");
    expect(repo.records.get("rec-1")?.status).toBe(status);
  });
  it("normalizes staged records and routes them to review without publishing", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set(
      "rec-1",
      ingestion({ id: "rec-1", sourceExternalId: "cam-1" }),
    );

    const summary = await new ProcessBulkImportWizardBatch(
      batchStatusRepository([bulkRun()]),
      repo as any,
    ).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(summary.processedCount).toBe(1);
    expect(summary.needsReviewCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(summary.publishedCount).toBe(0);
    expect(summary.overallStatus).toBe("IN_REVIEW");

    const stored = repo.records.get("rec-1");
    expect(stored?.status).toBe("NEEDS_REVIEW");
    expect(stored?.normalizedData).toMatchObject({
      name: "Wizard Camera",
      type: "PRODUCT",
    });
  });

  it("isolates a hard failure and continues the rest of the batch", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set(
      "rec-good",
      ingestion({
        id: "rec-good",
        sourceExternalId: "good-1",
      }),
    );
    repo.records.set(
      "rec-bad",
      ingestion({
        id: "rec-bad",
        sourceExternalId: "bad-1",
        payloadHash: "hash-bad",
        rawPayload: {
          schemaVersion: "1.0",
          entityType: "PRODUCT_MODEL",
          externalKey: "bad-1",
          payload: { name: "Broken Camera" },
          identifiers: [{ type: "NOT_A_TYPE", value: "x" }],
        },
      }),
    );

    const summary = await new ProcessBulkImportWizardBatch(
      batchStatusRepository([bulkRun()]),
      repo as any,
    ).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(summary.processedCount).toBe(2);
    expect(summary.needsReviewCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.publishedCount).toBe(0);
    expect(repo.records.get("rec-good")?.status).toBe("NEEDS_REVIEW");
    expect(repo.records.get("rec-bad")?.status).toBe("FAILED");
    expect(summary.overallStatus).toBe("READY_TO_PROCESS");
  });

  it("retries previously failed records without replaying successful review rows", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.identifierLookupError = new Error("transient identifier lookup");
    repo.identifierLookupFailuresRemaining = 1;

    repo.records.set(
      "rec-1",
      ingestion({
        id: "rec-1",
        sourceExternalId: "retry-1",
        rawPayload: {
          schemaVersion: "1.0",
          entityType: "PRODUCT_MODEL",
          externalKey: "retry-1",
          payload: { name: "Retry Camera" },
          identifiers: [{ type: "GTIN_13", value: "6931847101234" }],
        },
      }),
    );

    const useCase = new ProcessBulkImportWizardBatch(
      batchStatusRepository([bulkRun()]),
      repo as any,
    );

    const first = await useCase.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(first.failedCount).toBe(1);
    expect(repo.records.get("rec-1")?.status).toBe("FAILED");

    const second = await useCase.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(second.needsReviewCount).toBe(1);
    expect(second.failedCount).toBe(0);
    expect(repo.records.get("rec-1")?.status).toBe("NEEDS_REVIEW");
    expect(repo.records.get("rec-1")?.retryCount).toBe(2);
  });

  it("resumes remaining RECEIVED records without reprocessing review-ready rows", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set(
      "rec-1",
      ingestion({ id: "rec-1", sourceExternalId: "one" }),
    );
    repo.records.set(
      "rec-2",
      ingestion({
        id: "rec-2",
        sourceExternalId: "two",
        payloadHash: "hash-2",
        rawPayload: {
          schemaVersion: "1.0",
          entityType: "PRODUCT_MODEL",
          externalKey: "two",
          payload: { name: "Second Camera" },
        },
      }),
    );

    const useCase = new ProcessBulkImportWizardBatch(
      batchStatusRepository([bulkRun()]),
      repo as any,
    );

    const first = await useCase.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
      batchSize: 1,
      maxRecords: 1,
    });

    expect(first.processedCount).toBe(1);
    expect(first.remainingCount).toBe(1);

    const alreadyReviewed = [...repo.records.values()].find(
      (record) => record.status === "NEEDS_REVIEW",
    );
    expect(alreadyReviewed).toBeDefined();

    const second = await useCase.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
      batchSize: 1,
      maxRecords: 1,
    });

    expect(second.processedCount).toBe(1);
    expect(second.recordIds).not.toContain(alreadyReviewed!.id);
    expect(
      [...repo.records.values()].every(
        (record) => record.status === "NEEDS_REVIEW",
      ),
    ).toBe(true);
  });
});
