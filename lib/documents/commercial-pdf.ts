import path from "node:path";
import PDFDocument from "pdfkit";
import { COMMERCIAL_LABEL_STYLE as LABEL, COMMERCIAL_ROW_STYLE, commercialRowHeight, wrapCommercialText } from "./commercial-pdf-layout";
import { commercialUnitLabel } from "@/lib/i18n/unit-labels";
import { displayLabel } from "@/lib/i18n/display-labels";
import type { QuotationDocumentSnapshot } from "@/src/application/document";
import { quotationTermsPresentation } from "@/src/application/document/quotation-terms-presentation";
import {
  columnPositions,

  proposalBoqItemText,
} from "@/src/infrastructure/document/pdfkit/ProposalPdfBoq";
import {
  LETTERHEAD_SAFE_AREA,
  PROPOSAL_COLOR,
  PROPOSAL_TEXT,
  configureProposalTextDirection,
  decodeProposalImageDataUrl,
  drawProposalCard,
  drawProposalCompanyApproval,
  drawProposalLetterhead,

  formatProposalDate,
  formatProposalMoney,
  proposalAlignment,
  proposalBrand,
  proposalScopeLabel,
  proposalTextOptions,
  type ProposalPdfDocument,
  type ProposalSnapshot,
} from "@/src/infrastructure/document/pdfkit/ProposalPdfShared";

export const COMMERCIAL_PDF_MARGINS = { top: 32, right: 38, bottom: 48, left: 38 } as const;

export type CommercialPdfKind = "INVOICE" | "CONTRACT";

export function commercialDocumentTitle(kind: CommercialPdfKind, locale: "ar" | "en") {
  if (kind === "INVOICE") return locale === "ar" ? "فاتورة" : "INVOICE";
  return locale === "ar" ? "عقد" : "CONTRACT";
}

/** Same geometry as drawProposalHeader; only the document title differs. */
export function drawCommercialHeader(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  title: string,
  hasLetterhead = false,
): number {
  const locale = snapshot.locale;
  const brand = proposalBrand(snapshot);
  const company = snapshot.company;
  const pageWidth = doc.page.width;
  const left = 38;
  const right = 38;
  const usableWidth = pageWidth - left - right;
  const headerHeight = 132;

  if (hasLetterhead) {
    doc.fillColor(brand.primary).fontSize(20).text(title, left, LETTERHEAD_SAFE_AREA.top + 4, proposalTextOptions("center", usableWidth, 24));
    return LETTERHEAD_SAFE_AREA.top + 38;
  }

  const labels =
    locale === "ar"
      ? { poBox: "ص.ب", phone: "هاتف", mobile: "موبايل", whatsapp: "واتساب" }
      : { poBox: "P.O. Box", phone: "Tel", mobile: "Mobile", whatsapp: "WhatsApp" };

  const firstContactLine = [
    company.poBox ? labels.poBox + ": " + company.poBox : null,
    company.phone ? labels.phone + ": " + company.phone : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("   |   ");

  const secondContactLine = [
    company.mobile ? labels.mobile + ": " + company.mobile : null,
    company.whatsapp ? labels.whatsapp + ": " + company.whatsapp : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("   |   ");

  doc.rect(0, 0, pageWidth, headerHeight).fill(brand.primary);
  doc.rect(0, headerHeight - 4, pageWidth, 4).fill(brand.accent);

  const logo = decodeProposalImageDataUrl(company.logoUrl);
  const logoWidth = 96;
  const logoHeight = 52;
  const gap = 24;
  const companyWidth = usableWidth - logoWidth - gap;
  const companyX = locale === "ar" ? pageWidth - right - companyWidth : left;
  const logoX = locale === "ar" ? left : pageWidth - right - logoWidth;

  if (logo) {
    try {
      doc.image(logo, logoX, 16, { fit: [logoWidth, logoHeight], align: "center", valign: "center" });
    } catch {
      /* Invalid logo data must not stop PDF generation. */
    }
  }

  const align = locale === "ar" ? "right" : "left";
  const headerTextColor = brand.textOnPrimary;

  doc.fillColor(headerTextColor).fontSize(15).text(company.name, companyX, 12, proposalTextOptions(align, companyWidth, 18));
  if (company.address) {
    doc.fillColor(headerTextColor).fontSize(8.5).text(company.address, companyX, 34, proposalTextOptions(align, companyWidth, 16));
  }
  if (firstContactLine) {
    doc.fillColor(headerTextColor).fontSize(8).text(firstContactLine, companyX, 54, proposalTextOptions(align, companyWidth, 10));
  }
  if (secondContactLine) {
    doc.fillColor(headerTextColor).fontSize(8).text(secondContactLine, companyX, 68, proposalTextOptions(align, companyWidth, 10));
  }
  doc.fillColor(headerTextColor).fontSize(24).text(title, left, 76, proposalTextOptions("center", usableWidth, 20));
  return 146;
}

function drawCommercialSubject(doc: ProposalPdfDocument, snapshot: ProposalSnapshot, y: number, title: string): number {
  const width = doc.page.width - 76;
  const brand = proposalBrand(snapshot);
  const subject = (snapshot.locale === "ar" ? snapshot.quotation.subjectAr : snapshot.quotation.subjectEn) || title;
  // Preserve ProposalPdfShared subject card geometry; change only commercial labels.
  drawProposalCard(doc, 38, y, width, 72, brand.soft);
  doc.font(LABEL.font).fillColor(PROPOSAL_COLOR.muted).fontSize(LABEL.subject).text(snapshot.locale === "ar" ? "الموضوع" : "Subject", 50, y + 10, proposalTextOptions("center", width - 24)).font("VOKA");
  doc.fillColor(brand.primary).fontSize(16).text(subject, 50, y + 31, proposalTextOptions("center", width - 24, 31));
  return y + 84;
}

function drawField(
  doc: ProposalPdfDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right",
): void {
  doc.font(LABEL.font).fillColor(PROPOSAL_COLOR.muted).fontSize(LABEL.field).text(label, x, y, proposalTextOptions(align, width)).font("VOKA");
  doc.fillColor(PROPOSAL_COLOR.navy).fontSize(9).text(value || "-", x, y + 15, proposalTextOptions(align, width, 27));
}

function drawCompactField(
  doc: ProposalPdfDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right",
): void {
  doc.font(LABEL.font).fillColor(PROPOSAL_COLOR.muted).fontSize(LABEL.compact).text(label, x, y, proposalTextOptions(align, width)).font("VOKA");
  doc.fillColor(PROPOSAL_COLOR.navy).fontSize(8).text(value || "-", x, y + 14, proposalTextOptions(align, width, 20));
}

function drawCoverCommercialSummary(doc: ProposalPdfDocument, snapshot: ProposalSnapshot, y: number, compactForLetterhead = false): number {
  const locale = snapshot.locale;
  const quote = snapshot.quotation;
  const brand = proposalBrand(snapshot);
  const left = 38;
  const width = doc.page.width - 76;
  const align = locale === "ar" ? "right" : "left";
  const notes = locale === "ar" ? quote.notesAr || quote.notes || null : quote.notesEn || quote.notes || null;
  const terms = locale === "ar" ? quote.termsAndConditionsAr || quote.termsAndConditions || null : quote.termsAndConditionsEn || quote.termsAndConditions || null;
  const notesLabel = locale === "ar" ? "ملاحظات" : "Notes";
  const termsLabel = locale === "ar" ? "الشروط والأحكام" : "Terms and conditions";
  const netLabel = locale === "ar" ? "صافي القيمة" : "Net value";
  let currentY = y;

  if (notes) {
    const notesHeight = compactForLetterhead ? 60 : 68;
    drawProposalCard(doc, left, currentY, width, notesHeight, brand.soft);
    doc.font(LABEL.font).fillColor(brand.primary).fontSize(LABEL.section).text(notesLabel, left + 14, currentY + 10, proposalTextOptions(align, width - 28)).font("VOKA");
    doc.fillColor(PROPOSAL_COLOR.slate).fontSize(8).text(notes, left + 14, currentY + 29, proposalTextOptions(align, width - 28, 30));
    currentY += notesHeight + (compactForLetterhead ? 6 : 10);
  }

  if (terms) {
    const displayTerms = quotationTermsPresentation(terms).text;
    doc.fontSize(8);
    const textHeight = doc.heightOfString(displayTerms, { width: width - 28, align });
    const availableHeight = doc.page.height - 82 - (compactForLetterhead ? 56 : 70) - currentY;
    const termsHeight = Math.max(compactForLetterhead ? 74 : 86, Math.min(textHeight + 42, availableHeight));
    drawProposalCard(doc, left, currentY, width, termsHeight, PROPOSAL_COLOR.pale);
    doc.font(LABEL.font).fillColor(brand.primary).fontSize(LABEL.section).text(termsLabel, left + 14, currentY + 10, proposalTextOptions(align, width - 28)).font("VOKA");
    doc.fillColor(PROPOSAL_COLOR.slate).fontSize(8).text(displayTerms, left + 14, currentY + 29, proposalTextOptions(align, width - 28, termsHeight - 38));
    currentY += termsHeight + (compactForLetterhead ? 6 : 12);
  }

  const valueHeight = compactForLetterhead ? 50 : 58;
  doc.roundedRect(left, currentY, width, valueHeight, 8).fill(brand.primary);
  doc.font(LABEL.font).fillColor(brand.textOnPrimary).fontSize(LABEL.section).text(netLabel, left + 16, currentY + 10, proposalTextOptions(locale === "ar" ? "right" : "left", width - 32)).font("VOKA");
  doc.fillColor(brand.textOnPrimary).fontSize(15).text(
    formatProposalMoney(quote.totals.totalAmount, quote.currencyCode),
    left + 16,
    currentY + (compactForLetterhead ? 24 : 28),
    proposalTextOptions(locale === "ar" ? "left" : "right", width - 32, 22),
  );
  return currentY + valueHeight;
}

function drawCommercialCover(doc: ProposalPdfDocument, snapshot: ProposalSnapshot, title: string): boolean {
  const locale = snapshot.locale;
  const quote = snapshot.quotation;
  const text = PROPOSAL_TEXT[locale];
  const align = proposalAlignment(locale);
  const left = 38;
  const width = doc.page.width - 76;
  const hasLetterhead = drawProposalLetterhead(doc, snapshot);
  let y = drawCommercialHeader(doc, snapshot, title, hasLetterhead);
  y = drawCommercialSubject(doc, snapshot, y, title);

  drawProposalCard(doc, left, y, width, 116);
  const gap = 14;
  const columnWidth = (width - gap * 2) / 3;
  drawField(doc, text.reference, quote.number, left + 12, y + 13, columnWidth - 18, align);
  drawField(doc, text.issueDate, formatProposalDate(quote.issueDate), left + columnWidth + gap + 6, y + 13, columnWidth - 18, align);
  if (quote.expiryDate || locale !== "en") {
    drawField(doc, locale === "ar" ? "تاريخ الاستحقاق / الانتهاء" : "Due / end date", formatProposalDate(quote.expiryDate), left + (columnWidth + gap) * 2, y + 13, columnWidth - 18, align);
  }
  drawField(doc, text.customer, quote.customer.name, left + 12, y + 65, columnWidth - 18, align);
  drawField(
    doc,
    text.project,
    (locale === "ar" ? quote.projectNameAr || quote.projectName : quote.projectNameEn || quote.projectName) || "-",
    left + columnWidth + gap + 6,
    y + 65,
    columnWidth - 18,
    align,
  );
  drawField(
    doc,
    text.attention,
    (locale === "ar" ? quote.attentionNameAr || quote.attentionName : quote.attentionNameEn || quote.attentionName) || "-",
    left + (columnWidth + gap) * 2,
    y + 65,
    columnWidth - 18,
    align,
  );
  y += 128;

  drawProposalCard(doc, left, y, width, 132);
  drawField(doc, text.scope, proposalScopeLabel(quote.scopeType, locale), left + 14, y + 13, width - 28, align);
  doc.moveTo(left + 14, y + 56).lineTo(left + width - 14, y + 56).lineWidth(0.4).strokeColor(PROPOSAL_COLOR.line).stroke();
  doc.font(LABEL.font).fillColor(PROPOSAL_COLOR.muted).fontSize(LABEL.summary).text(locale === "ar" ? "الملخص" : "Summary", left + 14, y + 67, proposalTextOptions(align, width - 28)).font("VOKA");
  const brief = locale === "ar" ? quote.briefAr : quote.briefEn;
  doc.fillColor(PROPOSAL_COLOR.navy).fontSize(10.5).text(brief || "-", left + 14, y + 87, proposalTextOptions(align, width - 28, 34));
  y += 144 + 14;
  drawCoverCommercialSummary(doc, snapshot, y, hasLetterhead);
  return hasLetterhead;
}

export function drawCommercialTotals(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
): number {
  const quote =
    snapshot.quotation;

  const locale =
    snapshot.locale;

  const brand =
    proposalBrand(
      snapshot,
    );

  const text =
    { ...PROPOSAL_TEXT[locale], netProposalValue: locale === "ar" ? "صافي القيمة" : "Net value", totalProposalValue: locale === "ar" ? "إجمالي القيمة" : "Total value" };

  const align =
    proposalAlignment(locale);
const left = 38;

  const width =
    doc.page.width - 76;

  const hasDiscount =
    quote.totals.discountAmount >
    0;

  const hasTax =
    quote.totals.taxAmount >
    0;

  const rows = hasDiscount
    ? [
        {
          label:
            text.valueBeforeDiscount,

          value:
            formatProposalMoney(
              quote.totals.subtotal,
              quote.currencyCode,
            ),

          strong:
            false,
        },

        {
          label:
            text.commercialDiscount +
            (
              quote.discount?.type ===
              "PERCENTAGE"
                ? " (" +
                  quote.discount.value
                    .toFixed(2)
                    .replace(
                      /\.00$/,
                      "",
                    ) +
                  "%)"
                : ""
            ),

          value:
            "- " +
            formatProposalMoney(
              quote.totals
                .discountAmount,
              quote.currencyCode,
            ),

          strong:
            false,
        },

        ...(hasTax
          ? [{
              label: text.tax,
              value: formatProposalMoney(
                quote.totals.taxAmount,
                quote.currencyCode,
              ),
              strong: false,
            }]
          : []),

        {
          label:
            text.netProposalValue,

          value:
            formatProposalMoney(
              quote.totals
                .totalAmount,
              quote.currencyCode,
            ),

          strong:
            true,
        },
      ]
    : hasTax
      ? [
          {
            label: text.valueBeforeDiscount,
            value: formatProposalMoney(
              quote.totals.subtotal,
              quote.currencyCode,
            ),
            strong: false,
          },
          {
            label: text.tax,
            value: formatProposalMoney(
              quote.totals.taxAmount,
              quote.currencyCode,
            ),
            strong: false,
          },
          {
            label: text.totalProposalValue,
            value: formatProposalMoney(
              quote.totals.totalAmount,
              quote.currencyCode,
            ),
            strong: true,
          },
        ]
      : [
        {
          label:
            text.totalProposalValue,

          value:
            formatProposalMoney(
              quote.totals
                .totalAmount,
              quote.currencyCode,
            ),

          strong:
            true,
        },
        ];

  const rowHeight =
    22;

  const cardHeight =
    rows.length *
      rowHeight +
    4;

  drawProposalCard(
    doc,
    left,
    y,
    width,
    cardHeight,
    PROPOSAL_COLOR.white,
  );

  let currentY =
    y + 2;

  rows.forEach(
    (
      row,
      index,
    ) => {
      if (row.strong) {
        doc
          .rect(
            left + 1,
            currentY,
            width - 2,
            rowHeight,
          )
          .fill(
            brand.softStrong,
          );
      }

      if (index > 0) {
        doc
          .moveTo(
            left + 8,
            currentY,
          )
          .lineTo(
            left + width - 8,
            currentY,
          )
          .lineWidth(0.35)
          .strokeColor(
            PROPOSAL_COLOR.line,
          )
          .stroke();
      }

      doc
        .fillColor(
          row.strong
            ? brand.primary
            : PROPOSAL_COLOR.slate,
        )
        .fontSize(
          row.strong ? LABEL.strongTotal : LABEL.total,
        )
        .font(LABEL.font)
        .text(
          row.label,
          left + 10,
          currentY + 6,
          proposalTextOptions(
            align,
            width * 0.58,
          ),
        );

      doc
        .font("VOKA")
        .fillColor(
          row.strong
            ? brand.primary
            : PROPOSAL_COLOR.navy,
        )
        .fontSize(
          row.strong ? 9 : 7.5,
        )
        .text(
          row.value,
          left + width * 0.61,
          currentY + 6,
          proposalTextOptions(
            "right",
            width * 0.35,
          ),
        );

      currentY +=
        rowHeight;
    },
  );

  return y + cardHeight;
}


function drawCommercialBoq(doc: ProposalPdfDocument, snapshot: ProposalSnapshot, title: string): boolean[] {
  const letterheadFlags: boolean[] = [];
  const startPage = () => {
    const hasLetterhead = drawProposalLetterhead(doc, snapshot);
    letterheadFlags.push(hasLetterhead);
    return hasLetterhead;
  };

  doc.addPage();
  let hasLetterhead = startPage();
  const quote = snapshot.quotation;
  const locale = snapshot.locale;
  const brand = proposalBrand(snapshot);
  const text = PROPOSAL_TEXT[locale];
  const align = proposalAlignment(locale);
  const left = 38;
  const totalWidth = doc.page.width - 76;
  let y = drawCommercialHeader(doc, snapshot, title, hasLetterhead);
  y = drawCommercialSubject(doc, snapshot, y, title);

  drawProposalCard(doc, left, y, totalWidth, 58);
  const metaWidth = totalWidth / 4;
  drawCompactField(doc, text.reference, quote.number, left + 9, y + 9, metaWidth - 18, align);
  drawCompactField(doc, text.customer, quote.customer.name, left + metaWidth + 9, y + 9, metaWidth - 18, align);
  drawCompactField(
    doc,
    text.project,
    (locale === "ar" ? quote.projectNameAr || quote.projectName : quote.projectNameEn || quote.projectName) || "-",
    left + metaWidth * 2 + 9,
    y + 9,
    metaWidth - 18,
    align,
  );
  drawCompactField(doc, text.scope, proposalScopeLabel(quote.scopeType, locale), left + metaWidth * 3 + 9, y + 9, metaWidth - 18, align);
  y += 68;

  const columns = [
    { width: totalWidth * 0.4, align },
    { width: totalWidth * 0.11, align: "center" as const },
    { width: totalWidth * 0.1, align: "right" as const },
    { width: totalWidth * 0.17, align: "right" as const },
    { width: totalWidth * 0.1, align: "right" as const },
    { width: totalWidth * 0.12, align: "right" as const },
  ];
  const positions = columnPositions(locale, left, totalWidth, columns);
  const headers = [text.item, text.unit, text.quantity, text.unitPrice, text.tax, text.total];

  const drawTableHead = () => {
    doc.rect(left, y, totalWidth, 24).fill(brand.softStrong);
    headers.forEach((header, index) => {
      doc.font(LABEL.font).fillColor(PROPOSAL_COLOR.navy).fontSize(LABEL.table).text(header, positions[index] + 4, y + 5, proposalTextOptions(columns[index].align, columns[index].width - 8)).font("VOKA");
    });
    y += 24;
  };
  drawTableHead();

  const { fontSize: itemFontSize, padding } = COMMERCIAL_ROW_STYLE;
  const pageBottom = () => doc.page.height - (hasLetterhead ? LETTERHEAD_SAFE_AREA.bottom + 24 : 80);
  const continueTable = () => {
    doc.addPage();
    hasLetterhead = startPage();
    y = drawCommercialHeader(doc, snapshot, title, hasLetterhead);
    drawTableHead();
  };

  quote.lines.forEach((line, rowIndex) => {
    const values = [
      proposalBoqItemText(line, locale),
      commercialUnitLabel(line, locale === "ar") || "-",
      String(line.quantity),
      formatProposalMoney(line.unitPrice, quote.currencyCode),
      formatProposalMoney(line.taxAmount, quote.currencyCode),
      formatProposalMoney(line.totalAmount, quote.currencyCode),
    ];
    doc.font("VOKA").fontSize(itemFontSize);
    const lineHeight = doc.currentLineHeight(true);
    const insets = columns.map((_, index) => index === 0 ? padding : locale === "en" ? 6 : 3);
    const wrapped = values.map((value, index) => wrapCommercialText(doc, value, columns[index].width - insets[index] * 2));
    const count = Math.max(...wrapped.map((cell) => cell.length));
    const height = commercialRowHeight(count, lineHeight);
    // Keep ordinary rows together; oversized rows continue in bounded fragments.
    const freshTableY = (hasLetterhead ? LETTERHEAD_SAFE_AREA.top + 38 : 146) + 24;
    if (y + height > pageBottom() && height <= pageBottom() - freshTableY) continueTable();
    let offset = 0;
    while (offset < count) {
      const capacity = Math.floor((pageBottom() - y - padding * 2) / lineHeight);
      if (capacity < 1 || pageBottom() - y < COMMERCIAL_ROW_STYLE.minHeight) { continueTable(); continue; }
      const fragmentLines = Math.min(count - offset, capacity);
      const rowHeight = commercialRowHeight(fragmentLines, lineHeight);
      if (rowIndex % 2 === 1) doc.rect(left, y, totalWidth, rowHeight).fill("#fbfdff");
      wrapped.forEach((cell, columnIndex) => {
        cell.slice(offset, offset + fragmentLines).forEach((value, lineIndex) => {
          doc.font("VOKA").fillColor(PROPOSAL_COLOR.navy).fontSize(itemFontSize).text(
            value, positions[columnIndex] + insets[columnIndex], y + padding + lineIndex * lineHeight,
            { ...proposalTextOptions(columns[columnIndex].align, columns[columnIndex].width - insets[columnIndex] * 2), lineBreak: false, ellipsis: false },
          );
        });
      });
      doc.moveTo(left, y + rowHeight).lineTo(left + totalWidth, y + rowHeight).lineWidth(0.35).strokeColor(PROPOSAL_COLOR.line).stroke();
      y += rowHeight;
      offset += fragmentLines;
      if (offset < count) continueTable();
    }
  });

  y += 8;
  const totalRows = quote.totals.discountAmount > 0 ? 3 + Number(quote.totals.taxAmount > 0) : quote.totals.taxAmount > 0 ? 3 : 1;
  const approvalHeight = snapshot.quotation.status === "APPROVED" && snapshot.quotation.approvedAt ? 112 : 0;
  if (y + totalRows * 22 + 4 + 36 + approvalHeight > pageBottom()) {
    doc.addPage();
    hasLetterhead = startPage();
    y = drawCommercialHeader(doc, snapshot, title, hasLetterhead);
  }
  y = drawCommercialTotals(doc, snapshot, y) + 8;
  doc.fillColor(PROPOSAL_COLOR.muted).fontSize(6.2).text(locale === "ar" ? "هذه الصفحة جزء لا يتجزأ من المستند." : "This page forms an integral part of the document.", left + 14, y + 5, proposalTextOptions("center", totalWidth - 28, 12));
  y += 28;
  if (snapshot.quotation.status === "APPROVED" && snapshot.quotation.approvedAt) {
    drawProposalCompanyApproval(doc, snapshot, y, 112, null);
  }
  return letterheadFlags;
}

function decoratePages(doc: ProposalPdfDocument, snapshot: ProposalSnapshot, letterheadPages: readonly boolean[]): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    if (letterheadPages[index]) {
      doc.fillColor(PROPOSAL_COLOR.muted).fontSize(5.8).text(
        `${snapshot.quotation.number} · ${String(index + 1)} / ${String(range.count)}`,
        38,
        pageHeight - LETTERHEAD_SAFE_AREA.bottom - LETTERHEAD_SAFE_AREA.traceOffset,
        { width: pageWidth - 76, align: "center", lineBreak: false },
      );
      continue;
    }
    const left = 38;
    const width = pageWidth - 76;
    const lineY = pageHeight - 72;
    const textY = pageHeight - 63;
    doc.save();
    doc.moveTo(left, lineY).lineTo(left + width, lineY).lineWidth(0.35).strokeColor(PROPOSAL_COLOR.line).stroke();
    doc.fillColor(PROPOSAL_COLOR.muted).fontSize(5.8).text(
      snapshot.company.name + " — " + snapshot.quotation.number,
      left,
      textY,
      { width: 210, align: "left", lineBreak: false },
    );
    doc.fillColor(PROPOSAL_COLOR.muted).fontSize(5.8).text(
      String(index + 1) + " / " + String(range.count),
      pageWidth / 2 - 30,
      textY,
      { width: 60, align: "center", lineBreak: false },
    );
    doc.restore();
  }
}

export async function renderCommercialProposalPdf(snapshot: ProposalSnapshot, kind: CommercialPdfKind): Promise<Buffer> {
  const title = commercialDocumentTitle(kind, snapshot.locale);
  const doc = new PDFDocument({
    size: "A4",
    margins: { ...COMMERCIAL_PDF_MARGINS },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `${title} ${snapshot.quotation.number}`,
      Author: snapshot.company.name,
      Subject: snapshot.locale === "ar" ? snapshot.quotation.subjectAr || title : snapshot.quotation.subjectEn || title,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("VOKA", path.join(process.cwd(), "assets", "fonts", "Cairo-Variable.ttf")).font("VOKA");
  doc.registerFont(LABEL.font, path.join(process.cwd(), "assets", "fonts", "Cairo-SemiBold.ttf"));
  // Mixed Arabic fallback content also needs bidi runs in an English document.
  configureProposalTextDirection(doc, "ar");
  const coverLetterhead = drawCommercialCover(doc, snapshot, title);
  const boqLetterheads = drawCommercialBoq(doc, snapshot, title);
  decoratePages(doc, snapshot, [coverLetterhead, ...boqLetterheads]);
  doc.end();
  return completed;
}

export function commercialSnapshotFromParts(input: {
  kind: CommercialPdfKind;
  locale: "ar" | "en";
  company: QuotationDocumentSnapshot["company"];
  number: string;
  status: string;
  issueDate: Date;
  dueDate?: Date | null;
  currencyCode: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerTaxNo?: string | null;
  billingAddress?: string | null;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  projectName?: string | null;
  projectNameAr?: string | null;
  projectNameEn?: string | null;
  attentionName?: string | null;
  attentionNameAr?: string | null;
  attentionNameEn?: string | null;
  scopeType?: string | null;
  lines: QuotationDocumentSnapshot["quotation"]["lines"];
  discountType?: "FIXED" | "PERCENTAGE" | null;
  discountValue?: number;
  totals: { subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number };
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
  terms?: string | null;
  termsAr?: string | null;
  termsEn?: string | null;
}): ProposalSnapshot {
  const titleAr = commercialDocumentTitle(input.kind, "ar");
  const titleEn = commercialDocumentTitle(input.kind, "en");
  return {
    locale: input.locale,
    company: input.company,
    quotation: {
      number: input.number,
      revisionNumber: 0,
      status: input.status,
      issueDate: input.issueDate,
      expiryDate: input.dueDate ?? null,
      currencyCode: input.currencyCode,
      subjectAr: input.subjectAr || titleAr,
      subjectEn: input.subjectEn || titleEn,
      briefAr: input.briefAr ?? null,
      briefEn: input.briefEn ?? null,
      projectName: input.projectName ?? null,
      projectNameAr: input.projectNameAr ?? null,
      projectNameEn: input.projectNameEn ?? null,
      attentionName: input.attentionName ?? null,
      attentionNameAr: input.attentionNameAr ?? null,
      attentionNameEn: input.attentionNameEn ?? null,
      scopeType: input.scopeType ?? null,
      customer: {
        name: input.customerName,
        email: input.customerEmail ?? null,
        phone: input.customerPhone ?? null,
        taxNumber: input.customerTaxNo ?? null,
        billingAddress: input.billingAddress ?? null,
      },
      lines: input.lines,
      discount: input.discountType ? { type: input.discountType, value: input.discountValue ?? 0 } : null,
      totals: input.totals,
      notes: input.notes ?? null,
      notesAr: input.notesAr ?? null,
      notesEn: input.notesEn ?? null,
      termsAndConditions: input.terms ?? null,
      termsAndConditionsAr: input.termsAr ?? null,
      termsAndConditionsEn: input.termsEn ?? null,
      approvedAt: null,
      approvedByName: null,
      approvedByRole: null,
    },
    qrValue: "",
  };
}

export { displayLabel };
