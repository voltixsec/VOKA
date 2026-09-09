import { describe, expect, it, vi } from "vitest";
import { drawCompanyDocumentIdentity } from "../company-document-identity";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fakeDoc() {
  const image = vi.fn();
  const text = vi.fn().mockReturnThis();
  const moveDown = vi.fn().mockReturnThis();
  const fillColor = vi.fn().mockReturnThis();
  const fontSize = vi.fn().mockReturnThis();
  return {
    page: { width: 595, height: 842 },
    image,
    text,
    moveDown,
    fillColor,
    fontSize,
  } as unknown as PDFKit.PDFDocument & { image: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn> };
}

describe("draw company document identity", () => {
  it("renders localized name, title, number and consumes logo/letterhead buffers", () => {
    const doc = fakeDoc();
    drawCompanyDocumentIdentity(
      doc,
      {
        name: "Horizon Co",
        address: "Kuwait City",
        poBox: "100",
        phone: "2222",
        mobile: null,
        whatsapp: null,
        logoUrl: PNG,
        letterheadUrl: PNG,
      },
      "en",
      "INVOICE",
      "INV-9",
    );
    expect(doc.image).toHaveBeenCalledTimes(2);
    const texts = doc.text.mock.calls.map((call) => call[0]);
    expect(texts).toContain("Horizon Co");
    expect(texts).toContain("Kuwait City");
    expect(texts).toContain("INVOICE");
    expect(texts).toContain("INV-9");
  });

  it("still renders text identity when assets are missing or invalid", () => {
    const doc = fakeDoc();
    drawCompanyDocumentIdentity(
      doc,
      {
        name: "Plain Co",
        address: null,
        poBox: null,
        phone: null,
        mobile: null,
        whatsapp: null,
        logoUrl: "https://evil.example/x.png",
        letterheadUrl: "data:image/png;base64,AAAA",
      },
      "en",
      "CONTRACT",
      "CT-1",
    );
    expect(doc.image).not.toHaveBeenCalled();
    expect(doc.text.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(["Plain Co", "CONTRACT", "CT-1"]));
  });
});
