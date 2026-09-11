import { describe, expect, it } from "vitest";
import type { ArtifactAnalysisInput } from "@/src/application/source-artifacts";
import { projectArtifactInspection, renderInspectionBrief } from "@/src/application/source-artifacts";
import { GEOMETRY_DRAWING_SHEET, buildPdf, type PageSpec } from "./fixtures/pdfFixtures";
import { analyzePdfBytes } from "../DocumentInspectionAnalyzer";
import { analyzeDrawingGeometry, toDrawingGeometryProjection, type DrawingVisionDraftPage } from "../DrawingGeometryAnalyzer";

/**
 * Phase 2A-5: the assistant-facing brief and the governance boundary.
 *
 * These tests run the real production chain — PDF bytes, the accepted
 * classifier, the drawing gate, the geometry analyzer, the governed
 * projection — and then assert on what the assistant is allowed to say and
 * what must never appear in it.
 */

const VISION_DRAFTS: DrawingVisionDraftPage[] = [
  {
    pageNumber: 1,
    attribution: "PAGE_TREE",
    providerId: "geometry-brief-provider",
    drafts: [
      { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.9 },
      { type: "SYMBOL_CANDIDATE", description: "small circular device marked SD", confidence: 0.85, geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 }, legendRef: "SD", similarity: 0.85 },
    ],
  },
];

function project(specs: PageSpec[], withGeometry: boolean) {
  const bytes = buildPdf(specs);
  const analyzed = analyzePdfBytes(bytes);
  const geometry = analyzeDrawingGeometry(analyzed, {
    artifactId: "artifact-1",
    pdfBytes: bytes,
    intent: "ATTACHMENT",
    visionDrafts: VISION_DRAFTS,
  });
  const analysis: ArtifactAnalysisInput = {
    inspection: analyzed.inspection,
    classification: analyzed.classification,
    observations: analyzed.observations,
    limitations: analyzed.limitations,
    ...(withGeometry ? { geometry: toDrawingGeometryProjection(geometry) } : {}),
  };
  const summary = projectArtifactInspection({
    artifactId: "artifact-1",
    filename: "level-6-plan.pdf",
    kind: "PDF",
    analysis,
    status: "INSPECTED",
  });
  return { summary, geometry, analyzed };
}

describe("DrawingGeometry brief — governance boundary", () => {
  it("24. geometry produces no BOM", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    expect(summary.governance.join(" ")).toMatch(/no quantity takeoff or BOM was produced/i);
    expect(renderInspectionBrief(summary, "en")).toMatch(/no quantity takeoff or bill of materials was produced/i);
    // No BOM structure exists. The only place the word appears is inside the
    // disclosure phrases that say one was not produced.
    const keys = Object.keys(summary.geometry);
    expect(keys.filter((key) => /bom/i.test(key))).toEqual([]);
    const arrays = keys.filter((key) => Array.isArray((summary.geometry as unknown as Record<string, unknown>)[key]));
    expect(arrays.length).toBeGreaterThan(0);
    for (const key of arrays) {
      expect(key).toMatch(/primitives|dimension|scale|pages|legends|symbol|conflicts|limitations/i);
    }
  });

  it("25. geometry produces no Requirement", () => {
    const withGeometry = project([GEOMETRY_DRAWING_SHEET], true).summary;
    const without = project([GEOMETRY_DRAWING_SHEET], false).summary;
    // Geometry adds no governed candidate at all, so it cannot create a
    // Requirement: the candidate list is byte-for-byte the same.
    expect(withGeometry.candidates).toEqual(without.candidates);
    expect(withGeometry.candidates.every((candidate) => candidate.factKey !== "requirement")).toBe(true);
  });

  it("26. geometry produces no quotation line", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    const serialized = JSON.stringify(summary.geometry);
    for (const forbidden of ["quotation", "lineItem", "unitPrice", "price", "totalAmount"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("27. geometry creates no commercial state", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    const keys = Object.keys(summary.geometry);
    for (const key of keys) {
      expect(key).not.toMatch(/supplier|vendor|product|price|cost|quantity|requirement|bom|quotation|approval/i);
    }
    expect(summary.geometry.pageSpaceOnly).toBe(true);
    // Everything stays observed and non-approved; nothing is promoted.
    for (const primitive of summary.geometry.primitives) {
      expect(primitive.evidence.locator.length).toBeGreaterThan(0);
    }
  });
});

describe("DrawingGeometry brief — EN and AR", () => {
  it("31. the English brief is truthful about what was and was not done", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    const en = renderInspectionBrief(summary, "en");
    expect(en).toContain("I can read a printed dimension of 3500");
    expect(en).toContain("near a dimension-line candidate on page 1");
    expect(en).toContain("I have not converted it into a real-world measurement");
    expect(en).toMatch(/page-space position only/i);
    expect(en).toMatch(/No symbol was counted and no quantity takeoff or bill of materials was produced/i);
    expect(en).toContain("The sheet prints a scale of 1:100");
    expect(en).toMatch(/I did not use it to measure any distance/i);
    expect(en).toContain("legend entry 'SD — Smoke Detector'");
    expect(en).toContain("I have not counted symbol instances");
  });

  it("32. the Arabic brief carries the same disclosures", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    const ar = renderInspectionBrief(summary, "ar");
    expect(ar).toContain("أستطيع قراءة بُعد مطبوع قيمته 3500");
    expect(ar).toContain("مرشح خط أبعاد في الصفحة 1");
    expect(ar).toContain("لم أحوّله إلى قياس حقيقي");
    expect(ar).toMatch(/مساحة الصفحة/);
    expect(ar).toMatch(/لم يُعَدّ أي رمز/);
    expect(ar).toContain("1:100");
    expect(ar).toMatch(/لم أستخدمه لقياس أي مسافة/);
    expect(ar).toContain("مدخل المفتاح «SD — Smoke Detector»");
    expect(ar).toContain("لم أعدّ حالات الرمز");
  });

  it("33. the brief leaks no internal enum, channel, or status token", () => {
    const { summary } = project([GEOMETRY_DRAWING_SHEET], true);
    const tokens = [
      "PDF_VECTOR",
      "DRAWING_VISION",
      "NATIVE_TEXT",
      "OCR_TEXT",
      "SCALE_CALIBRATION_CANDIDATE_NOT_APPLIED",
      "SCALE_CALIBRATION",
      "ASSOCIATION_CANDIDATE",
      "OBSERVED_NOT_APPROVED",
      "OBSERVED_PENDING_APPROVAL",
      "SYMBOL_REGION",
      "LINE_SEGMENT",
      "DIMENSION_LINE_CANDIDATE",
      "LEGEND_SYMBOL_DEFINITION",
      "SYMBOL_INSTANCE_CANDIDATE",
      "SYMBOL_TO_LEGEND_CANDIDATE",
      "SYMBOL_TO_EQUIPMENT_REFERENCE_CANDIDATE",
      "EXPLICIT_LEGEND_LABEL",
      "VISUAL_SIMILARITY",
      "VECTOR_SHAPE_SIMILARITY",
      "SAME_PAGE_LEGEND_DEFINITION",
      "NEARBY_EQUIPMENT_OR_TAG_TEXT",
      "DIMENSION_TEXT",
      "DIMENSION_UNIT",
      "LEVEL_REFERENCE",
      "GRID_REFERENCE",
    ];
    for (const locale of ["en", "ar"] as const) {
      const brief = renderInspectionBrief(summary, locale);
      for (const token of tokens) {
        expect(brief).not.toContain(token);
      }
      // Reliability bands are printed as words, never as their enum tokens.
      expect(brief).not.toMatch(/\b(?:HIGH|MEDIUM|LOW)\b/u);
      // Provider identity is never shown to the user.
      expect(brief).not.toContain("geometry-brief-provider");
    }
  });
});
