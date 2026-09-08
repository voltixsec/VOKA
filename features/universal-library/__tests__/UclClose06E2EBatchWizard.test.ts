import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BulkImportStagingService } from "../application/bulk-import/BulkImportStagingService";
import { ProcessBulkImportWizardBatch } from "../application/bulk-import/ProcessBulkImportWizardBatch";
import { GetBatchWizardJourney } from "../application/bulk-import/GetBatchWizardJourney";
import { ReviewIngestionRecord } from "../application/use-cases/ReviewIngestionRecord";
import { BATCH_WIZARD_STEPS } from "../domain/bulk-import/BatchWizardContract";
import { UniversalSource } from "../domain";
import { InMemoryJsonlLineReader } from "../infrastructure/bulk-import/jsonl/JsonlLineReader";
import { JsonlProcessor } from "../infrastructure/bulk-import/jsonl/JsonlProcessor";
import {
  batchStatusRepository,
  bulkRun,
  InMemoryBulkWizardRepository,
} from "../application/bulk-import/__tests__/batchWizardTestSupport";

async function parsed(lines: string[]) {
  return new JsonlProcessor().process(new InMemoryJsonlLineReader(lines));
}

function envelope(externalKey: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "1.0",
    entityType: "PRODUCT_MODEL",
    externalKey,
    payload,
    ...extra,
  });
}

describe("UCL-CLOSE-06 E2E Batch Wizard", () => {
  it("proves File → Upload → Batch → Process → Staging → Review → Publish without auto-publication", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.sources.set(
      "source-1",
      new UniversalSource({
        id: "source-1",
        name: "Wizard Source",
        type: "SYNTHETIC",
        verificationStatus: "SOURCE_VERIFIED",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const staging = new BulkImportStagingService(repo as any);
    const upload = await staging.stage(
      await parsed([
        envelope("cam-1", { name: "Camera One", manufacturerName: "Hikvision" }),
        envelope("cam-2", { name: "Camera Two", manufacturerName: "Hikvision" }),
      ]),
      {
        sourceId: "source-1",
        acquisitionRunId: "run-1",
      },
    );

    expect(upload.newRecords).toBe(2);
    expect(upload.results.every((result) => result.ingestionRecord?.status === "RECEIVED")).toBe(true);

    const runs = batchStatusRepository([bulkRun()]);
    const process = new ProcessBulkImportWizardBatch(runs, repo as any);
    const processed = await process.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(processed.publishedCount).toBe(0);
    expect(processed.needsReviewCount).toBe(2);
    expect(
      [...repo.records.values()].every((record) => record.status === "NEEDS_REVIEW"),
    ).toBe(true);

    const journey = await new GetBatchWizardJourney(runs, repo as any).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(journey.steps.map((step) => step.id)).toEqual(
      BATCH_WIZARD_STEPS.map((step) => step.id),
    );
    expect(journey.overallStatus).toBe("IN_REVIEW");
    expect(journey.records.pending).toBe(0);
    expect(journey.records.succeeded).toBe(2);
    expect(journey.records.failed).toBe(0);
    expect(journey.records.published).toBe(0);
    expect(journey.steps.find((step) => step.id === "STAGING")?.href).toBe(
      "/dashboard/universal-library/products",
    );
    expect(journey.steps.find((step) => step.id === "HIERARCHY")?.href).toBe(
      "/dashboard/universal-library/systems",
    );
    expect(journey.steps.find((step) => step.id === "PRODUCTS")?.href).toBe(
      "/dashboard/universal-library/products",
    );
    expect(journey.steps.find((step) => step.id === "REVIEW")?.state).toBe("READY");

    const review = new ReviewIngestionRecord(repo as any);
    const firstId = processed.recordIds[0];
    const published = await review.execute({
      ingestionRecordId: firstId,
      decision: "APPROVE",
      reviewedByUserId: "platform-admin-1",
    });

    expect(published.status).toBe("PUBLISHED");
    expect(repo.records.get(processed.recordIds[1])?.status).toBe("NEEDS_REVIEW");
    expect(
      [...repo.records.values()].filter((record) => record.status === "PUBLISHED"),
    ).toHaveLength(1);
  });

  it("proves error, partial/failure, retry and resume on the same wizard path", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.sources.set(
      "source-1",
      new UniversalSource({
        id: "source-1",
        name: "Wizard Source",
        type: "SYNTHETIC",
        verificationStatus: "SOURCE_VERIFIED",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const staging = new BulkImportStagingService(repo as any);
    const upload = await staging.stage(
      await parsed([
        "{ not json",
        envelope("good-1", { name: "Valid Camera" }),
        envelope("bad-1", { name: "Invalid Identifier Camera" }, {
          identifiers: [{ type: "NOT_A_TYPE", value: "x" }],
        }),
        envelope("later-1", { name: "Resume Camera" }),
      ]),
      {
        sourceId: "source-1",
        acquisitionRunId: "run-1",
      },
    );

    expect(upload.invalidRecords).toBe(1);
    expect(upload.newRecords).toBe(3);

    const runs = batchStatusRepository([
      bulkRun({
        status: "PARTIAL",
        rejectedCount: 1,
        stagedCount: 3,
        fetchedCount: 4,
        acceptedCount: 3,
      }),
    ]);

    const process = new ProcessBulkImportWizardBatch(runs, repo as any);
    const firstPass = await process.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
      batchSize: 2,
      maxRecords: 2,
    });

    expect(firstPass.processedCount).toBe(2);
    expect(firstPass.remainingCount).toBe(1 + firstPass.failedCount);
    expect(firstPass.failedCount + firstPass.needsReviewCount).toBe(2);

    const resume = await process.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
      batchSize: 2,
      maxRecords: 2,
    });

    expect(resume.processedCount).toBeGreaterThanOrEqual(1);

    const failed = [...repo.records.values()].find(
      (record) => record.status === "FAILED",
    );
    expect(failed).toBeDefined();

    const retry = await process.execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(retry.failedRecordIds).toContain(failed!.id);
    expect(
      [...repo.records.values()].every(
        (record) => record.status !== "PUBLISHED",
      ),
    ).toBe(true);

    const journey = await new GetBatchWizardJourney(runs, repo as any).execute({
      sourceId: "source-1",
      batchExternalKey: "WIZARD_BATCH_001",
      sourceNamespace: "VOKA_UCL_TEST",
    });

    expect(["READY_TO_PROCESS", "IN_REVIEW", "FAILED", "NEEDS_ATTENTION"]).toContain(
      journey.overallStatus,
    );
    expect(journey.records.published).toBe(0);
    expect(journey.canRetryFailedRecords).toBe(true);
  });

  it("does not duplicate records when the same envelopes are restaged", async () => {
    const repo = new InMemoryBulkWizardRepository();
    repo.sources.set(
      "source-1",
      new UniversalSource({
        id: "source-1",
        name: "Wizard Source",
        type: "SYNTHETIC",
        verificationStatus: "SOURCE_VERIFIED",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const staging = new BulkImportStagingService(repo as any);
    const lines = [
      envelope("cam-1", { name: "Camera One", manufacturerName: "Hikvision" }),
      envelope("cam-2", { name: "Camera Two", manufacturerName: "Hikvision" }),
    ];

    const first = await staging.stage(await parsed(lines), {
      sourceId: "source-1",
      acquisitionRunId: "run-1",
    });

    expect(first.newRecords).toBe(2);
    expect(repo.records.size).toBe(2);

    const restage = await staging.stage(await parsed(lines), {
      sourceId: "source-1",
      acquisitionRunId: "run-1",
    });

    expect(restage.unchangedRecords).toBe(2);
    expect(restage.newRecords).toBe(0);
    expect(restage.changedRecords).toBe(0);
    expect(repo.records.size).toBe(2);
  });

  it("scopes durable wizard claims to the logical batch runs", () => {
    const source = readFileSync(
      "features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts",
      "utf8",
    );

    expect(source).toContain("claimBulkWizardIngestionRecords");
    expect(source).toContain("countBulkWizardIngestionRecords");
    expect(source).toContain("FOR UPDATE SKIP LOCKED");
    expect(source).toContain('"acquisitionRunId" IN');
    expect(source).toContain("AND \"id\" NOT IN");
  });
});
