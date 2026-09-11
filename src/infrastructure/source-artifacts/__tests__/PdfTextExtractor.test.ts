import { describe, expect, it } from "vitest";
import { extractPdfText, inspectPdfBytes } from "../PdfTextExtractor";
import { BOQ_SHEET, DRAWING_SHEET, OCR_LAYER_SHEET, SCANNED_SHEET, TEXT_SHEET, buildCidFontPdf, buildObjectStreamPdf, buildPdf } from "./fixtures/pdfFixtures";

function textPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()]/gu, "")}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
}

describe("bounded PDF source inspection (legacy contract)", () => {
  it("extracts machine-readable text without fabricating page attribution when no page tree exists", () => {
    const result = extractPdfText(textPdf("BOQ 1 Vehicle elevator each"));
    expect(result.text).toContain("BOQ 1 Vehicle elevator each");
    expect(result.pages[0]).toMatchObject({ pageNumber: null, attribution: "UNATTRIBUTED" });
    expect(result.pages[0].text).toContain("Vehicle elevator");
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => extractPdfText(Buffer.from("not a pdf"))).toThrow("PDF_CONTENT_INVALID");
  });
});

describe("page-aware PDF inspection", () => {
  it("attributes text to proven pages with dimensions, paper size, and extraction method", () => {
    const inspection = inspectPdfBytes(buildPdf([DRAWING_SHEET, BOQ_SHEET, TEXT_SHEET], { producer: "Test Producer", creator: "Autodesk AutoCAD 2024", compress: true }));
    expect(inspection.document).toMatchObject({ pageCount: 3, pageAttributionReliable: true, encrypted: false, producer: "Test Producer", creator: "Autodesk AutoCAD 2024" });
    expect(inspection.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(inspection.pages[0]).toMatchObject({ attribution: "PAGE_TREE", widthPt: 2384, heightPt: 1684, paperSize: "A1 landscape", extractionMethods: ["CONTENT_STREAM_TEXT"] });
    expect(inspection.pages[0].text).toContain("DRAWING NO: ME-101 REV: B");
    expect(inspection.pages[0].text).not.toContain("BILL OF QUANTITIES");
    expect(inspection.pages[1].text).toContain("1.2 Fire hose reel cabinet FHR-01 8 nos");
    expect(inspection.pages[1]).toMatchObject({ paperSize: "A4 portrait" });
    expect(inspection.pages[0].metrics?.vectorPathSegments).toBe(80 * 4);
    expect(inspection.pages[2].metrics?.visibleTextCharacters).toBeGreaterThan(150);
  });

  it("keeps image-only pages honest and separates an invisible OCR layer from visible text", () => {
    const inspection = inspectPdfBytes(buildPdf([SCANNED_SHEET, OCR_LAYER_SHEET]));
    const [scanned, ocr] = inspection.pages;
    expect(scanned.text).toBe("");
    expect(scanned.metrics).toMatchObject({ imageCount: 1, imageCoverage: 1, visibleTextCharacters: 0 });
    expect(scanned.limitations).toContain("page content is image-only; OCR is not available");
    expect(ocr.text).toBe("");
    expect(ocr.hiddenText).toContain("DRAWING NO: A-201");
    expect(ocr.metrics?.invisibleTextCharacters).toBeGreaterThan(0);
    expect(ocr.limitations?.some((item) => /invisible text layer/u.test(item))).toBe(true);
    expect(inspection.text).toBe("");
    expect(inspection.document.limitations).toContain("only an invisible text layer was found; it is probably OCR output and is not verified against the page images");
  });

  it("maps Identity-H CID fonts through the ToUnicode CMap, including Arabic", () => {
    const inspection = inspectPdfBytes(buildCidFontPdf("Pump P-01 مصعد"));
    expect(inspection.pages[0].text).toContain("Pump P-01");
    expect(inspection.pages[0].text).toContain("مصعد");
    expect(inspection.pages[0].metrics?.undecodableGlyphs).toBe(0);
  });

  it("reads PDF 1.5 object streams and cross-reference streams", () => {
    const inspection = inspectPdfBytes(buildObjectStreamPdf(["EQUIPMENT SCHEDULE", "AHU-01 supply air handling unit"]));
    expect(inspection.document).toMatchObject({ pageCount: 1, pageAttributionReliable: true });
    expect(inspection.pages[0]).toMatchObject({ pageNumber: 1, widthPt: 595, heightPt: 842 });
    expect(inspection.pages[0].text).toContain("AHU-01 supply air handling unit");
  });

  it("recovers from a corrupt cross-reference offset by scanning objects and records the limitation", () => {
    const inspection = inspectPdfBytes(buildPdf([BOQ_SHEET], { corruptXref: true }));
    expect(inspection.document.limitations).toContain("cross-reference table unreadable; objects were located by scanning");
    expect(inspection.pages[0].text).toContain("BILL OF QUANTITIES");
    expect(inspection.pages[0].pageNumber).toBe(1);
  });

  it("does not claim content for encrypted PDFs", () => {
    const inspection = inspectPdfBytes(buildPdf([BOQ_SHEET], { encrypt: true }));
    expect(inspection.document.encrypted).toBe(true);
    expect(inspection.pages).toEqual([]);
    expect(inspection.text).toBe("");
    expect(inspection.document.pageAttributionReliable).toBe(false);
  });

  it("reports drawing-like sheets as text plus measured facts only; it makes no drawing-understanding or classification claim", () => {
    const inspection = inspectPdfBytes(buildPdf([DRAWING_SHEET], { creator: "Autodesk AutoCAD 2024" }));
    const page = inspection.pages[0];
    // What is proven: page identity, geometry counts as raw metrics, and the title-block words as plain text.
    expect(page).toMatchObject({ pageNumber: 1, attribution: "PAGE_TREE", paperSize: "A1 landscape" });
    expect(page.metrics?.vectorPathSegments).toBeGreaterThan(0);
    expect(page.text).toContain("DRAWING NO: ME-101 REV: B");
    // What is NOT claimed: no class, observation, drawing number, equipment, or quantity fields exist on the result.
    const serialized = JSON.stringify(inspection);
    for (const forbidden of ["classification", "\"class\"", "observations", "drawingNumber", "equipmentTags", "quantities", "DRAWING\"", "BOQ"]) expect(serialized).not.toContain(forbidden);
    expect(Object.keys(page).sort()).toEqual(["attribution", "characterCount", "extractionMethods", "heightPt", "limitations", "metrics", "pageNumber", "paperSize", "rotation", "text", "widthPt"]);
  });

  it("includes annotation text as a separate extraction method and honors page rotation for dimensions", () => {
    const inspection = inspectPdfBytes(buildPdf([{ width: 842, height: 595, rotate: 90, lines: ["ROTATED SHEET"], annotations: ["Comment: verify pump head"] }]));
    const page = inspection.pages[0];
    expect(page.extractionMethods).toEqual(["CONTENT_STREAM_TEXT", "ANNOTATION_TEXT"]);
    expect(page.text).toContain("Comment: verify pump head");
    expect(page).toMatchObject({ widthPt: 595, heightPt: 842, rotation: 90 });
  });
});
