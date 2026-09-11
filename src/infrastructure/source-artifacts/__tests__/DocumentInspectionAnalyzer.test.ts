import { describe, expect, it } from "vitest";
import { analyzePdfBytes, analyzePdfInspection } from "../DocumentInspectionAnalyzer";
import { inspectPdfBytes } from "../PdfTextExtractor";
import { BOQ_SHEET, DRAWING_SHEET, OCR_LAYER_SHEET, buildPdf } from "./fixtures/pdfFixtures";

describe("PDF inspection analyzer composition (2A-1B)", () => {
  it("composes real inspection -> classification -> observations without mutating the inspection", () => {
    const bytes = buildPdf([DRAWING_SHEET, BOQ_SHEET]);
    const analyzed = analyzePdfBytes(bytes);
    const inspection = inspectPdfBytes(bytes);
    expect(analyzed.format).toBe("PDF");
    expect(analyzed.inspection).toEqual(inspection);
    expect(analyzed.classification.value).toBe("MIXED");
    expect(analyzed.classification.pages.map((page) => page.value)).toEqual(["DRAWING", "BOQ_OR_SCHEDULE"]);
    expect(analyzed.observations.length).toBeGreaterThan(0);
    expect(analyzed.observations.every((item) => item.status === "OBSERVED_NOT_APPROVED")).toBe(true);
  });

  it("carries inspection, classification, and observation limitations into one list", () => {
    const analyzed = analyzePdfInspection(inspectPdfBytes(buildPdf([OCR_LAYER_SHEET])));
    const text = analyzed.limitations.join(" ");
    expect(text).toContain("pdf inspection:");
    expect(text).toContain("invisible text layer");
    expect(text).toContain("not engineering understanding");
    expect(analyzed.classification.value).not.toBe("DRAWING");
    expect(analyzed.observations).toEqual([]);
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => analyzePdfBytes(Buffer.from("not a pdf"))).toThrow("PDF_CONTENT_INVALID");
  });
});
