import {
  resolveQuotationBrandTheme,
} from "@/src/application/document/branding/QuotationBrandTheme";

import type {
  QuotationDocumentSnapshot,
} from "@/src/application/document";

export type ProposalSnapshot =
  QuotationDocumentSnapshot;

export type ProposalPdfDocument =
  PDFKit.PDFDocument;

export type ProposalLocale =
  "ar" | "en";

export const PROPOSAL_COLOR = {
  navy: "#0f172a",
  blue: "#0369a1",
  sky: "#0ea5e9",
  paleBlue: "#e0f2fe",
  lightBlue: "#f0f9ff",
  slate: "#475569",
  muted: "#64748b",
  line: "#cbd5e1",
  pale: "#f8fafc",
  white: "#ffffff",
  green: "#047857",
  paleGreen: "#ecfdf5",
  amber: "#b45309",
  paleAmber: "#fffbeb",
} as const;

export function proposalBrand(
  snapshot: ProposalSnapshot,
) {
  return resolveQuotationBrandTheme(
    snapshot.company.brandTheme,
  );
}

export const PROPOSAL_TEXT = {
  ar: {
    quotation:
      "عرض سعر",

    subject:
      "موضوع العرض",

    customer:
      "العميل",

    project:
      "المشروع",

    attention:
      "عناية",

    scope:
      "البيان",

    issueDate:
      "تاريخ الإصدار",

    expiryDate:
      "تاريخ انتهاء الصلاحية",

    reference:
      "المرجع",

    brief:
      "ملخص العرض",

    boq:
      "عرض السعر",

    item:
      "البند",

    unit:
      "الوحدة",

    quantity:
      "الكمية",

    unitPrice:
      "سعر الوحدة",

    tax:
      "الضريبة",

    total:
      "الإجمالي",

    valueBeforeDiscount:
      "القيمة قبل الخصم",

    commercialDiscount:
      "الخصم التجاري",

    netProposalValue:
      "صافي قيمة العرض",

    totalProposalValue:
      "إجمالي قيمة العرض",

    notes:
      "ملاحظات",

    terms:
      "الشروط والأحكام",

    companyApproval:
      "اعتماد الشركة",

    name:
      "الاسم",

    role:
      "الصفة",

    date:
      "التاريخ",

    signature:
      "التوقيع",

    pendingApproval:
      "بانتظار الاعتماد",

    continuation:
      "هذه الصفحة متممة لعرض السعر.",

    approvalStatement:
      "يعتمد هذا العرض بقيمته وشروطه والبيان الموضح فيه، ويصبح ساريًا وفق مدة الصلاحية المحددة.",
  },

  en: {
    quotation:
      "QUOTATION",

    subject:
      "Proposal subject",

    customer:
      "Customer",

    project:
      "Project",

    attention:
      "Attention",

    scope:
      "Statement of Work",

    issueDate:
      "Issue date",

    expiryDate:
      "Validity date",

    reference:
      "Reference",

    brief:
      "Proposal brief",

    boq:
      "QUOTATION",

    item:
      "Item",

    unit:
      "Unit",

    quantity:
      "Quantity",

    unitPrice:
      "Unit price",

    tax:
      "Tax",

    total:
      "Total",

    valueBeforeDiscount:
      "Value before discount",

    commercialDiscount:
      "Commercial discount",

    netProposalValue:
      "Net proposal value",

    totalProposalValue:
      "Total proposal value",

    notes:
      "Notes",

    terms:
      "Terms and conditions",

    companyApproval:
      "Company approval",

    name:
      "Name",

    role:
      "Role",

    date:
      "Date",

    signature:
      "Signature",

    pendingApproval:
      "Pending approval",

    continuation:
      "This page forms an integral part of the quotation.",

    approvalStatement:
      "This quotation is approved with its stated value, terms and statement of work, and remains valid for the specified validity period.",
  },
} as const;

const SCOPE_LABELS:
  Record<
    string,
    {
      ar: string;
      en: string;
    }
  > = {
    SUPPLY_ONLY: {
      ar: "توريد فقط",
      en: "Supply only",
    },

    SUPPLY_AND_INSTALLATION: {
      ar: "توريد وتركيب",
      en: "Supply and installation",
    },

    INSTALLATION_ONLY: {
      ar: "تركيب فقط",
      en: "Installation only",
    },

    SERVICE: {
      ar: "خدمة",
      en: "Service",
    },

    MAINTENANCE: {
      ar: "صيانة",
      en: "Maintenance",
    },

    CONSULTATION: {
      ar: "استشارة",
      en: "Consultation",
    },

    CUSTOM: {
      ar: "مخصص",
      en: "Custom",
    },
  };

export function proposalTextOptions(
  align:
    | "left"
    | "right"
    | "center",
  width: number,
  height?: number,
): PDFKit.Mixins.TextOptions {
  return {
    width,
    align,
    lineBreak: true,

    features: [
      "rlig",
      "calt",
      "liga",
    ],

    ...(height
      ? {
          height,
          ellipsis: true,
        }
      : {}),
  };
}

export function proposalAlignment(
  locale: ProposalLocale,
): "left" | "right" {
  return locale === "ar"
    ? "right"
    : "left";
}

export function formatProposalDate(
  value: Date | null,
): string {
  if (!value) {
    return "-";
  }

  const formatted =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      },
    ).format(value);

  return "\u200E" + formatted;
}

export function formatProposalMoney(
  value: number,
  currencyCode: string,
): string {
  return (
    "\u200E" +
    currencyCode +
    " " +
    value.toFixed(3)
  );
}

export function proposalScopeLabel(
  scopeType: string | null,
  locale: ProposalLocale,
): string {
  if (!scopeType) {
    return "-";
  }

  return (
    SCOPE_LABELS[scopeType]?.[
      locale
    ] ?? scopeType
  );
}

export function proposalRoleLabel(
  role: string | null,
  locale: ProposalLocale,
): string {
  const labels:
    Record<
      string,
      {
        ar: string;
        en: string;
      }
    > = {
    OWNER: {
      ar: "المالك",
      en: "Owner",
    },

    ADMIN: {
      ar: "مدير النظام",
      en: "Administrator",
    },

    SALES: {
      ar: "المبيعات",
      en: "Sales",
    },

    VIEWER: {
      ar: "مشاهد",
      en: "Viewer",
    },

    APPROVER: {
      ar: "المعتمد",
      en: "Approver",
    },
  };

  if (!role) {
    return "-";
  }

  return (
    labels[role]?.[locale] ??
    role
  );
}

export function drawProposalCard(
  doc: ProposalPdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string =
    PROPOSAL_COLOR.pale,
): void {
  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      7,
    )
    .fill(fill);

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      7,
    )
    .lineWidth(0.6)
    .strokeColor(
      PROPOSAL_COLOR.line,
    )
    .stroke();
}

function decodeProposalLogo(
  value:
    | string
    | null
    | undefined,
): Buffer | null {
  if (!value) {
    return null;
  }

  const match =
    /^data:image\/(?:png|jpe?g);base64,(.+)$/i.exec(
      value,
    );

  if (!match) {
    return null;
  }

  try {
    return Buffer.from(
      match[1],
      "base64",
    );
  } catch {
    return null;
  }
}

export function drawProposalHeader(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
): number {
  const locale =
    snapshot.locale;

  const brand =
    proposalBrand(
      snapshot,
    );

  const company =
    snapshot.company;

  const pageWidth =
    doc.page.width;

  const left = 38;
  const right = 38;

  const usableWidth =
    pageWidth -
    left -
    right;

  const headerHeight =
    132;

  const labels =
    locale === "ar"
      ? {
          poBox: "ص.ب",
          phone: "هاتف",
          mobile: "موبايل",
          whatsapp: "واتساب",
        }
      : {
          poBox: "P.O. Box",
          phone: "Tel",
          mobile: "Mobile",
          whatsapp: "WhatsApp",
        };

  const firstContactLine =
    [
      company.poBox
        ? labels.poBox +
          ": " +
          company.poBox
        : null,

      company.phone
        ? labels.phone +
          ": " +
          company.phone
        : null,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .join("   |   ");

  const secondContactLine =
    [
      company.mobile
        ? labels.mobile +
          ": " +
          company.mobile
        : null,

      company.whatsapp
        ? labels.whatsapp +
          ": " +
          company.whatsapp
        : null,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .join("   |   ");

  doc
    .rect(
      0,
      0,
      pageWidth,
      headerHeight,
    )
    .fill(
      brand.primary,
    );

  doc
    .rect(
      0,
      headerHeight - 4,
      pageWidth,
      4,
    )
    .fill(
      brand.accent,
    );

  const logo =
    decodeProposalLogo(
      company.logoUrl,
    );

  const logoWidth = 96;
  const logoHeight = 52;
  const gap = 24;

  const companyWidth =
    usableWidth -
    logoWidth -
    gap;

  const companyX =
    locale === "ar"
      ? pageWidth -
        right -
        companyWidth
      : left;

  const logoX =
    locale === "ar"
      ? left
      : pageWidth -
        right -
        logoWidth;

  /*
   * No background, no white box,
   * no border behind the logo.
   */
  if (logo) {
    try {
      doc.image(
        logo,
        logoX,
        16,
        {
          fit: [
            logoWidth,
            logoHeight,
          ],
          align: "center",
          valign: "center",
        },
      );
    } catch {
      /*
       * Invalid logo data must not
       * stop PDF generation.
       */
    }
  }

  const align =
    locale === "ar"
      ? "right"
      : "left";

  doc
    .fillColor(
      brand.textOnPrimary,
    )
    .fontSize(15)
    .text(
      company.name,
      companyX,
      12,
      proposalTextOptions(
        align,
        companyWidth,
        18,
      ),
    );

  if (company.address) {
    doc
      .fillColor(
        brand.textOnPrimary,
      )
      .fontSize(8.5)
      .text(
        company.address,
        companyX,
        34,
        proposalTextOptions(
          align,
          companyWidth,
          16,
        ),
      );
  }

  if (firstContactLine) {
    doc
      .fillColor(
        brand.textOnPrimary,
      )
      .fontSize(8)
      .text(
        firstContactLine,
        companyX,
        54,
        proposalTextOptions(
          align,
          companyWidth,
          10,
        ),
      );
  }

  if (secondContactLine) {
    doc
      .fillColor(
        brand.textOnPrimary,
      )
      .fontSize(8)
      .text(
        secondContactLine,
        companyX,
        68,
        proposalTextOptions(
          align,
          companyWidth,
          10,
        ),
      );
  }

  doc
    .fillColor(
      brand.textOnPrimary,
    )
    .fontSize(24)
    .text(
      PROPOSAL_TEXT[
        locale
      ].quotation,
      left,
      76,
      proposalTextOptions(
        "center",
        usableWidth,
        20,
      ),
    );

  return 146;
}

export function drawProposalSubject(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
): number {
  const locale =
    snapshot.locale;

  const brand =
    proposalBrand(
      snapshot,
    );

  const quote =
    snapshot.quotation;

  const subject =
    locale === "ar"
      ? quote.subjectAr
      : quote.subjectEn;

  const left = 38;

  const width =
    doc.page.width - 76;

  drawProposalCard(
    doc,
    left,
    y,
    width,
    72,
    brand.soft,
  );

  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(9)
    .text(
      PROPOSAL_TEXT[locale]
        .subject,
      left + 12,
      y + 10,
      proposalTextOptions(
        "center",
        width - 24,
      ),
    );

  doc
    .fillColor(
      brand.primary,
    )
    .fontSize(16)
    .text(
      subject ||
        PROPOSAL_TEXT[locale]
          .quotation,
      left + 12,
      y + 31,
      proposalTextOptions(
        "center",
        width - 24,
        31,
      ),
    );

  return y + 84;
}

export function proposalFinancialHeight(
  snapshot: ProposalSnapshot,
  _bilingual = false,
): number {
  return snapshot.quotation
    .totals.discountAmount > 0
    ? 78
    : 31;
}

export function drawProposalFinancialSummary(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  x: number,
  y: number,
  width: number,
  _bilingual = false,
): number {
  const locale =
    snapshot.locale;

  const quote =
    snapshot.quotation;

  const text =
    PROPOSAL_TEXT[locale];

  const align =
    proposalAlignment(locale);

  const hasDiscount =
    quote.totals.discountAmount >
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

  let currentY = y;

  rows.forEach(
    (
      row,
      index,
    ) => {
      const rowHeight =
        row.strong ? 31 : 23;

      if (row.strong) {
        doc
          .rect(
            x,
            currentY,
            width,
            rowHeight,
          )
          .fill(
            PROPOSAL_COLOR.lightBlue,
          );
      }

      if (index > 0) {
        doc
          .moveTo(
            x,
            currentY,
          )
          .lineTo(
            x + width,
            currentY,
          )
          .lineWidth(0.4)
          .strokeColor(
            PROPOSAL_COLOR.line,
          )
          .stroke();
      }

      doc
        .fillColor(
          row.strong
            ? PROPOSAL_COLOR.blue
            : PROPOSAL_COLOR.slate,
        )
        .fontSize(
          row.strong ? 9 : 8,
        )
        .text(
          row.label,
          locale === "ar"
            ? x + width * 0.39
            : x + 9,
          currentY + 7,
          proposalTextOptions(
            locale === "ar"
              ? "right"
              : "left",
            width * 0.58,
          ),
        );

      doc
        .fillColor(
          row.strong
            ? PROPOSAL_COLOR.blue
            : PROPOSAL_COLOR.navy,
        )
        .fontSize(
          row.strong ? 10 : 8,
        )
        .text(
          row.value,
          locale === "ar"
            ? x + 9
            : x + width * 0.61,
          currentY + 7,
          proposalTextOptions(
            locale === "ar"
              ? "left"
              : "right",
            width * 0.35,
          ),
        );

      currentY +=
        rowHeight;
    },
  );

  return currentY;
}

export function drawProposalCompanyApproval(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  y: number,
  height = 112,
): number {
  const locale =
    snapshot.locale;

  const quote =
    snapshot.quotation;

  const left = 38;

  const width =
    doc.page.width - 76;

  const approved =
    quote.status ===
      "APPROVED" &&
    Boolean(
      quote.approvedAt,
    );

  const align =
    locale === "ar"
      ? "right"
      : "left";

  const name =
    quote.approvedByName ||
    (
      locale === "ar"
        ? "السيد/ هاني عثمان"
        : "Mr. Hani Othman"
    );

  const role =
    quote.approvedByRole
      ? proposalRoleLabel(
          quote.approvedByRole,
          locale,
        )
      : (
          locale === "ar"
            ? "مدير المشتريات"
            : "Purchase Manager"
        );

  const status =
    approved
      ? locale === "ar"
        ? "تم الاعتماد"
        : "Approved"
      : PROPOSAL_TEXT[locale]
          .pendingApproval;

  const phone =
    snapshot.company.mobile ||
    snapshot.company.phone ||
    "-";

  drawProposalCard(
    doc,
    left,
    y,
    width,
    height,
    approved
      ? PROPOSAL_COLOR.paleGreen
      : PROPOSAL_COLOR.pale,
  );

  const contentX =
    left + 14;

  const contentWidth =
    width - 28;

  const rows = [
    {
      value: name,
      size: 9,
      color:
        PROPOSAL_COLOR.navy,
    },
    {
      value: role,
      size: 8,
      color:
        PROPOSAL_COLOR.navy,
    },
    {
      value: status,
      size: 8,
      color:
        approved
          ? PROPOSAL_COLOR.green
          : PROPOSAL_COLOR.amber,
    },
    {
      value:
        phone,
      size: 8,
      color:
        PROPOSAL_COLOR.navy,
    },
  ];

  rows.forEach(
    (row, index) => {
      doc
        .fillColor(
          row.color,
        )
        .fontSize(
          row.size,
        )
        .text(
          row.value,
          contentX,
          y + 11 + index * 17,
          proposalTextOptions(
            align,
            contentWidth,
            14,
          ),
        );
    },
  );

  const signatureY =
    y + 87;

  const signatureLabelWidth =
    62;

  const signatureLineWidth =
    width * 0.15;

  if (locale === "ar") {
    const rightEdge =
      left + width - 14;

    const labelLeft =
      rightEdge -
      signatureLabelWidth;

    doc
      .fillColor(
        PROPOSAL_COLOR.muted,
      )
      .fontSize(8.5)
      .text(
        PROPOSAL_TEXT.ar.signature,
        labelLeft,
        signatureY,
        proposalTextOptions(
          "right",
          signatureLabelWidth,
          12,
        ),
      );

    doc
      .moveTo(
        labelLeft -
          7 -
          signatureLineWidth,
        signatureY + 9,
      )
      .lineTo(
        labelLeft - 7,
        signatureY + 9,
      )
      .lineWidth(0.5)
      .strokeColor(
        PROPOSAL_COLOR.muted,
      )
      .stroke();
  } else {
    const labelLeft =
      left + 14;

    doc
      .fillColor(
        PROPOSAL_COLOR.muted,
      )
      .fontSize(8.5)
      .text(
        PROPOSAL_TEXT.en.signature,
        labelLeft,
        signatureY,
        proposalTextOptions(
          "left",
          signatureLabelWidth,
          12,
        ),
      );

    doc
      .moveTo(
        labelLeft +
          signatureLabelWidth +
          7,
        signatureY + 9,
      )
      .lineTo(
        labelLeft +
          signatureLabelWidth +
          7 +
          signatureLineWidth,
        signatureY + 9,
      )
      .lineWidth(0.5)
      .strokeColor(
        PROPOSAL_COLOR.muted,
      )
      .stroke();
  }

  return y + height;
}
