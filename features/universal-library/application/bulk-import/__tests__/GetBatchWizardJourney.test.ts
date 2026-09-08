import { describe, expect, it } from "vitest";

import { GetBatchWizardJourney } from "../GetBatchWizardJourney";
import {
  batchStatusRepository,
  bulkRun,
  ingestion,
  InMemoryBulkWizardRepository,
} from "./batchWizardTestSupport";

describe("GetBatchWizardJourney", () => {
  it("exposes the ten operator steps and idle state before a batch exists", async () => {
    const journey = await new GetBatchWizardJourney(
      batchStatusRepository([]),
      new InMemoryBulkWizardRepository() as any,
    ).execute({
      sourceId: "source-1",
      batchExternalKey: "MISSING",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(journey.steps.map((step) => step.id)).toEqual([
      "FILE",
      "UPLOAD",
      "BATCH",
      "PROCESS",
      "STAGING",
      "HIERARCHY",
      "PRODUCTS",
      "REVIEW",
      "PUBLISH",
      "STATUS_HISTORY",
    ]);
    expect(journey.overallStatus).toBe("IDLE");
    expect(journey.canProcess).toBe(false);
  });

  it("marks process ready and chunk resume when a batch needs attention", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set("rec-1", ingestion());

    const journey = await new GetBatchWizardJourney(
      batchStatusRepository([
        bulkRun({
          status: "FAILED",
          failedCount: 1,
          stagedCount: 1,
          policySnapshot: {
            mode: "BULK_JSONL",
            batchExternalKey: "WIZARD_BATCH_001",
            sourceNamespace: "VOKA_UCL_TEST",
            chunk: { index: 1, count: 2, recordCount: 1 },
          },
        }),
      ]),
      repo as any,
    ).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(journey.overallStatus).toBe("NEEDS_ATTENTION");
    expect(journey.canResumeChunks).toBe(true);
    expect(journey.canProcess).toBe(true);
    expect(journey.retryChunkIndexes).toEqual([1, 2]);
    expect(
      journey.steps.find((step) => step.id === "PROCESS")?.state,
    ).toBe("READY");
  });

  it("advances review and publish after records are processed", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.records.set(
      "rec-1",
      ingestion({
        status: "NEEDS_REVIEW",
        normalizedData: { name: "Wizard Camera" },
      }),
    );

    const journey = await new GetBatchWizardJourney(
      batchStatusRepository([bulkRun()]),
      repo as any,
    ).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(journey.overallStatus).toBe("IN_REVIEW");
    expect(journey.steps.find((step) => step.id === "REVIEW")?.state).toBe(
      "READY",
    );
    expect(journey.steps.find((step) => step.id === "PUBLISH")?.href).toBe(
      "/dashboard/universal-library/published",
    );
  });
});
