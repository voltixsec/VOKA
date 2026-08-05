import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { IQuotationDocumentRenderer, QuotationDocumentSnapshot } from "@/src/application/document";

const labels = {
  en: { title: "QUOTATION", customer: "Customer", issue: "Issue date", expiry: "Expiry date", item: "Item", unit: "Unit", quantity: "Qty", unitPrice: "Unit price", tax: "Tax", total: "Total", subtotal: "Subtotal", discount: "Discount", notes: "Notes", terms: "Terms and conditions", reference: "Reference" },
  ar: { title: "عرض سعر", customer: "العميل", issue: "تاريخ الإصدار", expiry: "تاريخ الانتهاء", item: "البند", unit: "الوحدة", quantity: "الكمية", unitPrice: "سعر الوحدة", tax: "الضريبة", total: "الإجمالي", subtotal: "المجموع الفرعي", discount: "الخصم", notes: "ملاحظات", terms: "الشروط والأحكام", reference: "المرجع" },
} as const;

function ltr(value: string): string { return value; }
function date(value: Date | null, locale: "ar" | "en"): string {
  if (!value) return "-";
  const formatted = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(value);
  return locale === "ar" ? [...formatted].reverse().join("") : formatted;
}
function money(value: number, currency: string, locale: "ar" | "en"): string {
  if (locale === "ar") return ltr(`${currency} ${value.toFixed(3)}`);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}
function quantity(value: number, locale: "ar" | "en"): string { return locale === "ar" ? ltr(String(value)) : String(value); }
function unit(value: string | null, locale: "ar" | "en"): string { const formatted = value ?? "-"; return locale === "ar" && /^[\x00-\x7F]+$/.test(formatted) ? ltr(formatted) : formatted; }
function options(locale: "ar" | "en", width: number): PDFKit.Mixins.TextOptions { return { width, align: locale === "ar" ? "right" : "left", features: ["rlig", "calt", "liga"] }; }
function displayCode(value: string, locale: "ar" | "en"): string { return locale === "ar" ? [...value].reverse().join("") : value; }

export class PdfKitQuotationDocumentRenderer implements IQuotationDocumentRenderer {
  async render(snapshot: QuotationDocumentSnapshot): Promise<Uint8Array> {
    const qrDataUrl = await QRCode.toDataURL(snapshot.qrValue, { margin: 1, width: 180, errorCorrectionLevel: "M" });
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    const fontPath = path.join(process.cwd(), "assets", "fonts", "Cairo-Variable.ttf");
    const doc = new PDFDocument({ size: "A4", margins: { top: 38, right: 38, bottom: 72, left: 38 }, bufferPages: true, info: { Title: `${labels[snapshot.locale].title} ${snapshot.quotation.number}`, Author: snapshot.company.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Uint8Array>((resolve, reject) => { doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject); });
    doc.registerFont("VOKA", fontPath).font("VOKA");
    this.draw(doc, snapshot, qrBuffer);
    doc.end();
    return complete;
  }

  private draw(doc: PDFKit.PDFDocument, snapshot: QuotationDocumentSnapshot, qrBuffer: Buffer): void {
    const locale = snapshot.locale; const quote = snapshot.quotation; const t = labels[locale];
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right; const left = doc.page.margins.left;
    doc.fillColor("#0369a1").fontSize(20).text(snapshot.company.name, left, 38, options(locale, width * 0.58));
    doc.fillColor("#172033").fontSize(16).text(t.title, left + width * 0.62, 38, options(locale, width * 0.38));
    doc.fillColor("#64748b").fontSize(9).text(`${t.reference}: ${displayCode(quote.number, locale)}`, left + width * 0.62, 65, options(locale, width * 0.38));
    doc.moveTo(left, 88).lineTo(left + width, 88).lineWidth(2).strokeColor("#0ea5e9").stroke();
    const cardTop = 105;
    doc.roundedRect(left, cardTop, width * 0.58, 76, 5).fill("#f8fafc"); doc.roundedRect(left + width * 0.61, cardTop, width * 0.39, 76, 5).fill("#f8fafc");
    doc.fillColor("#172033").fontSize(10).text(t.customer, left + 10, cardTop + 10, options(locale, width * 0.58 - 20));
    doc.fontSize(9).text(quote.customer.name, left + 10, cardTop + 30, options(locale, width * 0.58 - 20));
    const contact = [quote.customer.email, quote.customer.phone].filter(Boolean).join(" | ");
    if (contact) doc.fillColor("#64748b").fontSize(8).text(contact, left + 10, cardTop + 50, options(locale, width * 0.58 - 20));
    doc.fillColor("#172033").fontSize(9).text(`${t.issue}: ${date(quote.issueDate, locale)}`, left + width * 0.61 + 10, cardTop + 17, options(locale, width * 0.39 - 20));
    doc.fillColor("#64748b").text(`${t.expiry}: ${date(quote.expiryDate, locale)}`, left + width * 0.61 + 10, cardTop + 42, options(locale, width * 0.39 - 20));
    let y = 205; const columns = [0.32, 0.1, 0.1, 0.17, 0.14, 0.17].map((ratio) => ratio * width); const headers = [t.item, t.unit, t.quantity, t.unitPrice, t.tax, t.total];
    const columnLefts = columns.map((_, index) => locale === "ar"
      ? left + width - columns.slice(0, index + 1).reduce((sum, column) => sum + column, 0)
      : left + columns.slice(0, index).reduce((sum, column) => sum + column, 0));
    doc.rect(left, y, width, 25).fill("#e0f2fe");
    headers.forEach((header, index) => { doc.fillColor("#172033").fontSize(8).text(header, columnLefts[index] + 4, y + 8, { ...options(locale, columns[index] - 8), align: index === 0 ? (locale === "ar" ? "right" : "left") : "right" }); }); y += 25;
    for (const line of quote.lines) {
      const rowHeight = line.description ? 38 : 28; if (y + rowHeight > doc.page.height - 115) { doc.addPage(); y = 50; }
      doc.fillColor("#172033").fontSize(8).text(line.itemName, columnLefts[0] + 4, y + 7, options(locale, columns[0] - 8));
      if (line.description) doc.fillColor("#64748b").fontSize(7).text(line.description, columnLefts[0] + 4, y + 21, options(locale, columns[0] - 8));
      const values = [unit(line.unitName, locale), quantity(line.quantity, locale), money(line.unitPrice, quote.currencyCode, locale), money(line.taxAmount, quote.currencyCode, locale), money(line.totalAmount, quote.currencyCode, locale)];
      values.forEach((value, index) => { doc.fillColor("#172033").fontSize(8).text(value, columnLefts[index + 1] + 4, y + 7, { ...options(locale, columns[index + 1] - 8), align: "right" }); });
      doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(0.5).strokeColor("#cbd5e1").stroke(); y += rowHeight;
    }
    y += 12; const totalsLeft = left + width * 0.52; const totalsWidth = width * 0.48; const rows: Array<[string, string]> = [[t.subtotal, money(quote.totals.subtotal, quote.currencyCode, locale)]];
    if (quote.totals.discountAmount > 0) rows.push([t.discount, `- ${money(quote.totals.discountAmount, quote.currencyCode, locale)}`]); rows.push([t.tax, money(quote.totals.taxAmount, quote.currencyCode, locale)], [t.total, money(quote.totals.totalAmount, quote.currencyCode, locale)]);
    rows.forEach(([label, value], index) => { const last = index === rows.length - 1; if (last) doc.moveTo(totalsLeft, y).lineTo(totalsLeft + totalsWidth, y).lineWidth(1).strokeColor("#0ea5e9").stroke(); doc.fillColor("#172033").fontSize(last ? 10 : 8).text(label, totalsLeft, y + 5, options(locale, totalsWidth * 0.45)); doc.text(value, totalsLeft + totalsWidth * 0.48, y + 5, { ...options(locale, totalsWidth * 0.52), align: "right" }); y += last ? 28 : 21; });
    for (const [title, value] of [[t.notes, quote.notes], [t.terms, quote.termsAndConditions]] as const) { if (!value) continue; if (y > doc.page.height - 150) { doc.addPage(); y = 50; } doc.fillColor("#172033").fontSize(10).text(title, left, y, options(locale, width)); y += 18; doc.fillColor("#475569").fontSize(8).text(value, left, y, options(locale, width)); y = doc.y + 14; }
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) { const footerY = doc.page.height - doc.page.margins.bottom - 46; doc.switchToPage(index); doc.fillColor("#64748b").fontSize(7).text(`VOKA - ${quote.number}`, left, footerY + 22, { width: width - 70, lineBreak: false }); doc.image(qrBuffer, left + width - 52, footerY, { width: 42, height: 42 }); }
  }
}
