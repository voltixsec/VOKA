import { describe, expect, it } from "vitest";
import { extractPdfText } from "../PdfTextExtractor";

function textPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()]/gu, "")}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
}

describe("bounded PDF source inspection", () => {
  it("extracts machine-readable text without fabricating page attribution", () => {
    const result = extractPdfText(textPdf("BOQ 1 Vehicle elevator each"));
    expect(result.text).toContain("BOQ 1 Vehicle elevator each");
    expect(result.pages[0]).toMatchObject({ pageNumber: null });
    expect(result.pages[0].text).toContain("Vehicle elevator");
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => extractPdfText(Buffer.from("not a pdf"))).toThrow("PDF_CONTENT_INVALID");
  });
});
