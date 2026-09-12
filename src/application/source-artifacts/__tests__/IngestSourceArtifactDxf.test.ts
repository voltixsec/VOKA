import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  binaryDxfBytes,
  dwgBytes,
  fullDrawing,
  largeDrawing,
  malformedText,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";
import { isStoredDxfModel } from "@/src/domain/source-artifact";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact, SourceArtifactPolicyError } from "../IngestSourceArtifact";

/**
 * Phase 2A-7: DXF ingest.
 *
 * The upload path is where the "uploaded .dxf -> SourceArtifact" link lives, so
 * these tests prove a drawing is accepted, verified against its bytes rather
 * than its declared type, persisted with a bounded structural model instead of
 * an entity dump, and cited with CAD locators instead of page numbers.
 */

function dxfFile(bytes: Buffer, name = "site.dxf", type = "image/vnd.dxf"): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-dxf-ingest-"));
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

describe("dxf ingest (2A-7)", () => {
  it("stores a real drawing as a DXF artifact with CAD locator citations", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(fullDrawing(), "latin1")), context: "SALES_ASSISTANT" });
    expect(created.kind).toBe("DXF");
    expect(created.mimeType).toBe("image/vnd.dxf");
    expect(created.processingState).toBe("TEXT_EXTRACTED");
    const citations = created.citations as { create: Array<Record<string, unknown>> };
    expect(citations.create.length).toBeGreaterThan(0);
    // A drawing has no page, so no citation may carry one; the locator is CAD.
    for (const citation of citations.create) {
      expect(citation.pageNumber).toBeNull();
      expect(String(citation.lineLocator).startsWith("DXF:")).toBe(true);
      expect(citation.sourceType).toBe("SOURCE_ARTIFACT_DXF");
    }
    expect(citations.create.map((citation) => citation.lineLocator)).toContain("DXF:LAYER=FIRE_ALARM");
  });

  it("accepts a drawing uploaded with a generic MIME type, keyed off its extension", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: dxfFile(Buffer.from(fullDrawing(), "latin1"), "plan.dxf", "application/octet-stream"),
      context: "TAKEOFF",
    });
    expect(created.kind).toBe("DXF");
    expect(created.context).toBe("TAKEOFF");
  });

  it("persists a bounded structural model rather than an entity dump", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(fullDrawing(), "latin1")), context: "SALES_ASSISTANT" });
    expect(isStoredDxfModel(created.extractedPages)).toBe(true);
    const model = created.extractedPages as Record<string, unknown>;
    expect(model.version).toBe(4);
    expect(model.kind).toBe("DXF");
    expect(model.unitsName).toBe("millimetres");
    expect(model.versionCode).toBe("AC1027");
    // Counts and limits only. No coordinate, geometry, or entity list is stored.
    expect(model).not.toHaveProperty("entities");
    expect(model).not.toHaveProperty("geometry");
  });

  it("keeps the persisted model small for a very large drawing", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(largeDrawing(4_000), "latin1"), "big.dxf"), context: "SALES_ASSISTANT" });
    const model = created.extractedPages as Record<string, unknown>;
    expect(model.entityCount).toBe(4_000);
    expect(model.truncated).toBe(true);
    // The persisted JSON stays bounded however large the drawing is.
    expect(JSON.stringify(model).length).toBeLessThan(4_000);
  });

  it("does not store undeclared units as a guess", async () => {
    resetPrisma();
    captureCreate();
    const { drawingWithoutUnits } = await import("@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures");
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(drawingWithoutUnits(), "latin1")), context: "SALES_ASSISTANT" });
    const model = created.extractedPages as Record<string, unknown>;
    expect(model.unitsCode).toBeNull();
    expect(model.unitsName).toBeNull();
    expect((model.limitations as string[]).join(" ")).toContain("did not declare CAD units");
  });

  it("rejects a DWG named .dxf at the byte gate with a truthful message", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(dwgBytes(), "site.dxf"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("rejects a binary DXF at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(binaryDxfBytes(), "site.dxf"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
  });

  it("rejects prose named .dxf at the byte gate", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(malformedText(), "notes.dxf"), context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
  });

  it("reports a drawing the inspector rejects as binary content, rather than crashing", async () => {
    resetPrisma();
    captureCreate();
    // A drawing carrying embedded binary junk. The group-code shape is intact,
    // so the cheap upload gate accepts it, but the inspector counts the control
    // bytes and refuses it. The two gates are deliberately not identical: the
    // upload gate is cheap, the inspector is authoritative, and a disagreement
    // has to surface as a truthful error instead of a silent acceptance.
    const text = fullDrawing();
    const padded = text.replace(
      "  1\r\nAC1027",
      `  1\r\nAC1027\r\n  9\r\n$VOKA_PAD\r\n  1\r\n${"\u0001".repeat(600)}`,
    );
    expect(padded).toContain("\u0001");
    const error = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(padded, "latin1")), context: "SALES_ASSISTANT",
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(SourceArtifactPolicyError);
    expect((error as SourceArtifactPolicyError).code).toBe("SOURCE_ARTIFACT_DXF_UNREADABLE");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("rejects a drawing above the size limit before reading it", async () => {
    resetPrisma();
    captureCreate();
    const error = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.alloc(26 * 1024 * 1024, 0x20), "huge.dxf"), context: "SALES_ASSISTANT",
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(SourceArtifactPolicyError);
    expect((error as SourceArtifactPolicyError).code).toBe("SOURCE_ARTIFACT_SIZE_INVALID");
  });

  it("reuses an existing artifact for identical bytes and filename", async () => {
    resetPrisma();
    captureCreate();
    const existing = { id: "artifact-existing", citations: [] };
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(existing);
    const result = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(fullDrawing(), "latin1")), context: "SALES_ASSISTANT",
    });
    expect(result.idempotent).toBe(true);
    expect(result.artifact).toBe(existing);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("records inspection limitations on the artifact instead of dropping them", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({ companyId: "company-1", userId: "user-1", file: dxfFile(Buffer.from(fullDrawing(), "latin1")), context: "SALES_ASSISTANT" });
    const limitations = created.processingError as string;
    expect(limitations).toContain("ingestion metrics");
  });
});
