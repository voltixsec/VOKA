import { describe, expect, it } from "vitest";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import {
  MAX_OBSERVATIONS,
  OCR_MIN_TRUSTWORTHY_NATIVE_CHARS,
  shouldRequestOcr,
  type ArtifactPage,
  type OcrPageRequest,
  type PdfInspection,
} from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "../PdfTextExtractor";
import { deterministicOcrEngine } from "../ocr/DeterministicOcrEngine";
import { unavailableOcrEngine } from "../ocr/UnavailableOcrEngine";
import { analyzePdfBytesWithOcr, analyzePdfInspectionWithOcr } from "../ocr/OcrDocumentAnalyzer";
import {
  BOQ_SHEET,
  DRAWING_SHEET,
  EMPTY_SHEET,
  OCR_LAYER_SHEET,
  SCANNED_SHEET,
  TEXT_SHEET,
  VECTOR_ONLY_SHEET,
  buildPdf,
} from "./fixtures/pdfFixtures";

const BOQ_SCAN_LINES = [
  "BILL OF QUANTITIES",
  "ITEM DESCRIPTION QTY UNIT",
  "1.1 Supply and install fire pump set 2 nos",
  "1.2 Fire hose reel FHR-01 8 nos",
  "MODEL NO: FP-200",
];

const DRAWING_SCAN_LINES = [
  "PROJECT: SEAFRONT TOWER",
  "DRAWING NO: ME-101 REV: B",
  "SCALE 1:100 SHEET 3 OF 12",
];

/** Wraps an engine to record every recognition request. */
function counting(engine: OcrPort): { calls: OcrPageRequest[]; port: OcrPort } {
  const calls: OcrPageRequest[] = [];
  return {
    calls,
    port: {
      engineId: engine.engineId,
      recognize: async (request) => {
        calls.push(request);
        return engine.recognize(request);
      },
    },
  };
}



describe("OCR request gate (2A-2)", () => {
  it("never requests OCR for trustworthy native text", () => {
    expect(OCR_MIN_TRUSTWORTHY_NATIVE_CHARS).toBe(80);
    const inspection = inspectPdfBytes(buildPdf([TEXT_SHEET, BOQ_SHEET, DRAWING_SHEET]));
    for (const page of inspection.pages) {
      expect(shouldRequestOcr(page).requested).toBe(false);
      expect(shouldRequestOcr(page).reason).toContain("trustworthy");
    }
  });

  it("never requests OCR without image evidence, even for sparse or empty text", () => {
    const inspection = inspectPdfBytes(buildPdf([VECTOR_ONLY_SHEET, EMPTY_SHEET]));
    for (const page of inspection.pages) {
      const gate = shouldRequestOcr(page);
      expect(gate.requested).toBe(false);
      expect(gate.reason).toContain("no image evidence");
    }
  });

  it("requests OCR for image-only pages and for sparse native text with image content", () => {
    const scanned = inspectPdfBytes(buildPdf([SCANNED_SHEET, OCR_LAYER_SHEET]));
    expect(shouldRequestOcr(scanned.pages[0]!).requested).toBe(true);
    expect(shouldRequestOcr(scanned.pages[0]!).reason).toContain("no usable native text");
    expect(shouldRequestOcr(scanned.pages[1]!).requested).toBe(true);
    const sparse = inspectPdfBytes(buildPdf([{ width: 595, height: 842, image: true, lines: ["QTY: 5 nos"] }]));
    const gate = shouldRequestOcr(sparse.pages[0]!);
    expect(gate.requested).toBe(true);
    expect(gate.reason).toContain("sparse native text");
  });
});

describe("OCR invocation and page attribution (2A-2)", () => {
  it("does NOT invoke OCR for a native-text PDF", async () => {
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n") }));
    const bytes = buildPdf([TEXT_SHEET, BOQ_SHEET, DRAWING_SHEET]);
    const analyzed = await analyzePdfBytesWithOcr(bytes, port, { artifactId: "artifact-1" });
    expect(calls).toEqual([]);
    expect(analyzed.ocr).toMatchObject({ attempted: false, requestedPages: [], usedPages: [] });
    for (const page of analyzed.inspection.pages) {
      expect(page.ocr).toBeUndefined();
      expect(page.textSource).toBe("NATIVE");
      expect(page.extractionMethods).not.toContain("OCR_TEXT");
    }
    // The native analysis is untouched by the OCR pass.
    expect(analyzed.classification.value).toBe("MIXED");
    expect(analyzed.classification.pages.map((page) => page.value)).toEqual(["TEXT_DOCUMENT", "BOQ_OR_SCHEDULE", "DRAWING"]);
    expect(analyzed.limitations.join(" ")).toContain("no OCR, image interpretation, or geometry interpretation was performed");
  });

  it("invokes OCR for a scanned page and keeps the proven page attribution", async () => {
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n") }));
    const analyzed = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), port, { artifactId: "artifact-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ artifactId: "artifact-1", pageNumber: 1, pageIndex: 0 });
    expect(calls[0]!.reason).toContain("OCR requested");
    expect(analyzed.ocr).toMatchObject({ attempted: true, requestedPages: [1], usedPages: [1], engines: ["deterministic-test-double"] });
    const page = analyzed.inspection.pages[0]!;
    expect(page).toMatchObject({ pageNumber: 1, attribution: "PAGE_TREE", textSource: "OCR" });
    expect(page.extractionMethods).toContain("OCR_TEXT");
    expect(page.ocrText).toBe(BOQ_SCAN_LINES.join("\n"));
    expect(page.ocr).toMatchObject({ requested: true, status: "COMPLETED", engineId: "deterministic-test-double" });
  });

  it("attributes each scanned page to its own OCR result across pages", async () => {
    const { calls, port } = counting(
      deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n"), "page:2": DRAWING_SCAN_LINES.join("\n") }),
    );
    const analyzed = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET, SCANNED_SHEET]), port, { artifactId: "a" });
    expect(calls.map((call) => call.pageNumber)).toEqual([1, 2]);
    expect(analyzed.ocr.usedPages).toEqual([1, 2]);
    const page1 = analyzed.inspection.pages[0]!;
    const page2 = analyzed.inspection.pages[1]!;
    expect(page1.ocrText).toContain("BILL OF QUANTITIES");
    expect(page1.ocrText).not.toContain("ME-101");
    expect(page2.ocrText).toContain("ME-101");
    expect(page2.ocrText).not.toContain("BILL OF QUANTITIES");
    const boq = analyzed.observations.filter((item) => item.value === "ME-101");
    expect(boq).toHaveLength(1);
    expect(boq[0]).toMatchObject({ pageNumber: 2, attribution: "PAGE_TREE" });
    expect(boq[0]!.evidence.locator).toBe("page 2, OCR line 2");
    expect(analyzed.observations.filter((item) => item.pageNumber === 1).length).toBeGreaterThan(0);
    // Both readings are concrete but different, so the document degrades to MIXED, never a favourite.
    expect(analyzed.classification.value).toBe("MIXED");
  });

  it("never invents page 1 for unattributed scanned content", async () => {
    const unattributed: ArtifactPage = {
      pageNumber: null,
      attribution: "UNATTRIBUTED",
      text: "",
      characterCount: 0,
      extractionMethods: ["NONE"],
      metrics: {
        visibleTextCharacters: 0, invisibleTextCharacters: 0, annotationCharacters: 0, textLines: 0,
        vectorPathSegments: 0, imageCount: 1, imageCoverage: 1, formXObjectCount: 0, fontCount: 0, undecodableGlyphs: 0,
      },
      limitations: [],
    };
    const inspection: PdfInspection = {
      format: "PDF",
      text: "",
      pages: [unattributed],
      document: { pageCount: 1, pageAttributionReliable: false, encrypted: false, producer: null, creator: null, title: null, limitations: [] },
    };
    const { calls, port } = counting(deterministicOcrEngine({ "index:0": "BILL OF QUANTITIES\nITEM DESCRIPTION QTY UNIT\n1.1 Pump set 2 nos" }));
    const analyzed = await analyzePdfInspectionWithOcr(inspection, port, { artifactId: "a", pdfBytes: new Uint8Array() });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.pageNumber).toBeNull();
    const page = analyzed.inspection.pages[0]!;
    expect(page.pageNumber).toBeNull();
    expect(page.textSource).toBe("OCR");
    expect(analyzed.observations.length).toBeGreaterThan(0);
    for (const item of analyzed.observations) {
      expect(item.pageNumber).toBeNull();
      expect(item.attribution).toBe("UNATTRIBUTED");
      expect(item.evidence.locator.startsWith("unattributed page, OCR line ")).toBe(true);
      expect(item.limitations.join(" ")).toContain("page attribution is unproven");
    }
  });
});

describe("OCR-derived analysis through the accepted path (2A-2)", () => {
  it("marks OCR-derived text as OCR-derived everywhere", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n") }),
      { artifactId: "a" },
    );
    const page = analyzed.inspection.pages[0]!;
    expect(page.textSource).toBe("OCR");
    expect(page.extractionMethods).toContain("OCR_TEXT");
    expect(page.limitations?.join(" ")).toContain("marked as OCR-derived");
    expect(analyzed.observations.length).toBeGreaterThan(0);
    for (const item of analyzed.observations) {
      expect(item.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
      expect(item.evidence.locator).toContain("OCR line");
      expect(item.limitations.join(" ")).toContain("recovered by OCR from a scanned page");
    }
    expect(analyzed.limitations.join(" ")).toContain("OCR text recovery was performed on 1 page(s) (page 1)");
    expect(analyzed.limitations.join(" ")).not.toContain("no OCR, image interpretation, or geometry interpretation was performed");
    expect(analyzed.classification.limitations.join(" ")).not.toContain("no OCR, image interpretation, or geometry interpretation was performed");
  });

  it("reuses the same classifier with an explicit reliability downgrade, not a second classifier", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n") }),
      { artifactId: "a" },
    );
    expect(analyzed.classification.value).toBe("BOQ_OR_SCHEDULE");
    // Same detectors (heading, columns, rows), but OCR caps reliability below HIGH.
    const kinds = analyzed.classification.pages[0]!.evidence.map((item) => item.kind);
    expect(kinds).toContain("TEXT_MARKER");
    expect(kinds).toContain("COLUMN_STRUCTURE");
    expect(kinds).toContain("ROW_STRUCTURE");
    expect(analyzed.classification.pages[0]!.evidence.map((item) => item.detail).join(" | ")).toContain("BILL OF QUANTITIES");
    expect(analyzed.classification.reliability).toBe("MEDIUM");
    expect(analyzed.classification.pages[0]!.reliability).toBe("MEDIUM");
    expect(analyzed.classification.pages[0]!.limitations.join(" ")).toContain("recovered by OCR");
  });

  it("keeps every OCR-derived observation non-approved with verbatim evidence", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": BOQ_SCAN_LINES.join("\n") }),
      { artifactId: "a" },
    );
    expect(analyzed.observations.length).toBeGreaterThan(0);
    for (const item of analyzed.observations) {
      expect(item.status).toBe("OBSERVED_NOT_APPROVED");
    }
    const quantity = analyzed.observations.find((item) => item.type === "QUANTITY" && item.value === "2")!;
    expect(quantity).toMatchObject({ pageNumber: 1, attribution: "PAGE_TREE", reliability: "MEDIUM" });
    expect(quantity.evidence).toMatchObject({ snippet: "1.1 Supply and install fire pump set 2 nos", locator: "page 1, OCR line 3", lineNumber: 3 });
    expect(quantity.limitations.join(" ")).toMatch(/not calculated, verified, or approved/u);
    const model = analyzed.observations.find((item) => item.type === "MODEL_OR_REFERENCE")!;
    expect(model.value).toBe("FP-200");
    expect(model.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
    expect(analyzed.observations.length).toBeLessThanOrEqual(MAX_OBSERVATIONS);
  });

  it("propagates low-confidence OCR as low reliability with review limitations", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": { text: BOQ_SCAN_LINES.join("\n"), status: "LOW_CONFIDENCE", confidence: 0.3 } }),
      { artifactId: "a" },
    );
    expect(analyzed.ocr.usedPages).toEqual([1]);
    expect(analyzed.inspection.pages[0]!.ocr).toMatchObject({ status: "LOW_CONFIDENCE", reliability: "LOW", confidence: 0.3 });
    expect(analyzed.classification.reliability).toBe("LOW");
    expect(analyzed.classification.pages[0]!.limitations.join(" ")).toContain("low confidence");
    for (const item of analyzed.observations) {
      expect(item.reliability).toBe("LOW");
      expect(item.limitations.join(" ")).toContain("low confidence");
    }
    expect(analyzed.observations[0]!.limitations.join(" ")).toContain("OCR engine-reported confidence 0.30");
  });

  it("still never turns hidden/invisible text into a confirmed observation", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([OCR_LAYER_SHEET]),
      deterministicOcrEngine({ "page:1": "PROJECT: RECOVERED TOWER\nNOTE: VERIFY ON SITE" }),
      { artifactId: "a" },
    );
    // The invisible layer stays excluded; only the new OCR reading is observed.
    expect(analyzed.inspection.pages[0]!.hiddenText).toContain("DRAWING NO: A-201");
    expect(analyzed.observations.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(analyzed.observations);
    expect(serialized).not.toContain("A-201");
    expect(serialized).not.toContain("SCANNED OCR LAYER");
    expect(serialized).toContain("RECOVERED TOWER");
    expect(analyzed.limitations.join(" ")).toContain("invisible text layer");
  });

  it("keeps a native/OCR conflict reviewable without overwriting the native text", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([{ width: 595, height: 842, image: true, lines: ["QTY: 5 nos"] }]),
      deterministicOcrEngine({ "page:1": "QTY: 8 nos" }),
      { artifactId: "a" },
    );
    const page = analyzed.inspection.pages[0]!;
    expect(page.textSource).toBe("NATIVE_AND_OCR");
    // Native text is preserved as primary; the OCR reading lives alongside it.
    expect(page.text).toContain("QTY: 5 nos");
    expect(page.text).not.toContain("QTY: 8 nos");
    expect(page.ocrText).toBe("QTY: 8 nos");
    const quantities = analyzed.observations.filter((item) => item.type === "QUANTITY");
    const native = quantities.find((item) => item.value === "5")!;
    const ocr = quantities.find((item) => item.value === "8")!;
    expect(native.origin).toBeUndefined();
    expect(native.reliability).toBe("HIGH");
    expect(ocr.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
    expect(ocr.evidence.locator).toBe("page 1, OCR line 1");
    // Both values retained, with a reviewable conflict note and no silent merge.
    expect(analyzed.limitations.join(" ")).toContain('the native text and the OCR text disagree and both values were kept for review (native "5" vs OCR "8")');
    // The exact-duplicate unit keeps the native observation once.
    const units = analyzed.observations.filter((item) => item.type === "UNIT");
    expect(units).toHaveLength(1);
    expect(units[0]!.origin).toBeUndefined();
    expect(analyzed.limitations.join(" ")).toContain("matched the native text exactly and were kept once as native observations");
    // Classification stays native-primary: sparse native text is not silently promoted by OCR.
    expect(analyzed.classification.value).toBe("UNKNOWN");
  });
});

describe("OCR failure and unavailability honesty (2A-2)", () => {
  it("reports an unavailable engine without fabricating text or changing the native analysis", async () => {
    const { calls, port } = counting(unavailableOcrEngine());
    const analyzed = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), port, { artifactId: "a" });
    expect(calls).toHaveLength(1);
    expect(analyzed.ocr).toMatchObject({ attempted: true, requestedPages: [1], usedPages: [], engines: ["ocr-unavailable"] });
    const page = analyzed.inspection.pages[0]!;
    expect(page.ocr).toMatchObject({ requested: true, status: "UNAVAILABLE" });
    expect(page.ocrText).toBeUndefined();
    expect(page.text).toBe("");
    expect(page.textSource).toBe("NONE");
    expect(analyzed.classification.value).toBe("SCANNED_OR_IMAGE_ONLY");
    expect(analyzed.observations).toEqual([]);
    expect(analyzed.limitations.join(" ")).toContain("no OCR engine is available in this runtime, so scanned content was not read");
  });

  it("reports NO_TEXT_FOUND honestly when nothing was recovered", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({}),
      { artifactId: "a" },
    );
    expect(analyzed.ocr).toMatchObject({ attempted: true, usedPages: [] });
    expect(analyzed.inspection.pages[0]!.ocr).toMatchObject({ status: "NO_TEXT_FOUND" });
    expect(analyzed.classification.value).toBe("SCANNED_OR_IMAGE_ONLY");
    expect(analyzed.observations).toEqual([]);
    expect(analyzed.limitations.join(" ")).toContain("OCR was attempted on 1 page(s) but recovered no usable text");
  });

  it("reports engine failure while keeping native text primary", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([{ width: 595, height: 842, image: true, lines: ["QTY: 5 nos"] }]),
      deterministicOcrEngine({ "page:1": { status: "FAILED", error: "rasterizer timed out" } }),
      { artifactId: "a" },
    );
    const page = analyzed.inspection.pages[0]!;
    expect(page.ocr).toMatchObject({ status: "FAILED", error: "rasterizer timed out" });
    expect(page.text).toContain("QTY: 5 nos");
    expect(page.textSource).toBe("NATIVE");
    expect(page.limitations?.join(" ")).toContain("OCR was attempted but failed: rasterizer timed out");
    expect(analyzed.observations.map((item) => item.value)).toContain("5");
    expect(analyzed.observations.every((item) => item.origin === undefined)).toBe(true);
  });

  it("marks partial OCR output as partial and still reviewable", async () => {
    const analyzed = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": { text: "BILL OF QUANTITIES", status: "PARTIAL", confidence: 0.7 } }),
      { artifactId: "a" },
    );
    expect(analyzed.ocr.usedPages).toEqual([1]);
    expect(analyzed.inspection.pages[0]!.limitations?.join(" ")).toContain("OCR recovered only part of the page");
    expect(analyzed.classification.value).toBe("BOQ_OR_SCHEDULE");
    expect(analyzed.classification.reliability).toBe("MEDIUM");
  });
});

describe("deterministic test-double honesty", () => {
  it("echoes the request page number and identifies itself as a fixture, never real OCR", async () => {
    const engine = deterministicOcrEngine({ "page:2": "hello" });
    expect(engine.engineId).toBe("deterministic-test-double");
    const hit = await engine.recognize({ artifactId: "a", pageNumber: 2, pageIndex: 1, pdfBytes: new Uint8Array(), reason: "test" });
    expect(hit).toMatchObject({ pageNumber: 2, text: "hello", status: "COMPLETED" });
    expect(hit.limitations.join(" ")).toContain("not produced by a real OCR engine");
    const miss = await engine.recognize({ artifactId: "a", pageNumber: null, pageIndex: 4, pdfBytes: new Uint8Array(), reason: "test" });
    expect(miss).toMatchObject({ pageNumber: null, text: "", status: "NO_TEXT_FOUND" });
  });
});
