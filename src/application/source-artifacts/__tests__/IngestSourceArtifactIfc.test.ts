import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dwgBytes, fullIfcModel, largeIfcModel, malformedIfcProse, rvtBytes, zipBytes } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";
import { isStoredIfcModel } from "@/src/domain/source-artifact";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact, SourceArtifactPolicyError } from "../IngestSourceArtifact";

/**
 * Phase 2A-8 test matrix items 63-70: IFC ingest.
 */

function ifcFile(bytes: Buffer, name = "seafront.ifc", type = "application/x-step"): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-ifc-ingest-"));
});

afterAll(() => {
  rmSync(process.env.VOKA_ARTIFACT_STORAGE_DIR!, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.sourceArtifact.create.mockReset();
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
}

let created: Record<string, unknown> = {};

function captureCreate() {
  created = {};
  prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
    created = args.data;
    return { id: "artifact-1", citations: [] };
  });
}

describe("ifc ingest (2A-8)", () => {
  it("63 stores a real model as an IFC artifact with STEP locator citations", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: ifcFile(Buffer.from(fullIfcModel(), "utf8")), context: "SALES_ASSISTANT" });
    expect(created.kind).toBe("IFC");
    expect(created.mimeType).toBe("application/x-step");
    expect(created.processingState).toBe("TEXT_EXTRACTED");
    const citations = created.citations as { create: Array<Record<string, unknown>> };
    expect(citations.create.length).toBeGreaterThan(0);
    for (const citation of citations.create) {
      expect(citation.pageNumber).toBeNull();
      expect(String(citation.lineLocator).startsWith("IFC:")).toBe(true);
      expect(citation.sourceType).toBe("SOURCE_ARTIFACT_IFC");
    }
  });

  it("64 accepts a model uploaded with a generic MIME type, keyed off its extension", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: ifcFile(Buffer.from(fullIfcModel(), "utf8"), "plan.ifc", "application/octet-stream"),
      context: "TAKEOFF",
    });
    expect(created.kind).toBe("IFC");
    expect(created.context).toBe("TAKEOFF");
  });

  it("65 persists a bounded structural model rather than an entity dump", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: ifcFile(Buffer.from(fullIfcModel(), "utf8")), context: "SALES_ASSISTANT" });
    expect(isStoredIfcModel(created.extractedPages)).toBe(true);
    const model = created.extractedPages as Record<string, unknown>;
    expect(model.version).toBe(5);
    expect(model.kind).toBe("IFC");
    expect(model.schema).toBe("IFC4");
    expect(model).not.toHaveProperty("elements");
    expect(model).not.toHaveProperty("geometry");
  });

  it("66 keeps the persisted model small for a very large file", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: ifcFile(Buffer.from(largeIfcModel(200), "utf8"), "big.ifc"), context: "SALES_ASSISTANT" });
    const model = created.extractedPages as Record<string, unknown>;
    expect(model.elementCount).toBe(200);
    expect(JSON.stringify(model).length).toBeLessThan(8_000);
  });

  it("67 rejects an RVT named .ifc at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(rvtBytes(), "model.ifc"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("68 rejects a ZIP named .ifc at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(zipBytes(), "model.ifc"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
  });

  it("69 rejects a DWG named .ifc at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(dwgBytes(), "model.ifc"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
  });

  it("70 rejects prose named .ifc at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(malformedIfcProse(), "notes.ifc"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
  });

  it("70b rejects a model above the size limit before reading it", async () => {
    resetPrisma();
    captureCreate();
    const error = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(Buffer.alloc(26 * 1024 * 1024, 0x20), "huge.ifc"), context: "SALES_ASSISTANT",
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(SourceArtifactPolicyError);
    expect((error as SourceArtifactPolicyError).code).toBe("SOURCE_ARTIFACT_SIZE_INVALID");
  });

  it("70c reuses an existing artifact for identical bytes and filename", async () => {
    resetPrisma();
    captureCreate();
    const existing = { id: "artifact-existing", citations: [] };
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(existing);
    const result = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: ifcFile(Buffer.from(fullIfcModel(), "utf8")), context: "SALES_ASSISTANT",
    });
    expect(result.idempotent).toBe(true);
    expect(result.artifact).toBe(existing);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });
});
