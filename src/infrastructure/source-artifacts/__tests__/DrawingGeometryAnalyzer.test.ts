import { describe, expect, it } from "vitest";
import {
  GEOMETRY_AMBIGUOUS_SHEET,
  GEOMETRY_CONFLICTING_SCALE_SHEET,
  GEOMETRY_CROP_BOX_SHEET,
  GEOMETRY_DRAWING_SHEET,
  GEOMETRY_OVERFLOW_SHEET,
  GEOMETRY_ROTATED_SHEET,
  TEXT_SHEET,
  VECTOR_ONLY_SHEET,
  buildPdf,
  type PageSpec,
} from "./fixtures/pdfFixtures";
import { analyzePdfBytes, type AnalyzedPdfInspection } from "../DocumentInspectionAnalyzer";
import {
  analyzeDrawingGeometry,
  analyzeDrawingImageGeometry,
  toDrawingGeometryProjection,
  type DrawingVisionDraftPage,
} from "../DrawingGeometryAnalyzer";
import { GEOMETRY_BASELINE_LIMITATION, parseDimensionToken } from "@/src/domain/source-artifact";

/**
 * Phase 2A-5 proofs for the bounded drawing geometry analyzer.
 *
 * Each `it` names the behavior it protects. The suite deliberately asserts the
 * boundaries as well as the happy path: that vectors alone never qualify a
 * page, that a printed scale is never applied, that OCR without positions can
 * never associate, that ambiguity is preserved instead of resolved, and that no
 * count, takeoff, or BOM can be derived from the output.
 */

type RunOptions = {
  intent?: "DRAWING_INSPECTION" | "ATTACHMENT";
  mutate?: (analyzed: AnalyzedPdfInspection) => void;
  visionDrafts?: DrawingVisionDraftPage[] | null;
};

function run(specs: PageSpec[], options: RunOptions = {}) {
  const bytes = buildPdf(specs);
  const analyzed = analyzePdfBytes(bytes);
  options.mutate?.(analyzed);
  const result = analyzeDrawingGeometry(analyzed, {
    artifactId: "artifact-1",
    pdfBytes: bytes,
    intent: options.intent ?? "ATTACHMENT",
    visionDrafts: options.visionDrafts ?? null,
  });
  return { bytes, analyzed, result };
}

function firstPage(specs: PageSpec[], options: RunOptions = {}) {
  const { result } = run(specs, options);
  const page = result.pages[0];
  if (!page) throw new Error(`expected one analyzed page, got ${result.pages.length}`);
  return { ...run(specs, options), page };
}

describe("DrawingGeometryAnalyzer — qualification and geometry", () => {
  it("1. a vector drawing page exposes bounded geometry only after the gate qualifies it", () => {
    const { result } = run([GEOMETRY_DRAWING_SHEET]);
    expect(result.attempted).toBe(true);
    expect(result.used).toBe(true);
    expect(result.qualifiedPages).toEqual([1]);
    const page = result.pages[0]!;
    expect(page.geometry).not.toBeNull();
    expect(page.geometry!.source).toBe("PDF_VECTOR");
    expect(page.geometry!.primitives.length).toBeGreaterThan(0);
    expect(page.geometry!.primitives.length).toBeLessThanOrEqual(400);
  });

  it("2. a normal text PDF produces no drawing geometry", () => {
    const { result } = run([TEXT_SHEET]);
    expect(result.attempted).toBe(false);
    expect(result.used).toBe(false);
    expect(result.pages).toHaveLength(0);
    expect(result.limitations.join(" ")).toMatch(/no page passed the drawing gate/i);
  });

  it("3. a vector-heavy page alone never qualifies, even with an explicit drawing intent", () => {
    const plain = run([VECTOR_ONLY_SHEET]);
    expect(plain.analyzed.classification?.pages[0]?.value).not.toBe("DRAWING");
    expect(plain.result.attempted).toBe(false);
    expect(plain.result.pages).toHaveLength(0);

    // The vector content is real, so the only reason nothing was analyzed is
    // the gate: vectors are not evidence that a page is a drawing.
    const explicit = run([VECTOR_ONLY_SHEET], { intent: "DRAWING_INSPECTION" });
    expect(explicit.result.attempted).toBe(false);
    expect(explicit.result.pages).toHaveLength(0);
  });

  it("4. a rectangle operator normalizes into page space with ordered corners", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    const rectangle = page.geometry!.primitives.find((primitive) => primitive.type === "RECTANGLE");
    expect(rectangle).toBeDefined();
    // `100 100 200 200 re` on a 1000 x 800 page.
    expect(rectangle!.boundingBox).toEqual({ x0: 0.1, y0: 0.125, x1: 0.3, y1: 0.375 });
    expect(rectangle!.closed).toBe(true);
    expect(rectangle!.pdfPoints?.length).toBe(4);
  });

  it("5. a stroked line normalizes into page space", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    const line = page.geometry!.primitives.find((primitive) => primitive.type === "LINE_SEGMENT");
    expect(line).toBeDefined();
    // `200 400 m 600 400 l S` on a 1000 x 800 page.
    expect(line!.points[0]).toEqual({ x: 0.2, y: 0.5 });
    expect(line!.points[1]).toEqual({ x: 0.6, y: 0.5 });
  });

  it("6. a rotated page normalizes against the page as displayed", () => {
    const { page } = firstPage([GEOMETRY_ROTATED_SHEET]);
    const frame = page.geometry!.frame!;
    expect(frame.rotation).toBe(90);
    // /Rotate 90 swaps the displayed edges.
    expect(frame.widthPt).toBe(800);
    expect(frame.heightPt).toBe(1000);
    const line = page.geometry!.primitives.find((primitive) => primitive.type === "LINE_SEGMENT")!;
    // The same user-space line, now vertical in displayed page space.
    expect(line.points[0]).toEqual({ x: 0.5, y: 0.8 });
    expect(line.points[1]).toEqual({ x: 0.5, y: 0.4 });
    expect(page.dimensions.lines[0]!.vertical).toBe(true);
    expect(page.dimensions.lines[0]!.horizontal).toBe(false);
  });

  it("7. CropBox is preferred over MediaBox and the choice is disclosed", () => {
    const { page, result } = firstPage([GEOMETRY_CROP_BOX_SHEET]);
    const frame = page.geometry!.frame!;
    expect(frame.boxSource).toBe("CROP_BOX");
    expect(frame.widthPt).toBe(500);
    expect(frame.heightPt).toBe(400);
    // (100,100) inside a [0 0 500 400] crop box; MediaBox would have given 0.1/0.125.
    const line = page.geometry!.primitives.find((primitive) => primitive.type === "LINE_SEGMENT")!;
    expect(line.points[0]).toEqual({ x: 0.2, y: 0.25 });
    expect([...result.limitations, ...page.geometry!.limitations].join(" ")).toMatch(/crop box was used for normalization/i);
  });

  it("8. truncation is disclosed instead of silently dropping content", () => {
    const { page, result } = firstPage([GEOMETRY_OVERFLOW_SHEET]);
    expect(result.truncated).toBe(true);
    expect(page.geometry!.primitives.length).toBeLessThanOrEqual(400);
    expect(page.geometry!.observed.paths).toBeGreaterThan(400);
    const disclosed = [...result.limitations, ...page.geometry!.limitations].join(" ");
    expect(disclosed).toMatch(/retained|safety bound|truncat/i);
  });

  it("9. a proven page keeps its page number on every geometry record", () => {
    const { page, result } = firstPage([GEOMETRY_DRAWING_SHEET]);
    expect(result.qualifiedPages).toEqual([1]);
    expect(page.pageNumber).toBe(1);
    for (const primitive of page.geometry!.primitives) expect(primitive.pageNumber).toBe(1);
    for (const text of page.dimensions.texts) expect(text.pageNumber).toBe(1);
    for (const scale of page.dimensions.scales) expect(scale.pageNumber).toBe(1);
  });

  it("10. unattributed content keeps a null page number everywhere", () => {
    const { page, result } = firstPage([GEOMETRY_DRAWING_SHEET], {
      intent: "DRAWING_INSPECTION",
      mutate: (analyzed) => {
        const target = analyzed.inspection.pages[0]!;
        target.attribution = "UNATTRIBUTED";
        target.pageNumber = null;
      },
    });
    expect(result.qualifiedPages).toEqual([null]);
    expect(page.pageNumber).toBeNull();
    expect(page.attribution).toBe("UNATTRIBUTED");
    for (const primitive of page.geometry!.primitives) expect(primitive.pageNumber).toBeNull();
    for (const text of page.dimensions.texts) expect(text.pageNumber).toBeNull();
  });
});

describe("DrawingGeometryAnalyzer — printed dimensions", () => {
  it("11. a printed dimension stays the literal text printed on the sheet", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    const record = page.dimensions.texts.find((text) => text.raw === "3500")!;
    expect(record).toBeDefined();
    expect(record.raw).toBe("3500");
    expect(record.numericText).toBe("3500");
    expect(record.unit).toBeNull();
    expect(record.kind).toBe("LENGTH");
  });

  it("12. a unit is recorded only when the sheet explicitly printed one", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    const withUnit = page.dimensions.texts.find((text) => text.raw === "1200 mm")!;
    expect(withUnit.unit).toBe("mm");
    expect(withUnit.numericText).toBe("1200");

    const bare = page.dimensions.texts.find((text) => text.raw === "3500")!;
    expect(bare.unit).toBeNull();
    expect(bare.limitations.join(" ")).toMatch(/no unit/i);

    // Other printed forms of the same rule, checked at the parser boundary.
    expect(parseDimensionToken("3.50 m")?.unit).toBe("m");
    expect(parseDimensionToken("3500")?.unit).toBeNull();
    expect(parseDimensionToken("Ø150")?.kind).toBe("DIAMETER");
    expect(parseDimensionToken("R250")?.kind).toBe("RADIUS");
    expect(parseDimensionToken("EL +4.200")?.kind).toBe("LEVEL");
    expect(parseDimensionToken("GRID A")?.kind).toBe("GRID");
    expect(parseDimensionToken("GRID A/3")?.kind).toBe("GRID");
  });

  it("13. positioned text associates conservatively with a nearby dimension line", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    expect(page.dimensions.associations.length).toBeGreaterThan(0);
    const association = page.dimensions.associations[0]!;
    const text = page.dimensions.texts.find((item) => item.id === association.dimensionTextId)!;
    expect(text.raw).toBe("3500");
    expect(page.dimensions.lines.some((line) => line.id === association.dimensionLineCandidateId)).toBe(true);
    expect(association.distance).toBeLessThanOrEqual(0.06);
    expect(association.limitations.join(" ")).toMatch(/proximity candidate only/i);
  });

  it("14. OCR text without word positions is page-level evidence and never associates", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], {
      mutate: (analyzed) => {
        const target = analyzed.inspection.pages[0]!;
        target.ocrText = "3508";
        target.textSource = "NATIVE_AND_OCR";
      },
    });
    const ocr = page.dimensions.texts.find((text) => text.channel === "OCR_TEXT")!;
    expect(ocr).toBeDefined();
    expect(ocr.raw).toBe("3508");
    expect(ocr.position).toBeNull();
    expect(ocr.limitations.join(" ")).toMatch(/no word positions/i);

    // Not one association may point at an OCR reading.
    for (const association of page.dimensions.associations) {
      const source = page.dimensions.texts.find((item) => item.id === association.dimensionTextId)!;
      expect(source.channel).not.toBe("OCR_TEXT");
    }
  });

  it("15. equally plausible associations are all retained instead of a winner being forced", () => {
    const { page } = firstPage([GEOMETRY_AMBIGUOUS_SHEET]);
    expect(page.dimensions.associations.length).toBeGreaterThanOrEqual(2);
    expect(page.dimensions.associations.some((item) => item.limitations.join(" ").includes("comparable distance"))).toBe(true);
    const distances = page.dimensions.associations.map((item) => item.distance);
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThanOrEqual(0.01);
  });
});

describe("DrawingGeometryAnalyzer — printed scale", () => {
  it("16. a printed scale becomes a calibration candidate only, never a dimension", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET]);
    expect(page.dimensions.scales).toHaveLength(1);
    expect(page.dimensions.scales[0]!.printed).toBe("1:100");
    expect(page.dimensions.scales[0]!.ratio).toBe(100);
    expect(page.dimensions.texts.some((text) => text.raw.includes("1:100"))).toBe(false);
  });

  it("17. the printed scale is never applied to any distance", () => {
    const { page, result } = firstPage([GEOMETRY_DRAWING_SHEET]);
    const scale = page.dimensions.scales[0]!;
    expect(scale.limitations.join(" ")).toMatch(/never used to convert/i);

    // Every geometry primitive carries the page-space baseline, so nothing can
    // be read as a real-world measurement.
    for (const primitive of page.geometry!.primitives) {
      expect(primitive.limitations).toContain(GEOMETRY_BASELINE_LIMITATION);
    }
    // No distance, length, or area in the result carries a unit of measure.
    const serialized = JSON.stringify(result);
    for (const forbidden of ["lengthMm", "widthMm", "areaM2", "measuredValue", "convertedValue", "realWorldLength", "scaleApplied"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("18. conflicting printed scales are both retained and surfaced for review", () => {
    const { page, result } = firstPage([GEOMETRY_CONFLICTING_SCALE_SHEET]);
    expect(page.dimensions.scales.map((scale) => scale.printed).sort()).toEqual(["1:100", "1:50"]);
    const conflict = result.conflicts.find((item) => item.kind === "SCALE");
    expect(conflict).toBeDefined();
    expect(conflict!.detail).toContain("1:50");
    expect(conflict!.detail).toContain("1:100");
    expect(conflict!.detail).toMatch(/none was applied/i);
  });
});

describe("DrawingGeometryAnalyzer — symbols and legends", () => {
  const visionDrafts: DrawingVisionDraftPage[] = [
    {
      pageNumber: 1,
      attribution: "PAGE_TREE",
      providerId: "geometry-test-provider",
      drafts: [
        { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.9 },
        { type: "SYMBOL_CANDIDATE", description: "small circular device marked SD", confidence: 0.8, geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 }, legendRef: "SD", similarity: 0.8 },
        { type: "EQUIPMENT_REFERENCE", description: "AHU-01", confidence: 0.7, geometryBox: { x0: 0.41, y0: 0.41, x1: 0.46, y1: 0.46 } },
      ],
    },
  ];

  it("19. a legend entry becomes a bounded legend definition", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], { visionDrafts });
    expect(page.symbols.legends).toHaveLength(1);
    const legend = page.symbols.legends[0]!;
    expect(legend.code).toBe("SD");
    expect(legend.label).toBe("SD — Smoke Detector");
    expect(legend.pageNumber).toBe(1);
    expect(legend.limitations.join(" ")).toMatch(/not an engineering approval/i);
  });

  it("20. a symbol candidate stays an individual bounded observation with a region", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], { visionDrafts });
    expect(page.symbols.symbols).toHaveLength(1);
    const symbol = page.symbols.symbols[0]!;
    expect(symbol.region).toEqual({ x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 });
    expect(symbol.limitations.join(" ")).toMatch(/no symbol was counted/i);
    // The reported region is mirrored as a primitive so it can be drawn, but it
    // is never counted anywhere.
    expect(page.geometry!.primitives.some((primitive) => primitive.type === "SYMBOL_REGION")).toBe(true);
  });

  it("21. a symbol links to a legend entry only on real evidence", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], { visionDrafts });
    expect(page.symbols.legendMatches.length).toBeGreaterThan(0);
    const explicit = page.symbols.legendMatches.find((match) => match.method === "EXPLICIT_LEGEND_LABEL");
    expect(explicit).toBeDefined();
    expect(explicit!.confidence).toBeGreaterThanOrEqual(0.9);
    for (const match of page.symbols.legendMatches) {
      expect(match.limitations.join(" ")).toMatch(/not an identification, not a count/i);
    }
  });

  it("22. ambiguous symbol matches are all retained with no silent winner", () => {
    const ambiguousDrafts: DrawingVisionDraftPage[] = [
      {
        pageNumber: 1,
        attribution: "PAGE_TREE",
        providerId: "geometry-test-provider",
        drafts: [
          { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.9, geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 } },
          { type: "LEGEND_ENTRY", description: "FC — Fire Call Point", confidence: 0.9, geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 } },
          { type: "SYMBOL_CANDIDATE", description: "unlabelled ceiling device", confidence: 0.8, geometryBox: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 } },
        ],
      },
    ];
    const { page, result } = firstPage([GEOMETRY_DRAWING_SHEET], { visionDrafts: ambiguousDrafts });
    // Both legends are equally shape-consistent, so both survive.
    expect(page.symbols.legendMatches.length).toBeGreaterThanOrEqual(2);
    expect(page.symbols.legendMatches.every((match) => match.ambiguous)).toBe(true);
    const conflict = result.conflicts.find((item) => item.kind === "SYMBOL_MATCH");
    expect(conflict).toBeDefined();
    expect(conflict!.detail).toMatch(/none was preferred|more than one legend/i);
  });

  it("23. no aggregate symbol count exists anywhere in the result", () => {
    const { result } = run([GEOMETRY_DRAWING_SHEET], { visionDrafts });
    const projected = toDrawingGeometryProjection(result);
    for (const key of Object.keys(projected)) {
      expect(key).not.toMatch(/count|total|quantity|sum|amount/i);
    }
    expect(JSON.stringify(projected)).not.toMatch(/"(?:symbolCount|legendCount|instanceCount|totalSymbols|quantity)"\s*:/u);
  });
});

describe("DrawingGeometryAnalyzer — provenance and conflicts", () => {
  const visionDrafts: DrawingVisionDraftPage[] = [
    {
      pageNumber: 1,
      attribution: "PAGE_TREE",
      providerId: "geometry-test-provider",
      drafts: [
        { type: "PRINTED_SCALE", description: "1:50", confidence: 0.6 },
        { type: "SYMBOL_CANDIDATE", description: "device", confidence: 0.6, dimensionText: "3500", geometryBox: { x0: 0.3, y0: 0.3, x1: 0.35, y1: 0.35 } },
        { type: "SYMBOL_CANDIDATE", description: "device", confidence: 0.2, dimensionText: "999", geometryBox: { x0: 0.6, y0: 0.6, x1: 0.65, y1: 0.65 } },
      ],
    },
  ];

  it("28. native, OCR, and drawing-vision readings stay distinct channels", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], {
      visionDrafts,
      mutate: (analyzed) => {
        const target = analyzed.inspection.pages[0]!;
        target.ocrText = "3508";
        target.textSource = "NATIVE_AND_OCR";
      },
    });
    const channels = new Set(page.dimensions.texts.map((text) => text.channel));
    expect(channels.has("NATIVE_TEXT")).toBe(true);
    expect(channels.has("OCR_TEXT")).toBe(true);
    expect(channels.has("DRAWING_VISION")).toBe(true);
    // The native and vision readings of "3500" are kept separately, not merged.
    expect(page.dimensions.texts.filter((text) => text.raw === "3500").length).toBeGreaterThanOrEqual(2);
  });

  it("29. conflicting readings are surfaced for review with both values named", () => {
    const { result } = run([GEOMETRY_DRAWING_SHEET], {
      visionDrafts,
      mutate: (analyzed) => {
        const target = analyzed.inspection.pages[0]!;
        target.ocrText = "3508";
        target.textSource = "NATIVE_AND_OCR";
      },
    });
    const dimensionConflict = result.conflicts.find((item) => item.kind === "DIMENSION_TEXT");
    expect(dimensionConflict).toBeDefined();
    expect(dimensionConflict!.detail).toContain("3500");
    expect(dimensionConflict!.detail).toContain("3508");
    expect(dimensionConflict!.detail).toMatch(/neither was converted or preferred/i);

    const scaleConflict = result.conflicts.find((item) => item.kind === "SCALE");
    expect(scaleConflict).toBeDefined();
  });

  it("30. a low-confidence reading carries an explicit limitation", () => {
    const { page } = firstPage([GEOMETRY_DRAWING_SHEET], { visionDrafts });
    const low = page.dimensions.texts.find((text) => text.raw === "999");
    expect(low).toBeDefined();
    expect(low!.reliability).toBe("LOW");
    expect(low!.limitations.join(" ")).toMatch(/low confidence/i);
  });
});

describe("DrawingGeometryAnalyzer — standalone drawing image", () => {
  it("produces vision-only evidence and never fabricates PDF vector geometry", () => {
    const result = analyzeDrawingImageGeometry({
      visionDrafts: [
        {
          pageNumber: null,
          attribution: "UNATTRIBUTED",
          providerId: "geometry-test-provider",
          drafts: [
            { type: "LEGEND_ENTRY", description: "SD — Smoke Detector", confidence: 0.8 },
            { type: "SYMBOL_CANDIDATE", description: "round ceiling device", confidence: 0.8, geometryBox: { x0: 0.2, y0: 0.2, x1: 0.25, y1: 0.25 } },
          ],
        },
      ],
    });
    expect(result.used).toBe(true);
    const page = result.pages[0]!;
    expect(page.pageNumber).toBeNull();
    expect(page.geometry).toBeNull();
    // No primitive of any kind, so certainly no PDF_VECTOR geometry.
    expect(result.pages.flatMap((entry) => entry.geometry?.primitives ?? [])).toHaveLength(0);
    expect(result.limitations.join(" ")).toMatch(/no PDF vector geometry/i);
    expect(page.symbols.symbols).toHaveLength(1);
    expect(page.symbols.legends).toHaveLength(1);
  });

  it("produces nothing when the provider reported nothing", () => {
    const result = analyzeDrawingImageGeometry({ visionDrafts: [] });
    expect(result.used).toBe(false);
    expect(result.pages).toHaveLength(0);
  });
});
