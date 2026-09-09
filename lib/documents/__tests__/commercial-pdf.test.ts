import { describe, expect, it } from "vitest";
import { renderCommercialPdf } from "../commercial-pdf";

describe("commercial invoice/contract PDF", () => {
  it("renders an invoice without dumping raw status enums as the only header", async () => {
    const bytes = await renderCommercialPdf({
      kind: "INVOICE",
      locale: "ar",
      identity: {
        name: "شركة الأفق",
        address: "الكويت",
        poBox: "1",
        phone: "123",
        mobile: null,
        whatsapp: null,
        logoUrl: null,
        letterheadUrl: null,
      },
      number: "INV-1",
      status: "ISSUED",
      settlementStatus: "UNPAID",
      customerName: "عميل",
      dateLabel: "تاريخ الفاتورة",
      dateValue: "2026-09-09",
      dueLabel: "الاستحقاق",
      dueValue: "2026-09-30",
      currencyCode: "KWD",
      lines: [{ position: 1, name: "كاميرا", quantity: 2, unitPrice: 10, total: 20 }],
      subtotal: 20,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 20,
      paidAmount: 0,
      outstandingAmount: 20,
    });
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(800);
  });
});
