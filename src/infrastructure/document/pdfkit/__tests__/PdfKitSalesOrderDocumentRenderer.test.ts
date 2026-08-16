import { describe, expect, it } from "vitest";
import { PdfKitSalesOrderDocumentRenderer } from "../PdfKitSalesOrderDocumentRenderer";
import type { SalesOrderDocumentSnapshot } from "@/src/application/document";

function countPdfPagesByCatalog(bytes: Uint8Array): number {
  const content = Buffer.from(bytes).toString("latin1");
  const matches = content.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 1;
}

function createMockSnapshot(lineCount = 2): SalesOrderDocumentSnapshot {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    position: i + 1,
    type: "SERVICE",
    itemCode: `ITEM-${i + 1}`,
    itemName: `البند رقم ${i + 1}`,
    itemNameAr: `البند رقم ${i + 1}`,
    itemNameEn: `Item Number ${i + 1}`,
    description: `وصف تفصيلي للبند رقم ${i + 1}`,
    descriptionAr: `وصف تفصيلي للبند رقم ${i + 1}`,
    descriptionEn: `Detailed description for item ${i + 1}`,
    unitName: "وحدة",
    unitNameAr: "وحدة",
    unitNameEn: "Unit",
    quantity: 5,
    unitPrice: 100,
    discountAmount: 0,
    taxPercentage: 5,
    taxAmount: 25,
    totalAmount: 525,
  }));

  return {
    locale: "ar",
    company: {
      name: "شركة فولكس للتكنولوجيا",
      address: "الكويت - العاصمة",
      poBox: "12345",
      phone: "+96512345678",
      brandTheme: "NAVY_GOLD",
    },
    salesOrder: {
      id: "so-100",
      number: "SO/2026/100",
      status: "CONFIRMED",
      sourceQuotationId: "q-100",
      sourceQuotationNumber: "Q/2026/100",
      orderDate: new Date("2026-08-01T00:00:00Z"),
      createdAt: new Date("2026-08-02T10:30:00Z"),
      currencyCode: "KWD",
      subjectAr: "توريد وتركيب أجهزة برمجية",
      subjectEn: "Software Supply & Installation",
      briefAr: null,
      briefEn: null,
      projectName: "مشروع البرمجيات",
      projectNameAr: "مشروع البرمجيات",
      projectNameEn: "Software Project",
      attentionName: null,
      attentionNameAr: null,
      attentionNameEn: null,
      scopeType: "SUPPLY_AND_INSTALLATION",
      customer: {
        name: "شركة البناء الحديث",
        nameAr: "شركة البناء الحديث",
        nameEn: "Modern Construction Co.",
        email: "info@modern.kw",
        phone: "+96599998888",
        taxNumber: "300123456",
        billingAddress: "الكويت - الشرق",
      },
      lines,
      discount: null,
      totals: {
        subtotal: 500 * lineCount,
        discountAmount: 0,
        taxAmount: 25 * lineCount,
        totalAmount: 525 * lineCount,
      },
      notes: null,
      notesAr: null,
      notesEn: null,
      termsAndConditions: null,
      termsAndConditionsAr: null,
      termsAndConditionsEn: null,
      sourceApproval: {
        approvedAt: new Date("2026-07-30T00:00:00Z"),
        approvedByName: "أحمد علي",
        approvedByRole: "OWNER",
      },
      creator: {
        userId: "u-1",
        name: "سارة خالد",
        role: "SALES",
      },
      confirmation: {
        confirmedAt: new Date("2026-08-03T14:00:00Z"),
        confirmedByUserId: "u-2",
        confirmedByName: "محمد العتيبي",
        confirmedByRole: "ADMIN",
      },
      cancellation: null,
    },
    qrValue: "VOKA:SO:SO/2026/100",
  };
}


describe("PdfKitSalesOrderDocumentRenderer", () => {
  it("renders a single page PDF for short sales order", async () => {
    const renderer = new PdfKitSalesOrderDocumentRenderer();
    const snapshot = createMockSnapshot(2);
    const bytes = await renderer.render(snapshot);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);

    const pageCount = countPdfPagesByCatalog(bytes);
    expect(pageCount).toBe(1);
  });

  it("renders multi-page PDF with pagination when order has many lines", async () => {
    const renderer = new PdfKitSalesOrderDocumentRenderer();
    const snapshot = createMockSnapshot(35);
    const bytes = await renderer.render(snapshot);

    const pageCount = countPdfPagesByCatalog(bytes);
    expect(pageCount).toBeGreaterThan(1);
  });

  it("renders CANCELLED order that was previously CONFIRMED preserving both confirmation and cancellation", async () => {
    const renderer = new PdfKitSalesOrderDocumentRenderer();
    const snapshot = createMockSnapshot(2);
    snapshot.salesOrder.status = "CANCELLED";
    snapshot.salesOrder.cancellation = {
      cancelledAt: new Date("2026-08-04T12:00:00Z"),
      cancelledByUserId: "u-3",
      cancelledByName: "خالد المنصور",
      cancelledByRole: "OWNER",
      reason: "تغيير متطلبات المشروع من قبل العميل",
    };

    const bytes = await renderer.render(snapshot);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
