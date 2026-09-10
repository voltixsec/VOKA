import { describe, expect, it } from "vitest";
import { extractPdfText } from "../PdfTextExtractor";

function textPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()]/gu, "")}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
}

function twoPageTextPdf() {
  const first = "BT (Page one requirement) Tj ET";
  const second = "BT (Page two requirement) Tj ET";
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page /Contents 3 0 R >>\nendobj\n2 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n3 0 obj\n<< /Length ${first.length} >>\nstream\n${first}\nendstream\nendobj\n4 0 obj\n<< /Length ${second.length} >>\nstream\n${second}\nendstream\nendobj\n%%EOF`, "latin1");
}

describe("bounded PDF source inspection", () => {
  it("extracts machine-readable text and retains a page boundary", () => {
    const result = extractPdfText(textPdf("BOQ 1 Vehicle elevator each"));
    expect(result.text).toContain("BOQ 1 Vehicle elevator each");
    expect(result.pages[0]).toMatchObject({ pageNumber: 1 });
    expect(result.pages[0].text).toContain("Vehicle elevator");
  });

  it("keeps text attached to the page object that owns its content stream", () => {
    const result = extractPdfText(twoPageTextPdf());
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toMatchObject({ pageNumber: 1, text: "Page one requirement" });
    expect(result.pages[1]).toMatchObject({ pageNumber: 2, text: "Page two requirement" });
  });

  it("rejects bytes that are not a PDF", () => {
    expect(() => extractPdfText(Buffer.from("not a pdf"))).toThrow("PDF_CONTENT_INVALID");
  });
});
