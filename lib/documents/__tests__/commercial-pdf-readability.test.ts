import fs from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vitest";
import { commercialSnapshotFromParts, drawCommercialHeader, renderCommercialProposalPdf } from "../commercial-pdf";
import { COMMERCIAL_LABEL_STYLE, commercialRowHeight, wrapCommercialText } from "../commercial-pdf-layout";

const descriptionAr = "توريد وتركيب كاميرا Hikvision DS-2CD2143G2-I بدقة 4MP مع PoE وعدسة واسعة، تشمل الحوامل والكابلات وضبط الشبكة واختبار التسجيل وتسليم النظام مع التدريب والضمان.";
const descriptionEn = "Supply and install Hikvision DS-2CD2143G2-I 4MP PoE camera with wide-angle lens, brackets, cabling, network configuration, recording tests, commissioning, operator training and warranty.";

function fixture(kind: "INVOICE" | "CONTRACT", locale: "ar" | "en", oversized = false) {
  return commercialSnapshotFromParts({
    kind, locale, company: { name: "VOKA Demo Company", brandTheme: "NAVY_GOLD", address: "Kuwait City", phone: "+965 2222 1234" },
    number: kind === "INVOICE" ? "INV-202609-0001" : "CN-202609-0001", status: "DRAFT",
    issueDate: new Date("2026-09-10"), dueDate: new Date("2026-10-10"), currencyCode: "KWD",
    customerName: locale === "ar" ? "شركة العميل" : "Customer Company",
    projectNameAr: "أنظمة المراقبة", projectNameEn: "Surveillance systems",
    attentionNameAr: "مدير المشروع", attentionNameEn: "Project manager", scopeType: "SUPPLY_AND_INSTALLATION",
    briefAr: "توريد وتركيب واختبار نظام المراقبة", briefEn: "Supply, installation and testing of the surveillance system",
    notesAr: "التنفيذ وفق المواصفات المعتمدة", notesEn: "Delivery according to the approved specifications",
    lines: Array.from({ length: oversized ? 2 : 16 }, (_, index) => ({
      position: index + 1, type: index % 2 ? "SERVICE" as const : "PRODUCT" as const,
      itemCode: `CAM-${index + 1}`, itemName: "Camera installation", itemNameAr: "كاميرا وتركيب", itemNameEn: "Camera and installation",
      description: null, descriptionAr: Array(oversized && index === 0 ? 35 : 2).fill(descriptionAr).join(" ") + " نهاية",
      descriptionEn: Array(oversized && index === 0 ? 35 : 2).fill(descriptionEn).join(" ") + " END",
      unitName: "pcs", unitNameAr: "قطعة", unitNameEn: "pcs", quantity: 2, unitPrice: 25.5, discountAmount: 0, taxAmount: 2.55, totalAmount: 53.55,
    })),
    totals: { subtotal: 816, discountAmount: 0, taxAmount: 40.8, totalAmount: 856.8 },
  });
}

describe("Invoice/Contract readability", () => {
  it.each([descriptionAr, descriptionEn, "MODEL".repeat(100)])("wraps without losing text or overflowing width", (value) => {
    const doc = new PDFDocument();
    doc.font(path.join(process.cwd(), "assets/fonts/Cairo-Variable.ttf")).fontSize(7.2);
    const lines = wrapCommercialText(doc, value, 190);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("").replace(/\s/g, "")).toBe(value.replace(/\s/g, ""));
    for (const line of lines) expect(doc.widthOfString(line)).toBeLessThanOrEqual(190.001);
    expect(commercialRowHeight(lines.length, doc.currentLineHeight(true))).toBeGreaterThan(24);
    doc.end();
  });

  it.each(["INVOICE", "CONTRACT"] as const)("renders %s in both locales with complete paginated rows", async (kind) => {
    for (const locale of ["ar", "en"] as const) {
      const calls: Array<{ value: string; y: number; size: number; font: string; options: PDFKit.Mixins.TextOptions }> = [];
      const originalText = PDFDocument.prototype.text;
      const spy = vi.spyOn(PDFDocument.prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, value: string, x: any, y?: any, options?: any) {
        calls.push({ value, y, size: (this as any)._fontSize, font: (this as any)._font.name, options: options ?? {} });
        return originalText.call(this, value, x, y, options);
      } as typeof originalText);
      try {
        const bytes = await renderCommercialProposalPdf(fixture(kind, locale), kind);
        const rowCalls = calls.filter((call) => call.size === 7.2);
        expect(rowCalls.length).toBeGreaterThan(50);
        expect(rowCalls.every((call) => call.options.ellipsis === false && call.options.height === undefined)).toBe(true);
        expect(rowCalls.every((call) => call.y >= 170 && call.y < 762)).toBe(true);
        expect(rowCalls.filter((call) => call.value.endsWith(locale === "ar" ? "نهاية" : "END"))).toHaveLength(16);
        for (const token of ["Hikvision", "DS-2CD2143G2-I", "4MP", "PoE"]) expect(rowCalls.some((call) => call.value.includes(token))).toBe(true);
        expect(calls.some((call) => call.value === (locale === "ar" ? "الموضوع" : "Subject") && call.size === COMMERCIAL_LABEL_STYLE.subject)).toBe(true);
        const labels = calls.filter((call) => [locale === "ar" ? "الموضوع" : "Subject", locale === "ar" ? "العميل" : "Customer"].includes(call.value));
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every((call) => /SemiBold/i.test(call.font))).toBe(true);
        expect(calls.some((call) => call.value.includes("SUPPLY_AND_INSTALLATION"))).toBe(false);
        expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(2);
        if (process.env.COMMERCIAL_PDF_QA_DIR) {
          await fs.mkdir(process.env.COMMERCIAL_PDF_QA_DIR, { recursive: true });
          await fs.writeFile(path.join(process.env.COMMERCIAL_PDF_QA_DIR, `${kind.toLowerCase()}-${locale}.pdf`), bytes);
        }
      } finally { spy.mockRestore(); }
    }
  });

  it.each(["ar", "en"] as const)("continues a single oversized %s row without dropping its end or next row", async (locale) => {
    const spy = vi.spyOn(PDFDocument.prototype, "text");
    try {
      const bytes = await renderCommercialProposalPdf(fixture("INVOICE", locale, true), "INVOICE");
      const values = spy.mock.calls.map(([value]) => value);
      expect(values.filter((value) => typeof value === "string" && value.endsWith(locale === "ar" ? "نهاية" : "END"))).toHaveLength(2);
      expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(3);
      if (process.env.COMMERCIAL_PDF_QA_DIR) await fs.writeFile(path.join(process.env.COMMERCIAL_PDF_QA_DIR, `overflow-${locale}.pdf`), bytes);
    } finally { spy.mockRestore(); }
  });
});

it.each(["ar", "en"] as const)("preserves logo/header separation in %s", (locale) => {
  const doc = new PDFDocument({ size: "A4" });
  const snapshot = fixture("CONTRACT", locale);
  snapshot.company.logoUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = vi.spyOn(doc, "image").mockReturnValue(doc);
  const text = vi.spyOn(doc, "text");
  expect(drawCommercialHeader(doc, snapshot, "CONTRACT")).toBe(146);
  const logoX = image.mock.calls[0][1] as number;
  const company = text.mock.calls.find(([value]) => value === "VOKA Demo Company")! as unknown as [string, number, number, PDFKit.Mixins.TextOptions];
  const companyX = company[1] as number;
  const options = company[3] as PDFKit.Mixins.TextOptions;
  if (locale === "ar") expect(logoX + 96 + 24).toBeLessThanOrEqual(companyX);
  else expect(companyX + options.width! + 24).toBeLessThanOrEqual(logoX);
  doc.end();
});
