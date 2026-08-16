import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import type {
  ISalesOrderDocumentRenderer,
  SalesOrderDocumentSnapshot,
} from "@/src/application/document";

import {
  PROPOSAL_COLOR,
  LETTERHEAD_SAFE_AREA,
  configureProposalTextDirection,
  proposalBrand,
  proposalTextOptions,
  formatProposalDate,
  formatProposalMoney,
  proposalScopeLabel,
  proposalAlignment,
  drawProposalCard,
  drawProposalHeader,
  drawProposalLetterhead,
  drawProposalSubject,
  type ProposalPdfDocument,
} from "./ProposalPdfShared";
import { columnPositions } from "./ProposalPdfBoq";

function drawSalesOrderFooter(
  doc: ProposalPdfDocument,
  snapshot: SalesOrderDocumentSnapshot,
  pageNumber: number,
  pageCount: number,
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = 38;
  const width = pageWidth - 76;

  const lineY = pageHeight - 72;
  const textY = pageHeight - 63;

  doc.save();

  doc
    .moveTo(left, lineY)
    .lineTo(left + width, lineY)
    .lineWidth(0.35)
    .strokeColor(PROPOSAL_COLOR.line)
    .stroke();

  doc
    .fillColor(PROPOSAL_COLOR.muted)
    .fontSize(5.8)
    .text(
      `${snapshot.company.name} — ${snapshot.salesOrder.number}`,
      left,
      textY,
      {
        width: 210,
        align: "left",
        lineBreak: false,
      },
    );

  doc
    .fillColor(PROPOSAL_COLOR.muted)
    .fontSize(5.8)
    .text(
      `${pageNumber} / ${pageCount}`,
      pageWidth / 2 - 30,
      textY,
      {
        width: 60,
        align: "center",
        lineBreak: false,
      },
    );

  doc.restore();
}

function decorateSalesOrderPages(
  doc: ProposalPdfDocument,
  snapshot: SalesOrderDocumentSnapshot,
  letterheadPages: readonly boolean[],
): void {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const letterheadMode = letterheadPages[index];

    if (letterheadMode) {
      doc
        .fillColor(PROPOSAL_COLOR.muted)
        .fontSize(5.8)
        .text(
          `${snapshot.salesOrder.number} · ${index + 1} / ${range.count}`,
          38,
          doc.page.height - LETTERHEAD_SAFE_AREA.bottom - LETTERHEAD_SAFE_AREA.traceOffset,
          { width: doc.page.width - 76, align: "center", lineBreak: false },
        );
    } else {
      drawSalesOrderFooter(doc, snapshot, index + 1, range.count);
    }
  }
}

function drawSalesOrderCompactField(
  doc: ProposalPdfDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right",
): void {
  doc
    .fillColor(PROPOSAL_COLOR.muted)
    .fontSize(6.5)
    .text(label, x, y, proposalTextOptions(align, width));

  doc
    .fillColor(PROPOSAL_COLOR.navy)
    .fontSize(8)
    .text(value || "-", x, y + 14, proposalTextOptions(align, width, 20));
}

function drawSalesOrderAuditSection(
  doc: ProposalPdfDocument,
  snapshot: SalesOrderDocumentSnapshot,
  y: number,
): number {
  const locale = snapshot.locale;
  const order = snapshot.salesOrder;
  const left = 38;
  const width = doc.page.width - 76;
  const align = proposalAlignment(locale);

  const entries: Array<{ label: string; text: string }> = [];

  const sourceApp = locale === "ar" ? "اعتماد عرض السعر المصدر" : "Source Quotation Approval";
  entries.push({
    label: sourceApp,
    text: `${order.sourceApproval.approvedByName} (${order.sourceApproval.approvedByRole}) · ${formatProposalDate(order.sourceApproval.approvedAt)}`,
  });

  const creation = locale === "ar" ? "إنشاء أمر البيع" : "Sales Order Created";
  entries.push({
    label: creation,
    text: `${order.creator.name} (${order.creator.role}) · ${formatProposalDate(order.createdAt)}`,
  });

  if (order.confirmation) {
    const confirmation = locale === "ar" ? "تأكيد أمر البيع" : "Sales Order Confirmed";
    entries.push({
      label: confirmation,
      text: `${order.confirmation.confirmedByName} (${order.confirmation.confirmedByRole}) · ${formatProposalDate(order.confirmation.confirmedAt)}`,
    });
  }

  if (order.cancellation) {
    const cancellation = locale === "ar" ? "إلغاء أمر البيع" : "Sales Order Cancelled";
    const reasonLabel = locale === "ar" ? "السبب" : "Reason";
    entries.push({
      label: cancellation,
      text: `${order.cancellation.cancelledByName} (${order.cancellation.cancelledByRole}) · ${formatProposalDate(order.cancellation.cancelledAt)}\n${reasonLabel}: ${order.cancellation.reason}`,
    });
  }

  const boxHeight = 24 + entries.length * 28;

  drawProposalCard(
    doc,
    left,
    y,
    width,
    boxHeight,
    order.status === "CANCELLED"
      ? PROPOSAL_COLOR.paleAmber
      : order.status === "CONFIRMED"
        ? PROPOSAL_COLOR.paleGreen
        : PROPOSAL_COLOR.pale,
  );

  let currentY = y + 10;
  entries.forEach((entry) => {
    doc
      .fillColor(PROPOSAL_COLOR.muted)
      .fontSize(7)
      .text(entry.label, left + 12, currentY, proposalTextOptions(align, width - 24));

    doc
      .fillColor(
        order.status === "CANCELLED" && entry.label.includes("إلغاء")
          ? PROPOSAL_COLOR.amber
          : PROPOSAL_COLOR.navy,
      )
      .fontSize(8)
      .text(entry.text, left + 12, currentY + 11, proposalTextOptions(align, width - 24, 22));

    currentY += 28;
  });

  return y + boxHeight;
}

export class PdfKitSalesOrderDocumentRenderer
  implements ISalesOrderDocumentRenderer {
  async render(snapshot: SalesOrderDocumentSnapshot): Promise<Uint8Array> {
    const fontPath = path.join(
      process.cwd(),
      "assets",
      "fonts",
      "Cairo-Variable.ttf",
    );

    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 32,
        right: 38,
        bottom: 48,
        left: 38,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title:
          (snapshot.locale === "ar" ? "أمر بيع " : "Sales Order ") +
          snapshot.salesOrder.number,
        Author: snapshot.company.name,
        Subject:
          snapshot.locale === "ar"
            ? snapshot.salesOrder.subjectAr || "أمر بيع"
            : snapshot.salesOrder.subjectEn || "Sales Order",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    const completed = new Promise<Uint8Array>((resolve, reject) => {
      doc.on("end", () => {
        resolve(new Uint8Array(Buffer.concat(chunks)));
      });
      doc.on("error", reject);
    });

    doc.registerFont("VOKA", fontPath).font("VOKA");
    configureProposalTextDirection(doc, snapshot.locale);

    const isAr = snapshot.locale === "ar";
    const brand = proposalBrand({
      locale: snapshot.locale,
      company: snapshot.company,
      quotation: {
        number: snapshot.salesOrder.number,
        status: snapshot.salesOrder.status,
        issueDate: snapshot.salesOrder.orderDate,
        expiryDate: null,
        currencyCode: snapshot.salesOrder.currencyCode,
        subjectAr: snapshot.salesOrder.subjectAr,
        subjectEn: snapshot.salesOrder.subjectEn,
        briefAr: snapshot.salesOrder.briefAr,
        briefEn: snapshot.salesOrder.briefEn,
        projectName: snapshot.salesOrder.projectName,
        projectNameAr: snapshot.salesOrder.projectNameAr,
        projectNameEn: snapshot.salesOrder.projectNameEn,
        attentionName: snapshot.salesOrder.attentionName,
        attentionNameAr: snapshot.salesOrder.attentionNameAr,
        attentionNameEn: snapshot.salesOrder.attentionNameEn,
        scopeType: snapshot.salesOrder.scopeType,
        customer: snapshot.salesOrder.customer,
        lines: [],
        discount: null,
        totals: snapshot.salesOrder.totals,
        notes: snapshot.salesOrder.notes,
        notesAr: snapshot.salesOrder.notesAr,
        notesEn: snapshot.salesOrder.notesEn,
        termsAndConditions: snapshot.salesOrder.termsAndConditions,
        termsAndConditionsAr: snapshot.salesOrder.termsAndConditionsAr,
        termsAndConditionsEn: snapshot.salesOrder.termsAndConditionsEn,
        approvedAt: snapshot.salesOrder.sourceApproval.approvedAt,
        approvedByName: snapshot.salesOrder.sourceApproval.approvedByName,
        approvedByRole: snapshot.salesOrder.sourceApproval.approvedByRole,
      },
      qrValue: snapshot.qrValue,
    });

    const hasLetterheadCover = drawProposalLetterhead(doc, {
      locale: snapshot.locale,
      company: snapshot.company,
      quotation: {
        number: snapshot.salesOrder.number,
        status: snapshot.salesOrder.status,
        issueDate: snapshot.salesOrder.orderDate,
        expiryDate: null,
        currencyCode: snapshot.salesOrder.currencyCode,
        subjectAr: snapshot.salesOrder.subjectAr,
        subjectEn: snapshot.salesOrder.subjectEn,
        briefAr: snapshot.salesOrder.briefAr,
        briefEn: snapshot.salesOrder.briefEn,
        projectName: snapshot.salesOrder.projectName,
        projectNameAr: snapshot.salesOrder.projectNameAr,
        projectNameEn: snapshot.salesOrder.projectNameEn,
        attentionName: snapshot.salesOrder.attentionName,
        attentionNameAr: snapshot.salesOrder.attentionNameAr,
        attentionNameEn: snapshot.salesOrder.attentionNameEn,
        scopeType: snapshot.salesOrder.scopeType,
        customer: snapshot.salesOrder.customer,
        lines: [],
        discount: null,
        totals: snapshot.salesOrder.totals,
        notes: snapshot.salesOrder.notes,
        notesAr: snapshot.salesOrder.notesAr,
        notesEn: snapshot.salesOrder.notesEn,
        termsAndConditions: snapshot.salesOrder.termsAndConditions,
        termsAndConditionsAr: snapshot.salesOrder.termsAndConditionsAr,
        termsAndConditionsEn: snapshot.salesOrder.termsAndConditionsEn,
        approvedAt: snapshot.salesOrder.sourceApproval.approvedAt,
        approvedByName: snapshot.salesOrder.sourceApproval.approvedByName,
        approvedByRole: snapshot.salesOrder.sourceApproval.approvedByRole,
      },
      qrValue: snapshot.qrValue,
    });

    const letterheadPages: boolean[] = [hasLetterheadCover];

    const left = 38;
    const width = doc.page.width - 76;
    const align = proposalAlignment(snapshot.locale);
    const pageMaxY = doc.page.height - 80;

    const addNewPage = (): number => {
      doc.addPage();
      if (hasLetterheadCover) {
        drawProposalLetterhead(doc, {
          locale: snapshot.locale,
          company: snapshot.company,
          quotation: {
            number: snapshot.salesOrder.number,
            status: snapshot.salesOrder.status,
            issueDate: snapshot.salesOrder.orderDate,
            expiryDate: null,
            currencyCode: snapshot.salesOrder.currencyCode,
            subjectAr: snapshot.salesOrder.subjectAr,
            subjectEn: snapshot.salesOrder.subjectEn,
            briefAr: snapshot.salesOrder.briefAr,
            briefEn: snapshot.salesOrder.briefEn,
            projectName: snapshot.salesOrder.projectName,
            projectNameAr: snapshot.salesOrder.projectNameAr,
            projectNameEn: snapshot.salesOrder.projectNameEn,
            attentionName: snapshot.salesOrder.attentionName,
            attentionNameAr: snapshot.salesOrder.attentionNameAr,
            attentionNameEn: snapshot.salesOrder.attentionNameEn,
            scopeType: snapshot.salesOrder.scopeType,
            customer: snapshot.salesOrder.customer,
            lines: [],
            discount: null,
            totals: snapshot.salesOrder.totals,
            notes: snapshot.salesOrder.notes,
            notesAr: snapshot.salesOrder.notesAr,
            notesEn: snapshot.salesOrder.notesEn,
            termsAndConditions: snapshot.salesOrder.termsAndConditions,
            termsAndConditionsAr: snapshot.salesOrder.termsAndConditionsAr,
            termsAndConditionsEn: snapshot.salesOrder.termsAndConditionsEn,
            approvedAt: snapshot.salesOrder.sourceApproval.approvedAt,
            approvedByName: snapshot.salesOrder.sourceApproval.approvedByName,
            approvedByRole: snapshot.salesOrder.sourceApproval.approvedByRole,
          },
          qrValue: snapshot.qrValue,
        });
        letterheadPages.push(true);
      } else {
        letterheadPages.push(false);
      }
      doc.font("VOKA");
      configureProposalTextDirection(doc, snapshot.locale);
      return hasLetterheadCover ? LETTERHEAD_SAFE_AREA.top + 20 : 40;
    };

    let y = drawProposalHeader(
      doc,
      {
        locale: snapshot.locale,
        company: snapshot.company,
        quotation: {
          number: snapshot.salesOrder.number,
          status: snapshot.salesOrder.status,
          issueDate: snapshot.salesOrder.orderDate,
          expiryDate: null,
          currencyCode: snapshot.salesOrder.currencyCode,
          subjectAr: snapshot.salesOrder.subjectAr,
          subjectEn: snapshot.salesOrder.subjectEn,
          briefAr: snapshot.salesOrder.briefAr,
          briefEn: snapshot.salesOrder.briefEn,
          projectName: snapshot.salesOrder.projectName,
          projectNameAr: snapshot.salesOrder.projectNameAr,
          projectNameEn: snapshot.salesOrder.projectNameEn,
          attentionName: snapshot.salesOrder.attentionName,
          attentionNameAr: snapshot.salesOrder.attentionNameAr,
          attentionNameEn: snapshot.salesOrder.attentionNameEn,
          scopeType: snapshot.salesOrder.scopeType,
          customer: snapshot.salesOrder.customer,
          lines: [],
          discount: null,
          totals: snapshot.salesOrder.totals,
          notes: snapshot.salesOrder.notes,
          notesAr: snapshot.salesOrder.notesAr,
          notesEn: snapshot.salesOrder.notesEn,
          termsAndConditions: snapshot.salesOrder.termsAndConditions,
          termsAndConditionsAr: snapshot.salesOrder.termsAndConditionsAr,
          termsAndConditionsEn: snapshot.salesOrder.termsAndConditionsEn,
          approvedAt: snapshot.salesOrder.sourceApproval.approvedAt,
          approvedByName: snapshot.salesOrder.sourceApproval.approvedByName,
          approvedByRole: snapshot.salesOrder.sourceApproval.approvedByRole,
        },
        qrValue: snapshot.qrValue,
      },
      hasLetterheadCover,
    );

    // Document Title Card with Status Badge
    drawProposalCard(doc, left, y, width, 40, brand.soft);
    const orderTitle = isAr
      ? `أمر بيع ${snapshot.salesOrder.number}`
      : `SALES ORDER ${snapshot.salesOrder.number}`;
    doc
      .fillColor(brand.primary)
      .fontSize(14)
      .text(orderTitle, left + 12, y + 10, proposalTextOptions(align, width - 120, 20));

    const statusText =
      snapshot.salesOrder.status === "CONFIRMED"
        ? isAr ? "مؤكد" : "CONFIRMED"
        : snapshot.salesOrder.status === "CANCELLED"
          ? isAr ? "ملغى" : "CANCELLED"
          : isAr ? "مسودة" : "DRAFT";

    const badgeColor =
      snapshot.salesOrder.status === "CONFIRMED"
        ? PROPOSAL_COLOR.green
        : snapshot.salesOrder.status === "CANCELLED"
          ? PROPOSAL_COLOR.amber
          : PROPOSAL_COLOR.blue;

    doc
      .fillColor(badgeColor)
      .fontSize(10)
      .text(statusText, left + width - 110, y + 12, proposalTextOptions("center", 100, 16));

    y += 48;

    // Commercial & Source Details Card
    drawProposalCard(doc, left, y, width, 100);
    const gap = 12;
    const colWidth = (width - gap * 2) / 3;

    drawSalesOrderCompactField(
      doc,
      isAr ? "رقم أمر البيع" : "Sales Order No.",
      snapshot.salesOrder.number,
      left + 12,
      y + 10,
      colWidth - 16,
      align,
    );

    drawSalesOrderCompactField(
      doc,
      isAr ? "عرض السعر المصدر" : "Source Quotation",
      snapshot.salesOrder.sourceQuotationNumber,
      left + colWidth + gap + 6,
      y + 10,
      colWidth - 16,
      align,
    );

    drawSalesOrderCompactField(
      doc,
      isAr ? "تاريخ الأمر" : "Order Date",
      formatProposalDate(snapshot.salesOrder.orderDate),
      left + (colWidth + gap) * 2,
      y + 10,
      colWidth - 16,
      align,
    );

    drawSalesOrderCompactField(
      doc,
      isAr ? "العميل" : "Customer",
      snapshot.salesOrder.customer.name,
      left + 12,
      y + 52,
      colWidth - 16,
      align,
    );

    drawSalesOrderCompactField(
      doc,
      isAr ? "المشروع" : "Project",
      (isAr
        ? snapshot.salesOrder.projectNameAr || snapshot.salesOrder.projectName
        : snapshot.salesOrder.projectNameEn || snapshot.salesOrder.projectName) || "-",
      left + colWidth + gap + 6,
      y + 52,
      colWidth - 16,
      align,
    );

    drawSalesOrderCompactField(
      doc,
      isAr ? "البيان / النطاق" : "Scope",
      proposalScopeLabel(snapshot.salesOrder.scopeType, snapshot.locale),
      left + (colWidth + gap) * 2,
      y + 52,
      colWidth - 16,
      align,
    );

    y += 112;

    // Line items table
    const columns = [
      { width: width * 0.40, align },
      { width: width * 0.11, align: "center" as const },
      { width: width * 0.10, align: "right" as const },
      { width: width * 0.17, align: "right" as const },
      { width: width * 0.10, align: "right" as const },
      { width: width * 0.12, align: "right" as const },
    ];

    const positions = columnPositions(snapshot.locale, left, width, columns);
    const headers = isAr
      ? ["البند", "الوحدة", "الكمية", "سعر الوحدة", "الضريبة", "الإجمالي"]
      : ["Item", "Unit", "Quantity", "Unit Price", "Tax", "Total"];

    const drawTableHeader = (atY: number): number => {
      doc.rect(left, atY, width, 22).fill(brand.softStrong);
      headers.forEach((header, index) => {
        doc
          .fillColor(PROPOSAL_COLOR.navy)
          .fontSize(6.8)
          .text(header, positions[index] + 4, atY + 6, proposalTextOptions(columns[index].align, columns[index].width - 8, 12));
      });
      return atY + 22;
    };

    if (y + 22 > pageMaxY) {
      y = addNewPage();
    }
    y = drawTableHeader(y);

    const rowHeight = 18;
    snapshot.salesOrder.lines.forEach((line, rowIndex) => {
      if (y + rowHeight > pageMaxY) {
        y = addNewPage();
        y = drawTableHeader(y);
      }

      if (rowIndex % 2 === 1) {
        doc.rect(left, y, width, rowHeight).fill("#fbfdff");
      }

      const localizedName = isAr
        ? line.itemNameAr || line.itemName
        : line.itemNameEn || line.itemName;
      const lineText = `${line.position}. ${localizedName}`;

      doc
        .fillColor(PROPOSAL_COLOR.navy)
        .fontSize(6.5)
        .text(lineText, positions[0] + 4, y + 4, proposalTextOptions(align, columns[0].width - 8, 12));

      const localizedUnit = isAr
        ? line.unitNameAr || line.unitName
        : line.unitNameEn || line.unitName;

      const vals = [
        localizedUnit || "-",
        String(line.quantity),
        formatProposalMoney(line.unitPrice, snapshot.salesOrder.currencyCode),
        formatProposalMoney(line.taxAmount, snapshot.salesOrder.currencyCode),
        formatProposalMoney(line.totalAmount, snapshot.salesOrder.currencyCode),
      ];

      vals.forEach((val, valIdx) => {
        const cIdx = valIdx + 1;
        doc
          .fillColor(PROPOSAL_COLOR.navy)
          .fontSize(6.5)
          .text(val, positions[cIdx] + (snapshot.locale === "en" ? 6 : 3), y + 4, proposalTextOptions(columns[cIdx].align, columns[cIdx].width - (snapshot.locale === "en" ? 12 : 6), 12));
      });

      doc
        .moveTo(left, y + rowHeight)
        .lineTo(left + width, y + rowHeight)
        .lineWidth(0.35)
        .strokeColor(PROPOSAL_COLOR.line)
        .stroke();

      y += rowHeight;
    });

    y += 10;

    // Totals Box
    const totalsHeight = 36;
    if (y + totalsHeight > pageMaxY) {
      y = addNewPage();
    }
    drawProposalCard(doc, left, y, width, totalsHeight, PROPOSAL_COLOR.white);
    doc
      .fillColor(brand.primary)
      .fontSize(9)
      .text(
        isAr ? "إجمالي أمر البيع" : "Sales Order Total",
        left + 12,
        y + 10,
        proposalTextOptions(align, width * 0.5, 16),
      );

    doc
      .fillColor(brand.primary)
      .fontSize(11)
      .text(
        formatProposalMoney(snapshot.salesOrder.totals.totalAmount, snapshot.salesOrder.currencyCode),
        left + width * 0.5,
        y + 10,
        proposalTextOptions(isAr ? "left" : "right", width * 0.48, 16),
      );

    y += totalsHeight + 12;

    // Lifecycle Audit Box
    const auditEntriesCount = 2 + (snapshot.salesOrder.confirmation ? 1 : 0) + (snapshot.salesOrder.cancellation ? 1 : 0);
    const auditBoxHeight = 24 + auditEntriesCount * 28;
    if (y + auditBoxHeight > pageMaxY) {
      y = addNewPage();
    }
    y = drawSalesOrderAuditSection(doc, snapshot, y) + 10;

    decorateSalesOrderPages(doc, snapshot, letterheadPages);

    doc.end();

    return completed;
  }
}
