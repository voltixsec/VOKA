import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  NOT_A_ZIP,
  OLE2_XLS,
  boqWorkbook,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { isStoredSpreadsheetModel } from "@/src/domain/source-artifact";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact, SourceArtifactPolicyError } from "../IngestSourceArtifact";

/**
 * Phase 2A-6: XLSX ingest.
 *
 * The upload path is where the "uploaded XLSX -> SourceArtifact" link lives, so
 * these tests prove a workbook is accepted, verified against its bytes rather
 * than its declared type, and persisted with sheet-and-range citations instead
 * of page numbers.
 */

function workbookFile(bytes: Buffer, name = "BOQ.xlsx", type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-xlsx-ingest-"));
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

describe("xlsx ingest (2A-6)", () => {
  it("stores a real workbook as an XLSX artifact with sheet citations", async () => {
    resetPrisma();
    let created: Record<string, unknown> = {};
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return { id: "artifact-1", citations: [] };
    });
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: workbookFile(await boqWorkbook()), context: "SALES_ASSISTANT" });
    expect(created.kind).toBe("XLSX");
    expect(created.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(created.processingState).toBe("TEXT_EXTRACTED");
    const citations = created.citations as { create: Array<Record<string, unknown>> };
    expect(citations.create.length).toBeGreaterThan(0);
    expect(citations.create[0]?.sheet).toBe("Electrical");
    // A worksheet has no page, so no citation may carry one.
    for (const citation of citations.create) expect(citation.pageNumber).toBeNull();
  });

  it("persists a bounded workbook model that is not a cell dump", async () => {
    resetPrisma();
    let created: Record<string, unknown> = {};
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return { id: "artifact-1", citations: [] };
    });
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: workbookFile(await boqWorkbook()), context: "SALES_ASSISTANT" });
    const extractedPages = created.extractedPages;
    expect(isStoredSpreadsheetModel(extractedPages)).toBe(true);
    // The version-2 PDF page model must not claim this payload.
    expect((extractedPages as { version: number }).version).toBe(3);
    const serialized = JSON.stringify(extractedPages);
    expect(serialized).not.toContain("PVC insulated cable");
  });

  it("rejects a file that declares .xlsx but is not a ZIP container", async () => {
    resetPrisma();
    await expect(
      ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: workbookFile(NOT_A_ZIP, "fake.xlsx"), context: "SALES_ASSISTANT" }),
    ).rejects.toThrow(SourceArtifactPolicyError);
  });

  it("accepts a workbook sent with a generic MIME type and verifies it from its bytes", async () => {
    resetPrisma();
    let created: Record<string, unknown> = {};
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return { id: "artifact-1", citations: [] };
    });
    // Browsers sometimes report application/octet-stream; the extension allows
    // it through and the container check is what actually decides.
    await ingestSourceArtifact({
      companyId: "company-1",
      userId: "user-1",
      file: workbookFile(await boqWorkbook(), "BOQ.xlsx", "application/octet-stream"),
      context: "SALES_ASSISTANT",
    });
    expect(created.kind).toBe("XLSX");
  });

  it("refuses a legacy .xls at the door", async () => {
    resetPrisma();
    await expect(
      ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: workbookFile(OLE2_XLS, "BOQ.xls", "application/vnd.ms-excel"), context: "SALES_ASSISTANT" }),
    ).rejects.toThrow(SourceArtifactPolicyError);
  });
});
