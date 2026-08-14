import {
  PROPOSAL_COLOR,
  PROPOSAL_TEXT,
  drawProposalCard,
  drawProposalCompanyApproval,
  drawProposalHeader,
  drawProposalLetterhead,
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

type TableColumn = {
  width: number;
  align:
    | "left"
    | "right"
    | "center";
};

export function shouldRenderProposalApproval(
  snapshot: ProposalSnapshot,
): boolean {
  return (
    snapshot.quotation.status === "APPROVED" &&
    Boolean(snapshot.quotation.approvedAt)
  );
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
  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(6.5)
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
    .fontSize(8)
    .text(
      value || "-",
      x,
      y + 14,
      proposalTextOptions(
        align,
        width,
        20,
      ),
    );
}

export function columnPositions(
  locale: "ar" | "en",
  left: number,
  totalWidth: number,
  columns: TableColumn[],
): number[] {
  if (locale === "en") {
    let currentX = left;

    return columns.map(
      (column) => {
        const result =
          currentX;

        currentX +=
          column.width;

        return result;
      },
    );
  }

  let currentX =
    left + totalWidth;

  return columns.map(
    (column) => {
      currentX -=
        column.width;

      return currentX;
    },
  );
}

export function drawTotals(
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
    PROPOSAL_TEXT[locale];

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
          row.strong ? 8.5 : 7.5,
        )
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

function drawNotesAndTerms(
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
    PROPOSAL_TEXT[locale];

  const align =
    proposalAlignment(locale);

  const left = 38;

  const totalWidth =
    doc.page.width - 76;

  const gap = 10;

  const width =
    (totalWidth - gap) / 2;

  drawProposalCard(
    doc,
    left,
    y,
    width,
    68,
  );

  drawProposalCard(
    doc,
    left + width + gap,
    y,
    width,
    68,
  );

  doc
    .fillColor(
      brand.primary,
    )
    .fontSize(7.5)
    .text(
      text.notes,
      left + 10,
      y + 9,
      proposalTextOptions(
        align,
        width - 20,
      ),
    );

  doc
    .fillColor(
      PROPOSAL_COLOR.slate,
    )
    .fontSize(6.5)
    .text(
      (
        locale === "ar"
          ? quote.notesAr || quote.notes
          : quote.notesEn || quote.notes
      ) || "-",
      left + 10,
      y + 27,
      proposalTextOptions(
        align,
        width - 20,
        33,
      ),
    );

  doc
    .fillColor(
      brand.primary,
    )
    .fontSize(7.5)
    .text(
      text.terms,
      left + width + gap + 10,
      y + 9,
      proposalTextOptions(
        align,
        width - 20,
      ),
    );

  doc
    .fillColor(
      PROPOSAL_COLOR.slate,
    )
    .fontSize(6.5)
    .text(
      (
        locale === "ar"
          ? quote.termsAndConditionsAr ||
            quote.termsAndConditions
          : quote.termsAndConditionsEn ||
            quote.termsAndConditions
      ) || "-",
      left + width + gap + 10,
      y + 27,
      proposalTextOptions(
        align,
        width - 20,
        33,
      ),
    );

  return y + 68;
}

function drawApprovalStatement(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
): number {
  const locale =
    snapshot.locale;

  const text =
    PROPOSAL_TEXT[locale];

  const left = 38;

  const width =
    doc.page.width - 76;

  doc
    .fillColor(PROPOSAL_COLOR.muted)
    .fontSize(6.2)
    .text(
      text.continuation,
      left + 14,
      y + 5,
      proposalTextOptions("center", width - 28, 12),
    );

  return y + 20;
}

export function drawProposalBoq(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  verificationQr?: Buffer | null,
): boolean {
  doc.addPage();

  const hasLetterhead =
    drawProposalLetterhead(
      doc,
      snapshot,
    );

  const quote =
    snapshot.quotation;

  const locale =
    snapshot.locale;

  const brand =
    proposalBrand(
      snapshot,
    );

  const text =
    PROPOSAL_TEXT[locale];

  const align =
    proposalAlignment(locale);

  const left = 38;

  const totalWidth =
    doc.page.width - 76;

  let y =
    drawProposalHeader(
      doc,
      snapshot,
      hasLetterhead,
    );

  y =
    drawProposalSubject(
      doc,
      snapshot,
      y,
    );

  /*
   * Compact repetition of the main
   * quotation information.
   */
  drawProposalCard(
    doc,
    left,
    y,
    totalWidth,
    58,
  );

  const metaWidth =
    totalWidth / 4;

  drawCompactField(
    doc,
    text.reference,
    quote.number,
    left + 9,
    y + 9,
    metaWidth - 18,
    align,
  );

  drawCompactField(
    doc,
    text.customer,
    quote.customer.name,
    left + metaWidth + 9,
    y + 9,
    metaWidth - 18,
    align,
  );

  drawCompactField(
    doc,
    text.project,
    (
      locale === "ar"
        ? quote.projectNameAr ||
          quote.projectName
        : quote.projectNameEn ||
          quote.projectName
    ) || "-",
    left + metaWidth * 2 + 9,
    y + 9,
    metaWidth - 18,
    align,
  );

  drawCompactField(
    doc,
    text.scope,
    proposalScopeLabel(
      quote.scopeType,
      locale,
    ),
    left + metaWidth * 3 + 9,
    y + 9,
    metaWidth - 18,
    align,
  );

  y += 68;

  /*
   * Quotation items.
   * No "BOQ" or "table of quantities"
   * heading is displayed.
   */
  const columns:
    TableColumn[] = [
    {
      width:
        totalWidth * 0.40,

      align,
    },

    {
      width:
        totalWidth * 0.11,

      align:
        "center",
    },

    {
      width:
        totalWidth * 0.10,

      align:
        "right",
    },

    {
      width:
        totalWidth * 0.17,

      align:
        "right",
    },

    {
      width:
        totalWidth * 0.10,

      align:
        "right",
    },

    {
      width:
        totalWidth * 0.12,

      align:
        "right",
    },
  ];

  const positions =
    columnPositions(
      locale,
      left,
      totalWidth,
      columns,
    );

  const headers = [
    text.item,
    text.unit,
    text.quantity,
    text.unitPrice,
    text.tax,
    text.total,
  ];

  doc
    .rect(
      left,
      y,
      totalWidth,
      24,
    )
    .fill(
      brand.softStrong,
    );

  headers.forEach(
    (
      header,
      index,
    ) => {
      doc
        .fillColor(
          PROPOSAL_COLOR.navy,
        )
        .fontSize(6.8)
        .text(
          header,
          positions[index] + 4,
          y + 7,
          proposalTextOptions(
            columns[index].align,
            columns[index].width - 8,
            12,
          ),
        );
    },
  );

  y += 24;

  const lineCount =
    Math.max(
      quote.lines.length,
      1,
    );

  const availableRowsHeight =
    150;

  const rowHeight =
    Math.max(
      12,
      Math.min(
        30,
        availableRowsHeight /
          lineCount,
      ),
    );

  const itemFontSize =
    rowHeight >= 25
      ? 7.2
      : rowHeight >= 18
        ? 6.2
        : 5.2;

  quote.lines.forEach(
    (
      line,
      rowIndex,
    ) => {
      if (
        rowIndex % 2 === 1
      ) {
        doc
          .rect(
            left,
            y,
            totalWidth,
            rowHeight,
          )
          .fill("#fbfdff");
      }

      const localizedItemName =
        locale === "ar"
          ? line.itemNameAr || line.itemName
          : line.itemNameEn || line.itemName;

      const itemText =
        String(
          line.position,
        ) +
        ". " +
        localizedItemName;

      doc
        .fillColor(
          PROPOSAL_COLOR.navy,
        )
        .fontSize(
          itemFontSize,
        )
        .text(
          itemText,
          positions[0] + 4,
          y + 4,
          proposalTextOptions(
            align,
            columns[0].width - 8,
            Math.max(
              8,
              rowHeight - 7,
            ),
          ),
        );

      const localizedUnitName =
        locale === "ar"
          ? line.unitNameAr || line.unitName
          : line.unitNameEn || line.unitName;

      const values = [
        localizedUnitName || "-",
        String(line.quantity),

        formatProposalMoney(
          line.unitPrice,
          quote.currencyCode,
        ),

        formatProposalMoney(
          line.taxAmount,
          quote.currencyCode,
        ),

        formatProposalMoney(
          line.totalAmount,
          quote.currencyCode,
        ),
      ];

      values.forEach(
        (
          value,
          valueIndex,
        ) => {
          const columnIndex =
            valueIndex + 1;

          doc
            .fillColor(
              PROPOSAL_COLOR.navy,
            )
            .fontSize(
              itemFontSize,
            )
            .text(
              value,
              positions[columnIndex] + (locale === "en" ? 6 : 3),
              y + 4,
              proposalTextOptions(
                columns[columnIndex]
                  .align,
                columns[columnIndex]
                  .width - (locale === "en" ? 12 : 6),
                Math.max(
                  8,
                  rowHeight - 7,
                ),
              ),
            );
        },
      );

      doc
        .moveTo(
          left,
          y + rowHeight,
        )
        .lineTo(
          left + totalWidth,
          y + rowHeight,
        )
        .lineWidth(0.35)
        .strokeColor(
          PROPOSAL_COLOR.line,
        )
        .stroke();

      y += rowHeight;
    },
  );

  y += 8;

  y =
    drawTotals(
      doc,
      snapshot,
      y,
    ) + 8;



  y =
    drawApprovalStatement(
      doc,
      snapshot,
      y,
    ) + 8;

  if (shouldRenderProposalApproval(snapshot)) {
    drawProposalCompanyApproval(
      doc,
      snapshot,
      y,
      112,
      verificationQr,
    );
  }

  return hasLetterhead;
}
