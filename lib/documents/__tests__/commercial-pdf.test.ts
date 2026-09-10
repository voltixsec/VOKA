import PDFDocument from 'pdfkit';
import { drawTotals } from '@/src/infrastructure/document/pdfkit/ProposalPdfBoq';
import { drawCommercialTotals } from '../commercial-pdf';
import { describe, expect, it, vi } from "vitest";
import {
  COMMERCIAL_PDF_MARGINS,
  commercialDocumentTitle,
  commercialSnapshotFromParts,
  renderCommercialProposalPdf,
} from "../commercial-pdf";
import { LETTERHEAD_SAFE_AREA, PROPOSAL_COLOR } from "@/src/infrastructure/document/pdfkit/ProposalPdfShared";

describe("commercial documents use quotation visual system", () => {
  it("keeps quotation page geometry tokens", () => {
    expect(COMMERCIAL_PDF_MARGINS).toEqual({ top: 32, right: 38, bottom: 48, left: 38 });
    expect(LETTERHEAD_SAFE_AREA.top).toBe(120);
    expect(PROPOSAL_COLOR.navy).toBe("#0f172a");
  });

  it("changes only document semantics", () => {
    expect(commercialDocumentTitle("INVOICE", "ar")).toBe("فاتورة");
    expect(commercialDocumentTitle("INVOICE", "en")).toBe("INVOICE");
    expect(commercialDocumentTitle("CONTRACT", "ar")).toBe("عقد");
    expect(commercialDocumentTitle("CONTRACT", "en")).toBe("CONTRACT");
  });

  it("maps localized status into snapshot notes instead of raw enums as titles", async () => {
    const snapshot = commercialSnapshotFromParts({
      kind: "INVOICE",
      locale: "ar",
      company: { name: "شركة الأفق", brandTheme: "NAVY_GOLD" },
      number: "INV-1",
      status: "ISSUED",
      issueDate: new Date("2026-09-09T00:00:00.000Z"),
      currencyCode: "KWD",
      customerName: "عميل",
      lines: [
        {
          position: 1,
          type: "PRODUCT",
          itemCode: "CAM",
          itemName: "Camera",
          itemNameAr: "كاميرا",
          itemNameEn: "Camera",
          description: null,
          descriptionAr: null,
          descriptionEn: null,
          unitName: "pcs",
          unitNameAr: null,
          unitNameEn: null,
          quantity: 2,
          unitPrice: 10,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 20,
        },
      ],
      totals: { subtotal: 20, discountAmount: 0, taxAmount: 0, totalAmount: 20 },
      notes: "الحالة: صادرة · غير مدفوعة",
    });
    expect(snapshot.quotation.subjectAr).toBe("فاتورة");
    expect(snapshot.quotation.subjectEn).toBe("INVOICE");
    const bytes = await renderCommercialProposalPdf(snapshot, "INVOICE");
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe('commercial totals retain frozen proposal geometry', () => {
  it.each([
    { subtotal: 100, discountAmount: 0, taxAmount: 0, totalAmount: 100 },
    { subtotal: 100, discountAmount: 0, taxAmount: 5, totalAmount: 105 },
    { subtotal: 100, discountAmount: 10, taxAmount: 5, totalAmount: 95 },
  ])('preserves totals positions and values for %j', (totals) => {
    const snapshot = commercialSnapshotFromParts({ kind: 'INVOICE', locale: 'en', company: { name: 'Company' }, number: 'INV-1', status: 'ISSUED', issueDate: new Date('2026-09-10'), currencyCode: 'KWD', customerName: 'Customer', lines: [], totals });
    const original = new PDFDocument({ size: 'A4' });
    const commercial = new PDFDocument({ size: 'A4' });
    const originalText = vi.spyOn(original, 'text');
    const commercialText = vi.spyOn(commercial, 'text');
    expect(drawCommercialTotals(commercial, snapshot, 200)).toBe(drawTotals(original, snapshot, 200));
    const normalize = (calls: unknown[][]) => calls.map(([label, ...args]) => [label === 'Total proposal value' ? 'Total value' : label === 'Net proposal value' ? 'Net value' : label, ...args]);
    expect(commercialText.mock.calls).toEqual(normalize(originalText.mock.calls));
    original.end(); commercial.end();
  });
});
it('keeps Latin runs readable in Arabic fallback content of English documents', async () => {
  const text = vi.spyOn(PDFDocument.prototype, 'text');
  try {
    const snapshot = commercialSnapshotFromParts({ kind: 'CONTRACT', locale: 'en', company: { name: 'Company' }, number: 'CN-1', status: 'DRAFT', issueDate: new Date('2026-09-10'), currencyCode: 'KWD', customerName: 'Customer', lines: [], notes: 'كاميرا Demo 4MP PoE', totals: { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 } });
    await renderCommercialProposalPdf(snapshot, 'CONTRACT');
    expect(text.mock.calls.map(([value]) => value)).toEqual(expect.arrayContaining(['Demo', '4MP', 'PoE']));
  } finally { text.mockRestore(); }
});
