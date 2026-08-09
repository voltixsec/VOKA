import {
  PROPOSAL_COLOR,
  PROPOSAL_TEXT,
  drawProposalCard,

  drawProposalHeader,
  drawProposalSubject,
  formatProposalDate,
  formatProposalMoney,

  proposalAlignment,
  proposalBrand,
  proposalScopeLabel,
  proposalTextOptions,
  type ProposalPdfDocument,
  type ProposalSnapshot,
} from "./ProposalPdfShared";

function drawField(
  doc: ProposalPdfDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right",
): void {
  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(7)
    .text(
      label,
      x,
      y,
      proposalTextOptions(
        align,
        width,
      ),
    );

  doc
    .fillColor(
      PROPOSAL_COLOR.navy,
    )
    .fontSize(9)
    .text(
      value || "-",
      x,
      y + 15,
      proposalTextOptions(
        align,
        width,
        27,
      ),
    );
}

function drawCoverCommercialSummary(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
): number {
  const locale =
    snapshot.locale;

  const quote =
    snapshot.quotation;

  const brand =
    proposalBrand(
      snapshot,
    );

  const left = 38;

  const width =
    doc.page.width - 76;

  const align =
    locale === "ar"
      ? "right"
      : "left";

  const notes =
    locale === "ar"
      ? quote.notesAr ||
        quote.notes ||
        null
      : quote.notesEn ||
        quote.notes ||
        null;

  const terms =
    locale === "ar"
      ? quote.termsAndConditionsAr ||
        quote.termsAndConditions ||
        null
      : quote.termsAndConditionsEn ||
        quote.termsAndConditions ||
        null;

  const notesLabel =
    locale === "ar"
      ? "ملاحظات"
      : "Notes";

  const termsLabel =
    locale === "ar"
      ? "الشروط والأحكام"
      : "Terms and conditions";

  const netLabel =
    locale === "ar"
      ? "صافي قيمة عرض السعر"
      : "Net proposal value";

  let currentY =
    y;

  if (notes) {
    const notesHeight =
      68;

    drawProposalCard(
      doc,
      left,
      currentY,
      width,
      notesHeight,
      brand.soft,
    );

    doc
      .fillColor(
        brand.primary,
      )
      .fontSize(8)
      .text(
        notesLabel,
        left + 14,
        currentY + 10,
        proposalTextOptions(
          align,
          width - 28,
          14,
        ),
      );

    doc
      .fillColor(
        PROPOSAL_COLOR.slate,
      )
      .fontSize(8)
      .text(
        notes,
        left + 14,
        currentY + 29,
        proposalTextOptions(
          align,
          width - 28,
          30,
        ),
      );

    currentY +=
      notesHeight + 10;
  }

  if (terms) {
    const termsHeight =
      86;

    drawProposalCard(
      doc,
      left,
      currentY,
      width,
      termsHeight,
      PROPOSAL_COLOR.pale,
    );

    doc
      .fillColor(
        brand.primary,
      )
      .fontSize(8)
      .text(
        termsLabel,
        left + 14,
        currentY + 10,
        proposalTextOptions(
          align,
          width - 28,
          14,
        ),
      );

    doc
      .fillColor(
        PROPOSAL_COLOR.slate,
      )
      .fontSize(8)
      .text(
        terms,
        left + 14,
        currentY + 29,
        proposalTextOptions(
          align,
          width - 28,
          48,
        ),
      );

    currentY +=
      termsHeight + 12;
  }

  /*
   * Page 1 shows ONLY final net value.
   * No subtotal / discount breakdown here.
   */
  const valueHeight =
    58;

  doc
    .roundedRect(
      left,
      currentY,
      width,
      valueHeight,
      8,
    )
    .fill(
      brand.primary,
    );

  doc
    .fillColor(
      brand.textOnPrimary,
    )
    .fontSize(8)
    .text(
      netLabel,
      left + 16,
      currentY + 10,
      proposalTextOptions(
        locale === "ar"
          ? "right"
          : "left",
        width - 32,
        14,
      ),
    );

  doc
    .fillColor(
      brand.textOnPrimary,
    )
    .fontSize(15)
    .text(
      formatProposalMoney(
        quote.totals.totalAmount,
        quote.currencyCode,
      ),
      left + 16,
      currentY + 28,
      proposalTextOptions(
        locale === "ar"
          ? "left"
          : "right",
        width - 32,
        22,
      ),
    );

  return (
    currentY +
    valueHeight
  );
}

export function drawProposalCover(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
): void {
  const locale =
    snapshot.locale;

  const quote =
    snapshot.quotation;

  const text =
    PROPOSAL_TEXT[locale];

  const align =
    proposalAlignment(locale);

  const left = 38;

  const width =
    doc.page.width - 76;

  let y =
    drawProposalHeader(
      doc,
      snapshot,
    );

  y =
    drawProposalSubject(
      doc,
      snapshot,
      y,
    );

  /*
   * Main quotation information.
   */
  drawProposalCard(
    doc,
    left,
    y,
    width,
    116,
  );

  const gap = 14;

  const columnWidth =
    (width - gap * 2) / 3;

  drawField(
    doc,
    text.reference,
    quote.number,
    left + 12,
    y + 13,
    columnWidth - 18,
    align,
  );

  drawField(
    doc,
    text.issueDate,
    formatProposalDate(
      quote.issueDate,
    ),
    left +
      columnWidth +
      gap +
      6,
    y + 13,
    columnWidth - 18,
    align,
  );

  drawField(
    doc,
    text.expiryDate,
    formatProposalDate(
      quote.expiryDate,
    ),
    left +
      (columnWidth + gap) * 2,
    y + 13,
    columnWidth - 18,
    align,
  );

  drawField(
    doc,
    text.customer,
    quote.customer.name,
    left + 12,
    y + 65,
    columnWidth - 18,
    align,
  );

  drawField(
    doc,
    text.project,
    (
      locale === "ar"
        ? quote.projectNameAr ||
          quote.projectName
        : quote.projectNameEn ||
          quote.projectName
    ) || "-",
    left +
      columnWidth +
      gap +
      6,
    y + 65,
    columnWidth - 18,
    align,
  );

  drawField(
    doc,
    text.attention,
    (
      locale === "ar"
        ? quote.attentionNameAr ||
          quote.attentionName
        : quote.attentionNameEn ||
          quote.attentionName
    ) || "-",
    left +
      (columnWidth + gap) * 2,
    y + 65,
    columnWidth - 18,
    align,
  );

  y += 128;

  /*
   * Scope and proposal brief.
   */
  drawProposalCard(
    doc,
    left,
    y,
    width,
    132,
  );

  drawField(
    doc,
    text.scope,
    proposalScopeLabel(
      quote.scopeType,
      locale,
    ),
    left + 14,
    y + 13,
    width - 28,
    align,
  );

  doc
    .moveTo(
      left + 14,
      y + 56,
    )
    .lineTo(
      left + width - 14,
      y + 56,
    )
    .lineWidth(0.4)
    .strokeColor(
      PROPOSAL_COLOR.line,
    )
    .stroke();

  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(10.5)
    .text(
      text.brief,
      left + 14,
      y + 67,
      proposalTextOptions(
        align,
        width - 28,
      ),
    );

  const brief =
    locale === "ar"
      ? quote.briefAr
      : quote.briefEn;

  doc
    .fillColor(
      PROPOSAL_COLOR.navy,
    )
    .fontSize(10.5)
    .text(
      brief || "-",
      left + 14,
      y + 87,
      proposalTextOptions(
        align,
        width - 28,
        34,
      ),
    );

  y += 144;

    y += 14;

  drawCoverCommercialSummary(
    doc,
    snapshot,
    y,
  );
}
