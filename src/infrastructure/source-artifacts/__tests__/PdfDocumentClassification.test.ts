import { describe, expect, it } from "vitest";
import { classifyPdfInspection, type ClassificationEvidence } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "../PdfTextExtractor";
import { AMBIGUOUS_SHEET, BOQ_SHEET, DRAWING_SHEET, EMPTY_SHEET, OCR_LAYER_SHEET, SCANNED_SHEET, TEXT_SHEET, VECTOR_ONLY_SHEET, buildPdf } from "./fixtures/pdfFixtures";

function classify(pages: Parameters<typeof buildPdf>[0], options: Parameters<typeof buildPdf>[1] = {}) {
  const inspection = inspectPdfBytes(buildPdf(pages, options));
  return { inspection, classification: classifyPdfInspection(inspection) };
}

const details = (evidence: ClassificationEvidence[]) => evidence.map((item) => item.detail).join(" | ");

describe("conservative PDF classification (2A-1B)", () => {
  it("classifies an explicit BOQ page as BOQ_OR_SCHEDULE with named evidence", () => {
    const { classification } = classify([BOQ_SHEET]);
    expect(classification.value).toBe("BOQ_OR_SCHEDULE");
    expect(classification.reliability).toBe("HIGH");
    expect(classification.confidence).toBeGreaterThan(0);
    const kinds = classification.pages[0]!.evidence.map((item) => item.kind);
    expect(kinds).toContain("TEXT_MARKER");
    expect(kinds).toContain("COLUMN_STRUCTURE");
    expect(kinds).toContain("ROW_STRUCTURE");
    expect(details(classification.pages[0]!.evidence)).toContain("BILL OF QUANTITIES");
  });

  it("classifies a drawing sheet as DRAWING only from explicit textual identifiers", () => {
    const { inspection, classification } = classify([DRAWING_SHEET], { creator: "Autodesk AutoCAD 2024" });
    expect(classification.value).toBe("DRAWING");
    expect(classification.reliability).toBe("HIGH");
    const page = classification.pages[0]!;
    const evidenceText = details(page.evidence);
    // Explicit textual identifiers only:
    expect(evidenceText).toContain("drawing number label");
    expect(evidenceText).toContain("scale marker");
    expect(evidenceText).toContain("sheet x of y marker");
    // No geometry claim: the vector count is measured by the parser but is never evidence.
    expect(inspection.pages[0]!.metrics?.vectorPathSegments).toBeGreaterThan(0);
    expect(page.evidence.every((item) => item.kind !== "PAGE_METRIC")).toBe(true);
    expect(details(page.evidence)).not.toMatch(/vector|path|geometry|dimension/iu);
    expect(page.limitations.join(" ")).toContain("drawing classification comes from explicit textual identifiers only");
  });

  it("never calls a vector-heavy page with no textual drawing evidence a drawing", () => {
    const { inspection, classification } = classify([VECTOR_ONLY_SHEET]);
    expect(inspection.pages[0]!.metrics?.vectorPathSegments).toBeGreaterThan(0);
    expect(classification.value).not.toBe("DRAWING");
    expect(classification.value).toBe("UNKNOWN");
    expect(classification.pages[0]!.limitations.join(" ")).toContain("insufficient visible text and no schedule or drawing marker");
    expect(details(classification.pages[0]!.evidence)).not.toMatch(/vector|path|geometry/iu);
  });

  it("degrades conflicting evidence on one page to UNKNOWN instead of picking a favourite", () => {
    const { classification } = classify([AMBIGUOUS_SHEET]);
    expect(["UNKNOWN", "MIXED"]).toContain(classification.value);
    expect(classification.pages[0]!.value).toBe("UNKNOWN");
    expect(classification.pages[0]!.limitations.join(" ")).toContain("conflicting evidence");
    // Both sides of the conflict stay visible for review.
    expect(details(classification.pages[0]!.evidence)).toContain("BILL OF QUANTITIES");
    expect(details(classification.pages[0]!.evidence)).toContain("drawing number label");
  });

  it("treats an image-only page as SCANNED_OR_IMAGE_ONLY and never as DRAWING", () => {
    const { classification } = classify([SCANNED_SHEET]);
    expect(classification.value).toBe("SCANNED_OR_IMAGE_ONLY");
    expect(classification.value).not.toBe("DRAWING");
    expect(classification.limitations.join(" ")).toContain("page content is image-only");
    expect(classification.pages[0]!.evidence.map((item) => item.kind)).toContain("PAGE_METRIC");
  });

  it("keeps an invisible OCR layer out of the classification evidence", () => {
    const { classification } = classify([OCR_LAYER_SHEET]);
    expect(["SCANNED_OR_IMAGE_ONLY", "UNKNOWN"]).toContain(classification.value);
    const text = classification.limitations.join(" ");
    expect(text).toContain("invisible text layer");
    expect(text).toContain("OCR");
    expect(details(classification.pages[0]!.evidence)).not.toContain("A-201");
  });

  it("returns UNKNOWN with a limitation when a page has neither text nor image evidence", () => {
    const { classification } = classify([EMPTY_SHEET]);
    expect(classification.value).toBe("UNKNOWN");
    expect(classification.confidence).toBe(0);
    expect(classification.limitations.join(" ")).toContain("no machine-readable text and no image evidence");
  });

  it("aggregates a multi-class document as MIXED and keeps per-page classes", () => {
    const { classification } = classify([DRAWING_SHEET, BOQ_SHEET, TEXT_SHEET]);
    expect(classification.value).toBe("MIXED");
    expect(classification.pages.map((page) => page.value)).toEqual(["DRAWING", "BOQ_OR_SCHEDULE", "TEXT_DOCUMENT"]);
    expect(classification.limitations.join(" ")).toContain("more than one kind of page");
    expect(details(classification.evidence)).toContain("DRAWING");
    expect(details(classification.evidence)).toContain("BOQ_OR_SCHEDULE");
  });

  it("does not assert a uniform class when one real class is mixed with unclassifiable pages", () => {
    const { classification } = classify([DRAWING_SHEET, EMPTY_SHEET]);
    expect(classification.value).toBe("UNKNOWN");
    expect(classification.confidence).toBe(0);
    expect(classification.pages.map((page) => page.value)).toEqual(["DRAWING", "UNKNOWN"]);
    expect(classification.limitations.join(" ")).toContain("no uniform document class was asserted");
  });

  it("does not classify an encrypted PDF", () => {
    const { classification } = classify([BOQ_SHEET], { encrypt: true });
    expect(classification.value).toBe("UNKNOWN");
    expect(classification.pages).toEqual([]);
    expect(classification.limitations.join(" ")).toContain("encrypted");
  });

  it("reports confidence as bounded evidence strength, never a probability claim", () => {
    const { classification } = classify([BOQ_SHEET]);
    for (const page of [classification, ...classification.pages]) {
      expect(page.confidence).toBeGreaterThanOrEqual(0);
      expect(page.confidence).toBeLessThanOrEqual(0.95);
      expect(Number.isFinite(page.confidence)).toBe(true);
    }
    expect(classification.limitations.join(" ")).toContain("not engineering understanding");
    expect(classification.limitations.join(" ")).toContain("vector, path, and image counts are never treated as drawing evidence");
  });

  it("preserves unproven page attribution through classification", () => {
    const { classification } = classify([TEXT_SHEET]);
    expect(classification.pages[0]).toMatchObject({ pageNumber: 1, attribution: "PAGE_TREE" });
  });
});
