import path from "node:path";
import PDFDocument from "pdfkit";
import { displayLabel } from "@/lib/i18n/display-labels";
import {
  decodeCompanyDocumentImage,
  type CompanyDocumentIdentity,
} from "@/lib/documents/company-document-identity";

const COLOR = {
  navy: "#0f172a",
  gold: "#c9a227",
  blue: "#0369a1",
  muted: "#64748b",
  line: "#cbd5e1",
  pale: "#f8fafc",
  lightBlue: "#f0f9ff",
  white: "#ffffff",
  slate: "#475569",
} as const;

export type CommercialPdfKind = "INVOICE" | "CONTRACT";

export type CommercialPdfLine = {
  position: number;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type CommercialPdfInput = {
  kind: CommercialPdfKind;
  locale: "ar" | "en";
  identity: CompanyDocumentIdentity;
  number: string;
  status: string;
  settlementStatus?: string | null;
  customerName: string;
  dateLabel: string;
  dateValue: string;
  dueLabel?: string;
  dueValue?: string;
  currencyCode: string;
  provenance?: string | null;
  lines: CommercialPdfLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount?: number;
  outstandingAmount?: number;
  notes?: string | null;
  terms?: string | null;
  milestones?: Array<{ position: number; title: string; amount: string }>;
};

function t(locale: "ar" | "en", ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function money(value: number, currency: string) {
  return `${currency} ${value.toFixed(3)}`;
}

function textOpts(align: "left" | "right" | "center", width: number, height?: number): PDFKit.Mixins.TextOptions {
  return { width, align, lineBreak: true, features: ["rlig", "calt", "liga"], ...(height ? { height, ellipsis: true } : {}) };
}

export async function renderCommercialPdf(input: CommercialPdfInput): Promise<Buffer> {
  const locale = input.locale;
  const ar = locale === "ar";
  const align = ar ? "right" : "left";
  const title = input.kind === "INVOICE" ? t(locale, "فاتورة", "INVOICE") : t(locale, "عقد", "CONTRACT");
  const doc = new PDFDocument({ size: "A4", margin: 38, info: { Title: `${title} ${input.number}`, Author: input.identity.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (x) => chunks.push(Buffer.from(x)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("VOKA", path.join(process.cwd(), "assets", "fonts", "Cairo-Variable.ttf")).font("VOKA");

  const pageWidth = doc.page.width;
  const left = 38;
  const usable = pageWidth - 76;
  const letterhead = decodeCompanyDocumentImage(input.identity.letterheadUrl);
  let y = 16;
  if (letterhead) {
    try {
      doc.image(letterhead, 0, 0, { fit: [pageWidth, doc.page.height], align: "center", valign: "center" });
      y = 124;
    } catch {
      y = 16;
    }
  } else {
    doc.rect(0, 0, pageWidth, 132).fill(COLOR.navy);
    doc.rect(0, 128, pageWidth, 4).fill(COLOR.gold);
    const logo = decodeCompanyDocumentImage(input.identity.logoUrl);
    const logoW = 96;
    const companyW = usable - logoW - 24;
    const companyX = ar ? pageWidth - 38 - companyW : left;
    const logoX = ar ? left : pageWidth - 38 - logoW;
    if (logo) {
      try {
        doc.image(logo, logoX, 16, { fit: [logoW, 52], align: "center", valign: "center" });
      } catch {
        /* ignore invalid logo */
      }
    }
    doc.fillColor(COLOR.white).fontSize(15).text(input.identity.name, companyX, 12, textOpts(align, companyW, 18));
    if (input.identity.address) {
      doc.fontSize(8.5).text(input.identity.address, companyX, 34, textOpts(align, companyW, 16));
    }
    const contact = [
      input.identity.poBox ? `${t(locale, "ص.ب", "P.O. Box")}: ${input.identity.poBox}` : null,
      input.identity.phone ? `${t(locale, "هاتف", "Tel")}: ${input.identity.phone}` : null,
      input.identity.mobile ? `${t(locale, "موبايل", "Mobile")}: ${input.identity.mobile}` : null,
    ]
      .filter(Boolean)
      .join("   |   ");
    if (contact) doc.fontSize(8).text(contact, companyX, 54, textOpts(align, companyW, 12));
    y = 146;
  }

  doc.fillColor(COLOR.navy).fontSize(20).text(title, left, y, textOpts("center", usable, 24));
  y += 32;
  doc.fontSize(11).fillColor(COLOR.blue).text(input.number, left, y, textOpts("center", usable, 16));
  y += 28;

  const cardH = input.dueValue ? 88 : 72;
  doc.roundedRect(left, y, usable, cardH, 7).fill(COLOR.pale);
  doc.roundedRect(left, y, usable, cardH, 7).lineWidth(0.6).strokeColor(COLOR.line).stroke();
  const statusText = [displayLabel(input.status, locale), input.settlementStatus ? displayLabel(input.settlementStatus, locale) : null]
    .filter(Boolean)
    .join(" · ");
  const meta = [
    `${t(locale, "الحالة", "Status")}: ${statusText}`,
    `${t(locale, "العميل", "Customer")}: ${input.customerName}`,
    `${input.dateLabel}: ${input.dateValue}`,
    input.dueLabel && input.dueValue ? `${input.dueLabel}: ${input.dueValue}` : null,
    `${t(locale, "العملة", "Currency")}: ${input.currencyCode}`,
    input.provenance ? `${t(locale, "المصدر", "Source")}: ${input.provenance}` : null,
  ].filter((row): row is string => Boolean(row));
  meta.forEach((row, i) => {
    doc.fillColor(COLOR.slate).fontSize(9).text(row, left + 12, y + 8 + i * 12, textOpts(align, usable - 24, 12));
  });
  y += cardH + 14;

  const cols = ar
    ? [
        { key: "total", w: 90 },
        { key: "unit", w: 90 },
        { key: "qty", w: 70 },
        { key: "name", w: usable - 280 },
        { key: "pos", w: 30 },
      ]
    : [
        { key: "pos", w: 30 },
        { key: "name", w: usable - 280 },
        { key: "qty", w: 70 },
        { key: "unit", w: 90 },
        { key: "total", w: 90 },
      ];
  const headers: Record<string, string> = {
    pos: "#",
    name: t(locale, "البند", "Item"),
    qty: t(locale, "الكمية", "Qty"),
    unit: t(locale, "سعر الوحدة", "Unit price"),
    total: t(locale, "الإجمالي", "Total"),
  };
  const drawHead = () => {
    doc.rect(left, y, usable, 22).fill(COLOR.navy);
    let x = left;
    cols.forEach((col) => {
      doc.fillColor(COLOR.white).fontSize(8).text(headers[col.key], x + 4, y + 6, textOpts(align, col.w - 8, 12));
      x += col.w;
    });
    y += 22;
  };
  drawHead();
  input.lines.forEach((line, index) => {
    if (y > 720) {
      doc.addPage();
      y = 48;
      drawHead();
    }
    if (index % 2 === 1) doc.rect(left, y, usable, 20).fill(COLOR.lightBlue);
    const cells: Record<string, string> = {
      pos: String(line.position),
      name: line.name,
      qty: line.quantity.toFixed(3),
      unit: money(line.unitPrice, input.currencyCode),
      total: money(line.total, input.currencyCode),
    };
    let x = left;
    cols.forEach((col) => {
      doc.fillColor(COLOR.navy).fontSize(8).text(cells[col.key], x + 4, y + 5, textOpts(align, col.w - 8, 12));
      x += col.w;
    });
    y += 20;
  });

  y += 12;
  const totals = [
    { label: t(locale, "المجموع الفرعي", "Subtotal"), value: money(input.subtotal, input.currencyCode), strong: false },
    { label: t(locale, "الخصم", "Discount"), value: money(input.discountAmount, input.currencyCode), strong: false },
    { label: t(locale, "الضريبة", "Tax"), value: money(input.taxAmount, input.currencyCode), strong: false },
    { label: t(locale, "الإجمالي", "Total"), value: money(input.totalAmount, input.currencyCode), strong: true },
  ];
  if (input.paidAmount != null) totals.push({ label: t(locale, "المدفوع", "Paid"), value: money(input.paidAmount, input.currencyCode), strong: false });
  if (input.outstandingAmount != null) {
    totals.push({ label: t(locale, "المتبقي", "Outstanding"), value: money(input.outstandingAmount, input.currencyCode), strong: false });
  }
  const boxW = Math.min(280, usable);
  const boxX = ar ? left : left + usable - boxW;
  totals.forEach((row) => {
    if (row.strong) doc.rect(boxX, y, boxW, 22).fill(COLOR.lightBlue);
    doc.fillColor(row.strong ? COLOR.blue : COLOR.slate).fontSize(row.strong ? 10 : 8)
      .text(row.label, boxX + 8, y + 5, textOpts(align, boxW * 0.45, 14));
    doc.fillColor(row.strong ? COLOR.blue : COLOR.navy).fontSize(row.strong ? 10 : 8)
      .text(row.value, boxX + boxW * 0.48, y + 5, textOpts(ar ? "left" : "right", boxW * 0.48, 14));
    y += row.strong ? 22 : 18;
  });

  if (input.milestones?.length) {
    y += 10;
    doc.fillColor(COLOR.navy).fontSize(11).text(t(locale, "جدول الدفعات", "Milestones"), left, y, textOpts(align, usable, 16));
    y += 18;
    input.milestones.forEach((m) => {
      doc.fillColor(COLOR.slate).fontSize(9).text(`${m.position}. ${m.title} — ${m.amount}`, left, y, textOpts(align, usable, 14));
      y += 14;
    });
  }
  if (input.notes) {
    y += 8;
    doc.fillColor(COLOR.navy).fontSize(10).text(`${t(locale, "ملاحظات", "Notes")}: ${input.notes}`, left, y, textOpts(align, usable));
  }
  if (input.terms) {
    y += 16;
    doc.fillColor(COLOR.navy).fontSize(10).text(`${t(locale, "الشروط والأحكام", "Terms and conditions")}: ${input.terms}`, left, y, textOpts(align, usable));
  }
  doc.end();
  return done;
}
