import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  OLE2_XLS,
  boqWorkbook,
  containerDeclaring,
  XLSM_MAIN,
} from "./fixtures/xlsxFixtures";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";

/**
 * Phase 2A-6: the workbook channel on the REAL production inspection path.
 *
 * Every assertion here runs through PrismaSourceArtifactInspection — the same
 * port the ConversationRuntime uses. The point of the suite is governance: a
 * workbook must be inspected and described, and must never create governed
 * commercial or engineering state.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
  quotation: { create: vi.fn() },
  quotationLine: { create: vi.fn() },
  supplier: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

const storage = new LocalSourceArtifactStorage();
let directory = "";
let previousStorageDir: string | undefined;
let boqBytes: Buffer;
let boqRef = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-xlsx-"));
  previousStorageDir = process.env.VOKA_ARTIFACT_STORAGE_DIR;
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
  boqBytes = await boqWorkbook();
  boqRef = (await putBytes(boqBytes)).storageRef;
});

afterAll(() => {
  if (previousStorageDir === undefined) delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  else process.env.VOKA_ARTIFACT_STORAGE_DIR = previousStorageDir;
  rmSync(directory, { recursive: true, force: true });
});

/** Stores bytes through the real storage adapter and returns the locator it issued. */
async function putBytes(bytes: Buffer): Promise<{ hash: string; storageRef: string }> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, hash);
  return { hash, storageRef: stored.storageRef };
}

function artifactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "artifact-xlsx",
    originalFilename: "BOQ.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "XLSX",
    processingState: "TEXT_EXTRACTED",
    contentSha256: createHash("sha256").update(boqBytes).digest("hex"),
    storageRef: boqRef,
    citations: [],
    ...overrides,
  };
}

async function inspect(input: Record<string, unknown> = {}, artifact: Record<string, unknown> = {}) {
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(artifactRow(artifact));
  const inspection = new PrismaSourceArtifactInspection(null, null, {});
  return inspection.inspect({
    companyId: "company-1",
    artifactId: "artifact-xlsx",
    kind: "BOQ_INSPECTION",
    query: "what is in this workbook",
    locale: "en",
    ...input,
  } as never);
}

describe("workbook inspection on the production path", () => {
  it("inspects a real workbook and returns bounded structured evidence", async () => {
    const observation = await inspect();
    expect(observation.status).toBe("COMPLETED");
    expect(observation.artifactInspection?.kind).toBe("XLSX");
    expect(observation.artifactInspection?.spreadsheet.lines.length).toBeGreaterThan(0);
    expect(observation.summary).toContain("BOQ-style table");
  });

  it("creates no Requirement from workbook evidence, even on the BOQ inspection kind", async () => {
    const observation = await inspect();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirementCitation.upsert).not.toHaveBeenCalled();
    expect(observation.requirementCandidates ?? []).toHaveLength(0);
  });

  it("creates no quotation, quotation line, supplier, or procurement record", async () => {
    await inspect();
    expect(prismaMock.quotation.create).not.toHaveBeenCalled();
    expect(prismaMock.quotationLine.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
  });

  it("carries sheet and range citations and never a page number", async () => {
    const observation = await inspect({}, {
      citations: [{
        id: "citation-1", sourceArtifactId: "artifact-xlsx", sourceType: "SOURCE_ARTIFACT_SPREADSHEET",
        title: "BOQ.xlsx", pageNumber: null, sheet: "Electrical", lineLocator: "A1:F12",
        provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED",
        confidence: null, supportedClaimSummary: "Electrical!A3:F6",
      }],
    });
    expect(observation.citations?.[0]?.sheet).toBe("Electrical");
    expect(observation.citations?.[0]?.pageNumber).toBeNull();
  });

  it("reports an unsupported format truthfully instead of failing generically", async () => {
    const stored = await putBytes(OLE2_XLS);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(artifactRow({
      id: "artifact-xls",
      originalFilename: "BOQ.xls",
      mimeType: "application/vnd.ms-excel",
      kind: "XLSX",
      contentSha256: stored.hash,
      storageRef: stored.storageRef,
    }));
    const inspection = new PrismaSourceArtifactInspection(null, null, {});
    const observation = await inspection.inspect({
      companyId: "company-1", artifactId: "artifact-xls", kind: "BOQ_INSPECTION",
      query: "read this", locale: "en",
    } as never);
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("legacy binary .xls");
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("refuses a macro-enabled workbook without opening it", async () => {
    const stored = await putBytes(containerDeclaring(XLSM_MAIN));
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(artifactRow({
      id: "artifact-xlsm",
      originalFilename: "BOQ.xlsm",
      contentSha256: stored.hash,
      storageRef: stored.storageRef,
    }));
    const inspection = new PrismaSourceArtifactInspection(null, null, {});
    const observation = await inspection.inspect({
      companyId: "company-1", artifactId: "artifact-xlsm", kind: "BOQ_INSPECTION",
      query: "read this", locale: "en",
    } as never);
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("macro-enabled");
  });

  it("renders the brief in the runtime locale, not the workbook language", async () => {
    const arabic = await inspect({ locale: "ar" });
    expect(arabic.summary).toContain("جدول كميات");
  });

  it("detects a workbook by its bytes even when the stored kind predates XLSX", async () => {
    const observation = await inspect({}, { kind: "PDF" });
    // The byte-level container decision wins over a stale stored kind.
    expect(observation.artifactInspection?.kind).toBe("XLSX");
  });
});
