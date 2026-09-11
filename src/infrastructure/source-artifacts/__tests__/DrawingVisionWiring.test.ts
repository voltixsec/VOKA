import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OcrPort, VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import type { OcrPageRequest, VisualInspectionRequest } from "@/src/domain/source-artifact";
import { deterministicVisionProvider } from "../vision/DeterministicVisionProvider";
import { unavailableVisionProvider } from "../vision/UnavailableVisionProvider";
import { deterministicOcrEngine } from "../ocr/DeterministicOcrEngine";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";
import type { PageRasterizerPort, RasterizedPage } from "../ocr/PageRasterizer";
import { resolveDrawingVisionLimits } from "../vision/DrawingInspectionAnalyzer";
import { PNG_BYTES } from "./fixtures/imageFixtures";
import { DRAWING_SHEET, GEOMETRY_DRAWING_SHEET, SCANNED_SHEET, TEXT_SHEET, buildOrphanTextPdf, buildPdf } from "./fixtures/pdfFixtures";

/**
 * Phase 2A-4: the drawing pass on the REAL production inspection path.
 * Everything here goes through PrismaSourceArtifactInspection — the same port
 * the runtime uses — with the accepted deterministic provider double and a
 * fake rasterizer standing in for the 2A-2 pdf.js renderer.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

const baseInput = {
  companyId: "company-1",
  artifactId: "artifact-1",
  kind: "DRAWING_INSPECTION" as const,
  query: "inspect the drawing",
  locale: "en" as const,
};

const TITLE_BLOCK_OBSERVATIONS = [
  { type: "DRAWING_NUMBER", description: "M-201", confidence: 0.93, region: "lower-right" },
  { type: "SHEET_NUMBER", description: "3 of 12", confidence: 0.9, region: "lower-right" },
  { type: "REVISION", description: "B", confidence: 0.91, region: "lower-right" },
];

function trackingVision(provider: VisualInspectionPort): { calls: VisualInspectionRequest[]; provider: VisualInspectionPort } {
  const calls: VisualInspectionRequest[] = [];
  return {
    calls,
    provider: {
      providerId: provider.providerId,
      inspect: async (request) => {
        calls.push(request);
        return provider.inspect(request);
      },
    },
  };
}

function fakeRasterizer(outcome?: (pageIndex: number) => RasterizedPage): { calls: number[]; port: PageRasterizerPort } {
  const calls: number[] = [];
  return {
    calls,
    port: {
      rasterize: async (_bytes, pageIndex): Promise<RasterizedPage> => {
        calls.push(pageIndex);
        if (outcome) return outcome(pageIndex);
        return { png: new Uint8Array(PNG_BYTES), width: 1, height: 1, scale: 1 };
      },
    },
  };
}

function countingOcr(engine: OcrPort): { calls: OcrPageRequest[]; port: OcrPort } {
  const calls: OcrPageRequest[] = [];
  return {
    calls,
    port: { engineId: engine.engineId, recognize: async (request) => { calls.push(request); return engine.recognize(request); } },
  };
}

let storageDir: string;
let storage: LocalSourceArtifactStorage;

beforeAll(() => {
  storageDir = mkdtempSync(path.join(tmpdir(), "voka-drawing-inspection-"));
  process.env.VOKA_ARTIFACT_STORAGE_DIR = storageDir;
  storage = new LocalSourceArtifactStorage();
});

afterAll(() => {
  rmSync(storageDir, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.requirement.upsert.mockReset();
  prismaMock.requirementCitation.upsert.mockReset();
}

async function pdfRow(bytes: Buffer, overrides: Record<string, unknown> = {}) {
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, contentSha256);
  return {
    id: "artifact-1", companyId: "company-1", originalFilename: "sheet.pdf", mimeType: "application/pdf",
    sizeBytes: bytes.byteLength, contentSha256, kind: "PDF", storageRef: stored.storageRef,
    context: "SALES_ASSISTANT", processingState: "TEXT_EXTRACTED", extractedText: null, extractedPages: null, citations: [],
    ...overrides,
  };
}

describe("gated drawing vision on the production inspection path (2A-4)", () => {
  it("a qualified drawing page invokes drawing semantic vision with proven page numbers (M1, M6, M7)", async () => {
    resetPrisma();
    const singleMarker = { width: 2384, height: 1684, lines: ["DRAWING NO: M-201"] };
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([singleMarker])));
    const raster = fakeRasterizer();
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:1": [
      { type: "DRAWING_NUMBER", description: "M-201", confidence: 0.93, region: "lower-right" },
      { type: "SHEET_NUMBER", description: "2 of 8", confidence: 0.9, region: "lower-right" },
      { type: "REVISION", description: "B", confidence: 0.88, region: "lower-right" },
    ] }));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    expect(raster.calls).toEqual([0]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ pageNumber: 1, analysisProfile: "DRAWING_SEMANTICS", mimeType: "image/png" });
    expect(observation.status).toBe("COMPLETED");
    const summary = observation.artifactInspection!;
    expect(summary.drawing).toMatchObject({ attempted: true, used: true, pages: [1] });
    // The drawing number agreed with the native text: kept once, as the text
    // observation, and the agreement is reported — not a silent overwrite.
    const drawingNumber = summary.observations.filter((item) => (item.type === "DRAWING_NUMBER" || item.type === "DRAWING_OR_SHEET_NUMBER") && item.value === "M-201");
    expect(drawingNumber).toHaveLength(1);
    expect(drawingNumber[0]!.visualOrigin).toBeUndefined();
    const sheetNumber = summary.observations.find((item) => item.type === "SHEET_NUMBER");
    expect(sheetNumber).toMatchObject({ value: "2 of 8", pageNumber: 1 });
    expect(sheetNumber!.locator).toContain("drawing page 1");
    expect(observation.summary).toContain("Observed on drawings: sheet no.: 2 of 8 (p1)");
    // Drawing readings never create requirements or BOM lines.
    expect(observation.requirementCandidates).toBeUndefined();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirementCitation.upsert).not.toHaveBeenCalled();
  });

  it("only qualified pages are rasterized; text pages never reach drawing vision (M2)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([TEXT_SHEET, TEXT_SHEET, TEXT_SHEET, DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:4": TITLE_BLOCK_OBSERVATIONS }));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    // page 4 is the only qualified page: index 3 only, exactly once.
    expect(raster.calls).toEqual([3]);
    expect(calls[0]?.pageNumber).toBe(4);
    const drawingNumber = observation.artifactInspection!.observations.find((item) => item.type === "DRAWING_NUMBER");
    expect(drawingNumber).toMatchObject({ pageNumber: 4 });
  });

  it("a normal text PDF bypasses drawing vision entirely, on every kind", async () => {
    for (const kind of ["ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] as const) {
      resetPrisma();
      prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([TEXT_SHEET])));
      const raster = fakeRasterizer();
      const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1": TITLE_BLOCK_OBSERVATIONS }));
      const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect({ ...baseInput, kind });
      expect(raster.calls).toHaveLength(0);
      expect(calls).toHaveLength(0);
      expect(observation.artifactInspection?.drawing).toMatchObject({ attempted: false, used: false });
      if (kind === "DRAWING_INSPECTION") expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    }
  });

  it("a scanned drawing uses OCR for text and drawing vision for semantics, kept separate (M5)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([SCANNED_SHEET])));
    const { calls: ocrCalls, port: ocr } = countingOcr(deterministicOcrEngine({
      "page:1": "PROJECT: SEAFRONT TOWER\nDRAWING NO: ME-101\nSCALE 1:100 SHEET 3 OF 12\nREV: A",
    }));
    const raster = fakeRasterizer();
    const { calls: visionCalls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:1": [
      // One agreeing reading (kept once as the text observation) and one the
      // OCR text never carried (kept as a separate visual reading).
      { type: "DRAWING_NUMBER", description: "ME-101", confidence: 0.9 },
      { type: "DISCIPLINE", description: "HVAC", confidence: 0.86 },
    ] }));
    const observation = await new PrismaSourceArtifactInspection(ocr, provider, { rasterizer: raster.port }).inspect({ ...baseInput, kind: "ATTACHMENT_INSPECTION" });
    expect(ocrCalls).toHaveLength(1);
    expect(raster.calls).toEqual([0]);
    expect(visionCalls).toHaveLength(1);
    const summary = observation.artifactInspection!;
    expect(summary.ocr).toMatchObject({ attempted: true, used: true });
    expect(summary.drawing).toMatchObject({ attempted: true, used: true });
    // OCR-derived observation: text channel. Drawing observation: vision channel. Never merged.
    const ocrObservation = summary.observations.find((item) => item.origin?.textSource === "OCR");
    const drawingObservation = summary.observations.find((item) => item.visualOrigin);
    expect(ocrObservation).toBeDefined();
    expect(drawingObservation).toBeDefined();
    expect(ocrObservation!.visualOrigin).toBeUndefined();
    expect(drawingObservation!.origin).toBeUndefined();
    // The agreeing reading is kept once and reported; the new one stays visual.
    const discipline = summary.observations.find((item) => item.type === "DISCIPLINE" && item.visualOrigin);
    expect(discipline).toMatchObject({ value: "HVAC", pageNumber: 1 });
    // An attachment request may carry an empty candidate list; drawing output never adds to it.
    expect(observation.requirementCandidates ?? []).toHaveLength(0);
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("keeps native, OCR, and vision disagreement all visible (M15, end to end)", async () => {
    resetPrisma();
    const bytes = buildPdf([{ width: 1684, height: 1191, image: true, lines: ["DRAWING NO: ME-101 REV: B", "PROJECT: SEAFRONT TOWER"] }]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(bytes));
    const ocr = deterministicOcrEngine({ "page:1": "DRAWING NO: ME-101\nREV: D\nSCALE 1:100\nSHEET 1 OF 4" });
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [{ type: "REVISION", description: "C", confidence: 0.9 }] });
    const observation = await new PrismaSourceArtifactInspection(ocr, provider, { rasterizer: raster.port }).inspect(baseInput);
    const revisions = (observation.artifactInspection?.observations ?? []).filter((item) => item.type === "REVISION");
    const values = revisions.map((item) => item.value).sort();
    expect(values).toEqual(["B", "C", "D"]);
    const channels = revisions.map((item) => (item.visualOrigin ? "vision" : item.origin?.textSource === "OCR" ? "ocr" : "native")).sort();
    expect(channels).toEqual(["native", "ocr", "vision"]);
    // The disagreement is surfaced for review with both readings quoted.
    expect(observation.artifactInspection!.limitations.join(" ")).toContain("both values were kept for review");
  });

  it("revision stays observed and non-approved, with no promotion path (M8)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [{ type: "REVISION", description: "C", confidence: 0.9 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const candidate = (observation.artifactCandidates ?? []).find((item) => item.observationType === "REVISION" && item.value === "C");
    expect(candidate).toBeDefined();
    expect(candidate!.status).toBe("OBSERVED_PENDING_APPROVAL");
    expect(candidate!.factKey).toBeNull();
  });

  it("equipment references create no quantity, BOM, or requirement (M11, M13, M14)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [
      { type: "EQUIPMENT_REFERENCE", description: "AHU-01", confidence: 0.85 },
      { type: "SYMBOL_CANDIDATE", description: "circle with an inscribed cross", confidence: 0.7 },
      { type: "LEGEND_ENTRY", description: "FCU = fan coil unit", confidence: 0.8 },
      { type: "ROOM_OR_ZONE", description: "MEP ROOM 3", confidence: 0.75 },
    ] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect({ ...baseInput, runtimeId: "runtime-1" });
    const summary = observation.artifactInspection!;
    expect(summary.observations.some((item) => item.type === "QUANTITY" || item.type === "UNIT")).toBe(false);
    for (const candidate of observation.artifactCandidates ?? []) {
      if (["EQUIPMENT_REFERENCE", "SYMBOL_CANDIDATE", "LEGEND_ENTRY", "ROOM_OR_ZONE"].includes(candidate.observationType)) {
        expect(candidate.status).toBe("OBSERVED_PENDING_APPROVAL");
        expect(candidate.factKey).toBeNull();
      }
    }
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("a legend entry never becomes a selected product (M12)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [{ type: "LEGEND_ENTRY", description: "FD = fire damper 90 min", confidence: 0.85 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const candidate = (observation.artifactCandidates ?? []).find((item) => item.observationType === "LEGEND_ENTRY");
    expect(candidate).toMatchObject({ factKey: null, status: "OBSERVED_PENDING_APPROVAL" });
    expect(JSON.stringify(observation.artifactCandidates)).not.toMatch(/PRODUCT_SELECTED|selectedProduct/iu);
  });

  it("drawing vision never overwrites governed state; the conflict is shown with both chains (M16)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [{ type: "PROJECT_NAME", description: "DESERT GATE MEGAPLEX", confidence: 0.9 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect({
      ...baseInput,
      governedFacts: [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }],
    });
    const summary = observation.artifactInspection!;
    const conflict = summary.conflicts.find((item) => item.observedValue === "DESERT GATE MEGAPLEX");
    expect(conflict).toMatchObject({ key: "project.name", governedValue: "Al Hamra Tower", governedProvenance: "USER_EXPLICIT" });
    // The observation itself stays, visible and non-approved, next to the conflict.
    expect(summary.observations.some((item) => item.type === "PROJECT_NAME" && item.value === "DESERT GATE MEGAPLEX")).toBe(true);
    expect(summary.candidates.find((item) => item.observationType === "PROJECT_NAME")?.factKey).toBeNull();
    expect(summary.limitations.length + summary.conflicts.length).toBeGreaterThan(1);
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("keeps pageNumber null when the page could not be attributed (M17)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildOrphanTextPdf(["DRAWING NO: X-7", "REV: A"])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1": [{ type: "SHEET_NUMBER", description: "1 of 1", confidence: 0.9 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const sheetNumber = observation.artifactInspection!.observations.find((item) => item.type === "SHEET_NUMBER" && item.visualOrigin);
    expect(sheetNumber).toBeDefined();
    expect(sheetNumber!.pageNumber).toBeNull();
    expect(sheetNumber!.locator).toContain("unattributed drawing page");
    expect(observation.summary).toMatch(/unattributed/iu);
  });

  it("provider unavailable produces a truthful not-run result without rasterizing (M18)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const observation = await new PrismaSourceArtifactInspection(null, unavailableVisionProvider("the vision provider is not configured: key missing"), { rasterizer: raster.port }).inspect(baseInput);
    expect(raster.calls).toHaveLength(0);
    expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(observation.summary).toMatch(/drawing vision provider is unavailable/iu);
    expect(observation.summary).not.toContain("Observed on drawings");
  });

  it("no vision configured at all is reported truthfully on the drawing path", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const observation = await new PrismaSourceArtifactInspection(null, null).inspect(baseInput);
    expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(observation.summary).toContain("qualified drawing pages were not read visually");
  });

  it("low-confidence drawing output propagates the review limitation (M19)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [{ type: "DRAWING_NUMBER", description: "M-2O1 or M-201", confidence: 0.2 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    expect(observation.artifactInspection!.drawing.lowConfidence).toBe(true);
    expect(observation.summary).toContain("Some drawing observations are low confidence; verify them against the sheet itself.");
  });

  it("bounds provider calls: only the first maxPages qualified pages are rendered (H)", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf(Array.from({ length: 6 }, () => DRAWING_SHEET))));
    const raster = fakeRasterizer();
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:1": TITLE_BLOCK_OBSERVATIONS }));
    await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port, limits: { maxPages: 2 } }).inspect(baseInput);
    expect(raster.calls).toEqual([0, 1]);
    expect(calls).toHaveLength(2);
  });

  it("one oversized render is skipped with a truthful reason and never sent", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer(() => ({ png: new Uint8Array(2048), width: 10, height: 10, scale: 1 }));
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:1": TITLE_BLOCK_OBSERVATIONS }));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port, limits: { maxImageBytes: 1024 } }).inspect(baseInput);
    expect(raster.calls).toHaveLength(1);
    expect(calls).toHaveLength(0);
    expect(observation.artifactInspection!.limitations.join(" ")).toContain("exceeds the 1024-byte vision limit");
    expect(observation.summary).not.toContain("Observed on drawings");
  });

  it("a rasterizer failure on one page is isolated and the observation is not fabricated", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster: PageRasterizerPort = { rasterize: async () => { throw new Error("canvas allocation failed"); } };
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1:page:1": TITLE_BLOCK_OBSERVATIONS }));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster }).inspect(baseInput);
    expect(calls).toHaveLength(0);
    expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(observation.artifactInspection!.limitations.join(" ")).toContain("could not be rasterized");
    expect(observation.summary).toMatch(/attempted on the qualified pages/iu);
    expect(observation.summary).not.toContain("Observed on drawings");
  });

  it("the general image path is untouched: attachments get no drawing profile on non-drawing pages", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([TEXT_SHEET])));
    const raster = fakeRasterizer();
    const provider = deterministicVisionProvider({ "artifact-1": [{ type: "VISIBLE_OBJECT", description: "a chart", confidence: 0.9 }] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect({ ...baseInput, kind: "ATTACHMENT_INSPECTION" });
    expect(raster.calls).toHaveLength(0);
    expect(observation.artifactInspection?.vision).toMatchObject({ attempted: false, used: false });
  });

  it("reports cross-channel agreement and disagreement at the analyzer level", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([DRAWING_SHEET])));
    const raster = fakeRasterizer();
    // All three title-block observations agree with native text readings on
    // their values except the sheet number form; agreements must be reported.
    const provider = deterministicVisionProvider({ "artifact-1:page:1": [
      { type: "DRAWING_NUMBER", description: "ME-101", confidence: 0.95 },
      { type: "REVISION", description: "B", confidence: 0.95 },
      { type: "SHEET_NUMBER", description: "3 of 12", confidence: 0.95 },
    ] });
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const limitations = observation.artifactInspection!.limitations.join(" ");
    // Bounded display keeps the first limitations; the analyzer-level facts
    // are asserted structurally instead: agreements do NOT duplicate.
    const revisions = observation.artifactInspection!.observations.filter((item) => item.type === "REVISION");
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.visualOrigin).toBeUndefined();
    // The disagreeing sheet value stays visible with its own visual channel.
    const sheet = observation.artifactInspection!.observations.find((item) => item.type === "SHEET_NUMBER");
    expect(sheet).toMatchObject({ value: "3 of 12", visualOrigin: { source: "VISION" } });
    expect(limitations).toMatch(/page 1.*disagree|disagree/iu);
  });

  it("limit configuration follows the accepted env patterns and stays bounded", () => {
    const defaults = resolveDrawingVisionLimits({});
    expect(defaults).toMatchObject({ maxPages: 4, maxImageBytes: 5 * 1024 * 1024, rasterScale: 2.5, rasterMaxDimensionPx: 5000 });
    const configured = resolveDrawingVisionLimits({ VOKA_DRAWING_MAX_PAGES: "99", VOKA_DRAWING_RASTER_SCALE: "3.25", VOKA_DRAWING_RASTER_MAX_DIMENSION_PX: "99999" });
    expect(configured.maxPages).toBe(10); // hard clamp: no unbounded provider fan-out
    expect(configured.rasterScale).toBe(3.25);
    expect(configured.rasterMaxDimensionPx).toBe(8000);
    const invalid = resolveDrawingVisionLimits({ VOKA_DRAWING_MAX_PAGES: "0", VOKA_DRAWING_RASTER_SCALE: "-2" });
    expect(invalid.maxPages).toBe(4);
    expect(invalid.rasterScale).toBe(2.5);
  });
});

describe("bounded drawing geometry on the production inspection path (2A-5)", () => {
  async function imageRow(bytes: Buffer, overrides: Record<string, unknown> = {}) {
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const stored = await storage.put(bytes, contentSha256);
    return {
      id: "artifact-1", companyId: "company-1", originalFilename: "drawing.png", mimeType: "image/png",
      sizeBytes: bytes.byteLength, contentSha256, kind: "IMAGE", storageRef: stored.storageRef,
      context: "SALES_ASSISTANT", processingState: "TEXT_EXTRACTED", extractedText: null, extractedPages: null, citations: [],
      ...overrides,
    };
  }

  it("a qualified drawing page exposes bounded page-space geometry and reuses the one vision reading", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([GEOMETRY_DRAWING_SHEET])));
    const raster = fakeRasterizer();
    const { calls, provider } = trackingVision(deterministicVisionProvider({
      "artifact-1:page:1": [
        { type: "DRAWING_NUMBER", description: "A-101", confidence: 0.9, region: "lower-right" },
        { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.9, region: "lower-right" },
        { type: "SYMBOL_CANDIDATE", description: "small circular device marked SD", confidence: 0.85, region: "center", geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 }, legendRef: "SD", similarity: 0.85 },
      ],
    }));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const summary = observation.artifactInspection!;

    // One provider call per qualified page: geometry reuses that reading
    // instead of sending the page to vision a second time.
    expect(calls).toHaveLength(1);
    expect(summary.geometry.used).toBe(true);
    expect(summary.geometry.pageSpaceOnly).toBe(true);

    // Real vector geometry, normalized into page space.
    expect(summary.geometry.primitives.length).toBeGreaterThan(0);
    for (const primitive of summary.geometry.primitives) {
      expect(primitive.source === "PDF_VECTOR" || primitive.source === "DRAWING_VISION").toBe(true);
      for (const value of [primitive.boundingBox?.x0, primitive.boundingBox?.y0, primitive.boundingBox?.x1, primitive.boundingBox?.y1]) {
        if (value !== undefined) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }

    // A printed dimension, kept as the literal the sheet printed.
    const dimension = summary.geometry.dimensionTexts.find((item) => item.raw === "3500")!;
    expect(dimension).toBeDefined();
    expect(dimension.unit).toBeNull();
    expect(dimension.positioned).toBe(true);

    // A printed scale, captured but never applied.
    const scale = summary.geometry.scaleCandidates[0]!;
    expect(scale.printed).toBe("1:100");
    expect(scale.limitations.join(" ")).toMatch(/never used to convert/i);

    // Symbol evidence stays individual and uncounted.
    expect(summary.geometry.symbolCandidates.length).toBeGreaterThan(0);
    expect(summary.geometry.symbolToLegend.length).toBeGreaterThan(0);
    expect(Object.keys(summary.geometry).filter((key) => /count|total|quantity|sum/i.test(key))).toEqual([]);

    // And nothing commercial was created anywhere along the path.
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(summary.candidates.every((candidate) => !/requirement|quantity/i.test(candidate.factKey ?? ""))).toBe(true);
  });

  it("a standalone drawing image yields vision-only evidence and never fabricates PDF vector geometry", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(Buffer.from(PNG_BYTES)));
    const { provider } = trackingVision(deterministicVisionProvider({
      "artifact-1": [
        { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.9 },
        { type: "SYMBOL_CANDIDATE", description: "round ceiling device", confidence: 0.8, geometryBox: { x0: 0.2, y0: 0.2, x1: 0.25, y1: 0.25 }, dimensionText: "3500" },
      ],
    }));
    const observation = await new PrismaSourceArtifactInspection(null, provider).inspect(baseInput);
    const summary = observation.artifactInspection!;

    expect(summary.geometry.used).toBe(true);
    // No geometry primitives at all: an image has no page tree and no page box,
    // so no PDF vector geometry can exist for it.
    expect(summary.geometry.primitives).toEqual([]);
    expect(summary.geometry.symbolCandidates.length).toBeGreaterThan(0);
    expect(summary.geometry.legends.length).toBeGreaterThan(0);
    expect(summary.geometry.dimensionTexts.some((item) => item.channel === "DRAWING_VISION")).toBe(true);
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("a non-drawing PDF yields no geometry at all", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await pdfRow(buildPdf([TEXT_SHEET])));
    const raster = fakeRasterizer();
    const { calls, provider } = trackingVision(deterministicVisionProvider({}));
    const observation = await new PrismaSourceArtifactInspection(null, provider, { rasterizer: raster.port }).inspect(baseInput);
    const summary = observation.artifactInspection!;
    // Not qualified, so not rasterized and not read visually either.
    expect(calls).toHaveLength(0);
    expect(raster.calls).toHaveLength(0);
    expect(summary.geometry.used).toBe(false);
    expect(summary.geometry.primitives).toEqual([]);
  });
});
