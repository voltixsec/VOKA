import { describe, expect, it } from "vitest";
import { citationPageNumber, pdfProcessingState } from "@/src/domain/source-artifact";
import { extractPdfText } from "../PdfTextExtractor";

function pdf(streams: string[], pageObjects: number) {
  const pages = Array.from({ length: pageObjects }, (_, index) => `${index + 1} 0 obj\n<< /Type /Page /Parent 99 0 R >>\nendobj`).join("\n");
  const content = streams.map((stream, index) => `${index + 10} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`).join("\n");
  return Buffer.from(`%PDF-1.4\n${pages}\n${content}\n%%EOF`, "latin1");
}
const textStream = (text: string) => `BT /F1 12 Tf 72 720 Td (${text.replace(/[()]/gu, "")}) Tj ET`;

describe("bounded honest PDF text extraction", () => {
  it("extracts machine-readable text from a single-page PDF and knows the page", () => {
    const result = extractPdfText(pdf([textStream("BOQ 1 Vehicle elevator each")], 1));
    expect(result.text).toContain("BOQ 1 Vehicle elevator each");
    expect(result.pageCount).toBe(1);
    expect(result.pageAttribution).toBe("SINGLE_PAGE");
    expect(result.pages).toEqual([{ pageNumber: 1, text: "BOQ 1 Vehicle elevator each", characterCount: 27 }]);
    expect(pdfProcessingState(result)).toBe("TEXT_EXTRACTED");
    expect(citationPageNumber(result)).toBe(1);
  });

  it("returns an empty, page-less extraction for an image-only or scanned PDF without inventing page 1", () => {
    const scanned = extractPdfText(pdf(["\u00ff\u00d8\u00ff\u00e0 binary image payload without text operators"], 1));
    expect(scanned.text).toBe("");
    expect(scanned.pages).toEqual([]);
    expect(scanned.pageAttribution).toBe("NONE");
    expect(pdfProcessingState(scanned)).toBe("TEXT_NOT_EXTRACTABLE");
    expect(citationPageNumber(scanned)).toBeNull();
    const empty = extractPdfText(Buffer.from("%PDF-1.7\n%%EOF", "latin1"));
    expect(empty).toMatchObject({ text: "", pages: [], pageCount: null, pageAttribution: "NONE" });
    expect(pdfProcessingState(empty)).toBe("TEXT_NOT_EXTRACTABLE");
  });

  it("leaves the page undetermined for multi-page text without explicit page breaks", () => {
    const result = extractPdfText(pdf([textStream("1 IP camera each"), textStream("12 CAT6 cable m")], 3));
    expect(result.text).toContain("IP camera");
    expect(result.pageCount).toBe(3);
    expect(result.pages).toEqual([]);
    expect(result.pageAttribution).toBe("UNDETERMINED");
    expect(citationPageNumber(result)).toBeNull();
  });

  it("keeps explicit page breaks as genuine page boundaries", () => {
    const result = extractPdfText(pdf([textStream("First page item each\fSecond page item m")], 2));
    expect(result.pageAttribution).toBe("EXPLICIT_PAGE_BREAKS");
    expect(result.pages.map((page) => [page.pageNumber, page.text])).toEqual([[1, "First page item each"], [2, "Second page item m"]]);
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => extractPdfText(Buffer.from("not a pdf"))).toThrow("PDF_CONTENT_INVALID");
  });
});
