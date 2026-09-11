import { describe, expect, it } from "vitest";
import {
  DRAWING_OBSERVATION_TYPES,
  MAX_DRAWING_OBSERVATIONS_PER_PAGE,
  MAX_DRAWING_VALUE,
  mergeDrawingObservations,
  normalizeDrawingDrafts,
  normalizeDrawingTypeHint,
  shouldInspectDrawingPage,
  type ArtifactPage,
  type ObservedFact,
  type PageClassification,
  type VisualObservationDraft,
} from "@/src/domain/source-artifact";
import { analyzePdfBytes } from "../DocumentInspectionAnalyzer";
import {
  AMBIGUOUS_SHEET,
  BOQ_SHEET,
  DRAWING_SHEET,
  SCANNED_SHEET,
  TEXT_SHEET,
  VECTOR_ONLY_SHEET,
  buildPdf,
} from "./fixtures/pdfFixtures";

/**
 * Phase 2A-4 drawing inspection gate + bounded drawing vocabulary.
 *
 * The gate must qualify pages ONLY through explicit, reviewable evidence:
 * the accepted 2A-1B classification (which never fires on vector, image, or
 * size metrics) or an explicit drawing request corroborated by a marker.
 */

function pagesOf(specs: Parameters<typeof buildPdf>[0]) {
  const analyzed = analyzePdfBytes(buildPdf(specs));
  return { pages: analyzed.inspection.pages, classification: analyzed.classification };
}

function gate(spec: Parameters<typeof buildPdf>[0][number], intent: "DRAWING_INSPECTION" | "ATTACHMENT") {
  const { classification } = pagesOf([spec]);
  return shouldInspectDrawingPage({ intent, classification: classification.pages[0] ?? null });
}

describe("drawing inspection gate", () => {
  it("qualifies an explicitly marked drawing sheet without any special intent", () => {
    const decision = gate(DRAWING_SHEET, "ATTACHMENT");
    expect(decision.requested).toBe(true);
    expect(decision.reliability === "HIGH" || decision.reliability === "MEDIUM").toBe(true);
    expect(decision.evidence.some((item) => /drawing identifier/iu.test(item))).toBe(true);
  });

  it("bypasses a normal text PDF entirely", () => {
    const decision = gate(TEXT_SHEET, "ATTACHMENT");
    expect(decision.requested).toBe(false);
    expect(decision.reason).toContain("not drawing evidence");
  });

  it("bypasses a schedule page even with drawing intent (it is a BOQ page)", () => {
    expect(gate(BOQ_SHEET, "DRAWING_INSPECTION").requested).toBe(false);
  });

  it("a vector-heavy page alone never becomes a drawing (M3)", () => {
    const { pages, classification } = pagesOf([VECTOR_ONLY_SHEET]);
    expect(classification.pages[0]?.value).not.toBe("DRAWING");
    expect(pages[0]?.metrics && pages[0].metrics.vectorPathSegments).toBeGreaterThan(0);
    const decision = shouldInspectDrawingPage({ intent: "DRAWING_INSPECTION", classification: classification.pages[0] ?? null });
    expect(decision.requested).toBe(false);
  });

  it("an image-heavy page alone never becomes a drawing, even with explicit intent (M4)", () => {
    const { pages, classification } = pagesOf([SCANNED_SHEET]);
    expect(classification.pages[0]?.value).toBe("SCANNED_OR_IMAGE_ONLY");
    expect(pages[0]?.metrics && pages[0].metrics.imageCount).toBeGreaterThan(0);
    const decision = shouldInspectDrawingPage({ intent: "DRAWING_INSPECTION", classification: classification.pages[0] ?? null });
    expect(decision.requested).toBe(false);
  });

  it("page size alone is never drawing evidence", () => {
    const oversized = { ...TEXT_SHEET, width: 4700, height: 3300 };
    expect(gate(oversized, "DRAWING_INSPECTION").requested).toBe(false);
  });

  it("a single marker is weak alone but qualifies under explicit drawing intent", () => {
    const singleMarker = { width: 1684, height: 1191, lines: ["DRAWING NO: X-1"] };
    const { classification } = pagesOf([singleMarker]);
    expect(classification.pages[0]?.value).toBe("DRAWING");
    expect(classification.pages[0]?.reliability).toBe("LOW");
    expect(shouldInspectDrawingPage({ intent: "ATTACHMENT", classification: classification.pages[0]! }).requested).toBe(false);
    expect(shouldInspectDrawingPage({ intent: "DRAWING_INSPECTION", classification: classification.pages[0]! }).requested).toBe(true);
  });

  it("conflicting drawing+schedule evidence stays UNKNOWN and needs review instead of vision", () => {
    const decision = gate(AMBIGUOUS_SHEET, "DRAWING_INSPECTION");
    expect(decision.requested).toBe(false);
    expect(decision.reason).toMatch(/conflicting|UNKNOWN/iu);
  });

  it("a standalone image qualifies only when it is explicitly requested as a drawing", () => {
    expect(shouldInspectDrawingPage({ intent: "DRAWING_INSPECTION", classification: null }).requested).toBe(true);
    const rejected = shouldInspectDrawingPage({ intent: "ATTACHMENT", classification: null });
    expect(rejected.requested).toBe(false);
    expect(rejected.reason).toContain("no drawing evidence");
  });
});

// ---------------------------------------------------------------------------
// Bounded drawing vocabulary normalization
// ---------------------------------------------------------------------------

function drafts(items: Array<Partial<VisualObservationDraft>>): VisualObservationDraft[] {
  return items.map((item) => ({ type: item.type ?? "NOTE", description: item.description ?? "x", confidence: item.confidence ?? null, region: item.region ?? null, limitations: item.limitations ?? [] }));
}

function normalize(items: Array<Partial<VisualObservationDraft>>, overrides: Partial<Parameters<typeof normalizeDrawingDrafts>[1]> = {}) {
  return normalizeDrawingDrafts(drafts(items), {
    providerId: "test-provider",
    artifactId: "artifact-1",
    pageNumber: 4,
    attribution: "PAGE_TREE",
    surface: "PAGE",
    ...overrides,
  });
}

describe("bounded drawing observation normalization", () => {
  it("keeps only the drawing vocabulary; general visual types are dropped, never coerced", () => {
    const result = normalize([
      { type: "DRAWING_NUMBER", description: "M-201" },
      { type: "VISIBLE_OBJECT", description: "boxy thing" },
      { type: "QUANTITY_TAKEOFF", description: "37 detectors" },
      { type: "NOTE", description: "" },
    ]);
    expect(result.observations.map((item) => item.type)).toEqual(["DRAWING_NUMBER"]);
    expect(result.dropped).toBe(3);
    expect(result.limitations.join(" ")).toContain("dropped");
  });

  it("caps observations per page and reports the overflow", () => {
    const many = Array.from({ length: MAX_DRAWING_OBSERVATIONS_PER_PAGE + 6 }, (_, index) => ({
      type: "NOTE",
      description: `note ${index + 1}`,
    }));
    const result = normalize(many);
    expect(result.observations.length).toBe(MAX_DRAWING_OBSERVATIONS_PER_PAGE);
    expect(result.dropped).toBe(6);
  });

  it("clips over-long values with an explicit truncation note", () => {
    const result = normalize([{ type: "LEGEND_ENTRY", description: "L".repeat(MAX_DRAWING_VALUE + 50) }]);
    expect(result.observations[0]!.value.length).toBeLessThanOrEqual(MAX_DRAWING_VALUE + 1);
    expect(result.observations[0]!.limitations.join(" ")).toContain("truncated");
  });

  it("maps the drawing type hint onto the bounded vocabulary and unknown otherwise", () => {
    expect(normalizeDrawingTypeHint("Floor Plan").hint).toBe("plan");
    expect(normalizeDrawingTypeHint("REFLECTED CEILING PLAN").hint).toBe("plan");
    expect(normalizeDrawingTypeHint("Section").hint).toBe("section");
    expect(normalizeDrawingTypeHint("three-dimensional axonometric collage").hint).toBe("unknown");
    const result = normalize([{ type: "DRAWING_TYPE", description: "elevation view" }]);
    expect(result.observations[0]!.value).toBe("elevation");
    expect(result.observations[0]!.limitations.join(" ")).toContain("bounded hint vocabulary");
  });

  it("every observation is observed-only, artifact-attributed, and vision-attributed (M8)", () => {
    const result = normalize([{ type: "REVISION", description: "C" }]);
    const observation = result.observations[0]!;
    expect(observation.status).toBe("OBSERVED_NOT_APPROVED");
    expect(observation.artifactId).toBe("artifact-1");
    expect(observation.visualOrigin).toEqual({ source: "VISION", providerId: "test-provider" });
    expect(observation.origin).toBeUndefined();
    expect(observation.limitations.join(" ")).toContain("not an approved revision state");
  });

  it("printed scale is literal text only and never a measurement license (M9, M10)", () => {
    const result = normalize([{ type: "PRINTED_SCALE", description: "1:100" }]);
    const observation = result.observations[0]!;
    expect(observation.value).toBe("1:100");
    expect(observation.limitations.join(" ").toLowerCase()).toContain("literal text only");
    expect(observation.limitations.join(" ")).toContain("no geometric measurement or scale conversion was performed");
  });

  it("title-block party text never becomes a supplier (section C)", () => {
    const result = normalize([{ type: "TITLE_BLOCK_PARTY", description: "CONSULTANT: ABC Engineers" }]);
    expect(result.observations[0]!.limitations.join(" ")).toContain("not a supplier");
  });

  it("a symbol candidate is never a count and no quantity type can exist (M13)", () => {
    const result = normalize([{ type: "SYMBOL_CANDIDATE", description: "circle with an inscribed cross" }]);
    expect(result.observations[0]!.limitations.join(" ")).toContain("not counted");
    expect(result.observations.some((item) => item.type === "QUANTITY")).toBe(false);
    expect(result.observations.some((item) => item.type === "UNIT")).toBe(false);
  });

  it("keeps null page provenance when attribution is unproven (M17)", () => {
    const result = normalize([{ type: "DRAWING_NUMBER", description: "A-201" }], { pageNumber: null, attribution: "UNATTRIBUTED" });
    const observation = result.observations[0]!;
    expect(observation.pageNumber).toBeNull();
    expect(observation.attribution).toBe("UNATTRIBUTED");
    expect(observation.evidence.locator).toContain("unattributed drawing page");
  });

  it("carries the proven page number and region locator for qualified pages (M6, M7)", () => {
    const result = normalize([
      { type: "DRAWING_NUMBER", description: "M-201", region: "lower-right" },
      { type: "SHEET_NUMBER", description: "3 of 12" },
    ]);
    expect(result.observations[0]!.pageNumber).toBe(4);
    expect(result.observations[0]!.evidence.locator).toBe("drawing page 4, lower-right");
    expect(result.observations[1]!.pageNumber).toBe(4);
  });

  it("the vocabulary covers the full bounded set from the slice", () => {
    expect([...DRAWING_OBSERVATION_TYPES]).toEqual([
      "DRAWING_TITLE", "DRAWING_NUMBER", "SHEET_NUMBER", "REVISION", "DISCIPLINE", "PRINTED_SCALE",
      "DRAWING_TYPE", "PROJECT_NAME", "TITLE_BLOCK_PARTY", "LEGEND_ENTRY", "NOTE", "EQUIPMENT_REFERENCE",
      "ROOM_OR_ZONE", "DETAIL_REFERENCE", "SECTION_REFERENCE", "ELEVATION_REFERENCE", "SYMBOL_CANDIDATE",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Native / OCR / drawing-vision separation
// ---------------------------------------------------------------------------

function textFact(overrides: Partial<ObservedFact> & { type: ObservedFact["type"]; value: string }): ObservedFact {
  return {
    status: "OBSERVED_NOT_APPROVED",
    pageNumber: 4,
    attribution: "PAGE_TREE",
    reliability: "HIGH",
    evidence: { snippet: overrides.value, locator: "page 4, line 3", lineNumber: 3 },
    limitations: [],
    ...overrides,
  };
}

function visionFact(type: ObservedFact["type"], value: string, pageNumber: number | null = 4): ObservedFact {
  return normalize([{ type, description: value }], { pageNumber }).observations[0]!;
}

describe("drawing observations vs text readings", () => {
  it("a revision conflict keeps BOTH values with their own provenance and never picks one (M15)", () => {
    const text = [textFact({ type: "REVISION", value: "REV B" })];
    const vision = [visionFact("REVISION", "REV C")];
    const merged = mergeDrawingObservations(text, vision);
    expect(merged.observations.map((item) => item.value)).toEqual(["REV B", "REV C"]);
    expect(merged.observations[0]!.origin).toBeUndefined();
    expect(merged.observations[1]!.visualOrigin).toBeDefined();
    expect(merged.conflictNotes).toHaveLength(1);
    expect(merged.conflictNotes[0]).toContain("both values were kept for review");
    expect(merged.conflictNotes[0]).toContain("REV B");
    expect(merged.conflictNotes[0]).toContain("REV C");
    expect(merged.conflictNotes[0]).toContain("native text");
  });

  it("an OCR-versus-vision disagreement names the OCR channel", () => {
    const text = [textFact({ type: "REVISION", value: "0", origin: { textSource: "OCR", engineId: "e" } })];
    const merged = mergeDrawingObservations(text, [visionFact("REVISION", "C")]);
    expect(merged.conflictNotes[0]).toContain("OCR text");
  });

  it("exact agreement is kept once and reported, never silently merged away", () => {
    const text = [textFact({ type: "DRAWING_OR_SHEET_NUMBER", value: "M-201" })];
    const merged = mergeDrawingObservations(text, [visionFact("DRAWING_NUMBER", "M-201")]);
    expect(merged.observations).toHaveLength(1);
    expect(merged.agreements).toBe(1);
    expect(merged.conflictNotes).toHaveLength(0);
  });

  it("room/zone and legend observations are observation-only content", () => {
    const merged = mergeDrawingObservations([], [
      visionFact("ROOM_OR_ZONE", "MEP ROOM 3"),
      visionFact("LEGEND_ENTRY", "FCU = fan coil unit"),
    ]);
    expect(merged.observations.map((item) => item.type).sort()).toEqual(["LEGEND_ENTRY", "ROOM_OR_ZONE"]);
    for (const item of merged.observations) expect(item.status).toBe("OBSERVED_NOT_APPROVED");
  });

  it("a page classification with provenance flows from the caller, never from the provider echo", () => {
    const { pages } = pagesOf([DRAWING_SHEET]);
    const page = pages[0] as ArtifactPage;
    expect(page.attribution).toBe("PAGE_TREE");
    expect(page.pageNumber).toBe(1);
  });

  it("null page classification inputs never throw and never qualify for general attachments", () => {
    const decision = shouldInspectDrawingPage({ intent: "ATTACHMENT", classification: null as unknown as PageClassification | null });
    expect(decision.requested).toBe(false);
  });
});
