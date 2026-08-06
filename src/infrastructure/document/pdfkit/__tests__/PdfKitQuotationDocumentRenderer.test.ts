import { describe, expect, it } from "vitest";
import type { QuotationDocumentSnapshot } from "@/src/application/document";
import { PdfKitQuotationDocumentRenderer } from "../PdfKitQuotationDocumentRenderer";

function snapshot(locale: "ar" | "en"): QuotationDocumentSnapshot {
  return { locale, company: { name: locale === "ar" ? "شركة فوكا" : "VOKA Company" }, qrValue: "VOKA:Q-001", quotation: { number: "Q-001", status: "SENT", issueDate: new Date("2026-08-05T00:00:00Z"), expiryDate: new Date("2026-08-20T00:00:00Z"), currencyCode: "KWD", customer: { name: locale === "ar" ? "العميل التجريبي" : "Demo Customer", email: "customer@example.com", phone: "+965 0000 0000", taxNumber: null, billingAddress: null }, lines: [{ position: 1, type: "PRODUCT", itemCode: "SKU-1", itemName: locale === "ar" ? "منتج تجريبي" : "Demo product", description: null, unitName: locale === "ar" ? "قطعة" : "piece", quantity: 2, unitPrice: 10, discountAmount: 0, taxAmount: 1, totalAmount: 21 }], totals: { subtotal: 20, discountAmount: 0, taxAmount: 1, totalAmount: 21 }, notes: null, termsAndConditions: null } };
}
describe("PdfKitQuotationDocumentRenderer", () => {
  it.each(["en", "ar"] as const)("renders a valid %s PDF", async (locale) => { const bytes = await new PdfKitQuotationDocumentRenderer().render(snapshot(locale)); expect(bytes.length).toBeGreaterThan(1_000); expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-"); });
});
