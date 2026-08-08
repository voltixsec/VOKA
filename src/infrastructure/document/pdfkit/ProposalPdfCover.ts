import {
  PROPOSAL_COLOR,
  PROPOSAL_TEXT,
  drawProposalCard,
  drawProposalCompanyApproval,
  drawProposalHeader,
  drawProposalSubject,
  formatProposalDate,
  formatProposalMoney,
  proposalAlignment,
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

function drawFinancialRow(
  doc: ProposalPdfDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  strong: boolean,
  align: "left" | "right",
): number {
  const height =
    strong ? 31 : 25;

  if (strong) {
    doc
      .rect(
        x,
        y,
        width,
        height,
      )
      .fill(
        PROPOSAL_COLOR.lightBlue,
      );
  }

  doc
    .fillColor(
      strong
        ? PROPOSAL_COLOR.blue
        : PROPOSAL_COLOR.slate,
    )
    .fontSize(
      strong ? 9 : 8,
    )
    .text(
      label,
      x + 10,
      y + 8,
      proposalTextOptions(
        align,
        width * 0.60,
      ),
    );

  doc
    .fillColor(
      strong
        ? PROPOSAL_COLOR.blue
        : PROPOSAL_COLOR.navy,
    )
    .fontSize(
      strong ? 10 : 8,
    )
    .text(
      value,
      x + width * 0.62,
      y + 8,
      proposalTextOptions(
        "right",
        width * 0.34,
      ),
    );

  doc
    .moveTo(
      x,
      y + height,
    )
    .lineTo(
      x + width,
      y + height,
    )
    .lineWidth(0.4)
    .strokeColor(
      PROPOSAL_COLOR.line,
    )
    .stroke();

  return y + height;
}

function drawFinancialSummary(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
): number {
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

  const hasDiscount =
    quote.totals.discountAmount >
    0;

  const height =
    hasDiscount ? 103 : 52;

  drawProposalCard(
    doc,
    left,
    y,
    width,
    height,
    PROPOSAL_COLOR.white,
  );

  let rowY = y;

  if (hasDiscount) {
    rowY =
      drawFinancialRow(
        doc,
        text.valueBeforeDiscount,
        formatProposalMoney(
          quote.totals.subtotal,
          quote.currencyCode,
        ),
        left,
        rowY,
        width,
        false,
        align,
      );

    let discountLabel =
      text.commercialDiscount;

    if (
      quote.discount?.type ===
      "PERCENTAGE"
    ) {
      const percentage =
        quote.discount.value
          .toFixed(2)
          .replace(
            /\.00$/,
            "",
          );

      discountLabel +=
        " (" +
        percentage +
        "%)";
    }

    rowY =
      drawFinancialRow(
        doc,
        discountLabel,
        "- " +
          formatProposalMoney(
            quote.totals
              .discountAmount,
            quote.currencyCode,
          ),
        left,
        rowY,
        width,
        false,
        align,
      );

    rowY =
      drawFinancialRow(
        doc,
        text.netProposalValue,
        formatProposalMoney(
          quote.totals
            .totalAmount,
          quote.currencyCode,
        ),
        left,
        rowY,
        width,
        true,
        align,
      );
  } else {
    rowY =
      drawFinancialRow(
        doc,
        text.totalProposalValue,
        formatProposalMoney(
          quote.totals
            .totalAmount,
          quote.currencyCode,
        ),
        left,
        rowY,
        width,
        true,
        align,
      );
  }

  return rowY;
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
    quote.projectName || "-",
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
    quote.attentionName || "-",
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
    .fontSize(7)
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
    .fontSize(9)
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

  /*
   * Quotation value.
   * No explanatory discount paragraph.
   */
  y =
    drawFinancialSummary(
      doc,
      snapshot,
      y,
    ) + 14;

  /*
   * Company approval only.
   * Customer acceptance has been removed.
   */
  drawProposalCompanyApproval(
    doc,
    snapshot,
    y,
    112,
  );
}
