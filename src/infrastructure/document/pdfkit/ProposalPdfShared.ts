import {
  resolveQuotationBrandTheme,
} from "@/src/application/document/branding/QuotationBrandTheme";

import type {
  QuotationDocumentSnapshot,
} from "@/src/application/document";

import bidiFactory from "bidi-js";

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

export const LETTERHEAD_SAFE_AREA = {
  top: 120,
  bottom: 100,
  traceOffset: 12,
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

    electronicApproval:
      "تم اعتماد هذا المستند إلكترونيًا، وهذا الاعتماد يؤكد الموافقة على المستند ومحتوياته.",
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

    electronicApproval:
      "This document has been electronically approved. This approval confirms acceptance of the document and its contents.",

    approvedBy:
      "Approved by",
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

type ProposalBidiRun = {
  text: string;
  direction: "ltr" | "rtl";
};

const bidi = bidiFactory();

export function proposalBidiRuns(value: string): ProposalBidiRun[] {
  if (!value) return [];

  const ltrToken = /[A-Za-z0-9][A-Za-z0-9./%:+@_-]*(?: +[A-Za-z0-9][A-Za-z0-9./%:+@_-]*)*/gu;
  const augmentedCharacters: string[] = [];
  const originalIndices: Array<number | null> = [];
  let logicalIndex = 0;

  for (const match of value.matchAll(ltrToken)) {
    const start = match.index;
    while (logicalIndex < start) {
      augmentedCharacters.push(value[logicalIndex]);
      originalIndices.push(logicalIndex);
      logicalIndex += 1;
    }

    augmentedCharacters.push("\u2066");
    originalIndices.push(null);
    for (let index = start; index < start + match[0].length; index += 1) {
      augmentedCharacters.push(value[index]);
      originalIndices.push(index);
    }
    augmentedCharacters.push("\u2069");
    originalIndices.push(null);
    logicalIndex = start + match[0].length;
  }

  while (logicalIndex < value.length) {
    augmentedCharacters.push(value[logicalIndex]);
    originalIndices.push(logicalIndex);
    logicalIndex += 1;
  }

  const augmented = augmentedCharacters.join("");
  const levels = bidi.getEmbeddingLevels(augmented, "rtl");
  const visualIndices = bidi
    .getReorderedIndices(augmented, levels)
    .filter((index) => originalIndices[index] !== null);
  const runs: ProposalBidiRun[] = [];

  for (let offset = 0; offset < visualIndices.length;) {
    const firstAugmentedIndex = visualIndices[offset];
    const firstIndex = originalIndices[firstAugmentedIndex] as number;
    const firstCharacter = value[firstIndex];

    if (/\s/u.test(firstCharacter)) {
      runs.push({ text: firstCharacter, direction: "ltr" });
      offset += 1;
      continue;
    }

    const direction = (levels.levels[firstAugmentedIndex] & 1) === 1 ? "rtl" : "ltr";
    const step = direction === "rtl" ? -1 : 1;
    const indices = [firstIndex];
    let cursor = offset + 1;

    while (cursor < visualIndices.length) {
      const augmentedIndex = visualIndices[cursor];
      const index = originalIndices[augmentedIndex] as number;
      if (/\s/u.test(value[index])) break;
      if (((levels.levels[augmentedIndex] & 1) === 1 ? "rtl" : "ltr") !== direction) break;
      if (index !== indices[indices.length - 1] + step) break;
      indices.push(index);
      cursor += 1;
    }

    const logicalIndices = [...indices].sort((a, b) => a - b);
    runs.push({
      text: logicalIndices.map((index) => value[index]).join(""),
      direction,
    });
    offset = cursor;
  }

  return runs;
}

function wrapProposalBidiText(
  doc: ProposalPdfDocument,
  value: string,
  width: number,
): string[] {
  const lines: string[] = [];

  value.split("\n").forEach((paragraph) => {
    const tokens = paragraph.split(/(\s+)/u).filter(Boolean);
    let line = "";

    tokens.forEach((token) => {
      const candidate = line + token;
      if (line.trim() && doc.widthOfString(candidate) > width) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    });

    lines.push(line.trimEnd());
  });

  return lines;
}

export function configureProposalTextDirection(
  doc: ProposalPdfDocument,
  locale: ProposalLocale,
): void {
  if (locale !== "ar") return;

  const originalText = doc.text.bind(doc);
  doc.text = ((
    value: string,
    xOrOptions?: number | PDFKit.Mixins.TextOptions,
    y?: number,
    options?: PDFKit.Mixins.TextOptions,
  ) => {
    const mixedDirection = /[\u0600-\u06ff]/u.test(value) && /[A-Za-z0-9]/u.test(value);
    if (!mixedDirection || typeof xOrOptions !== "number" || typeof y !== "number" || !options?.width) {
      return typeof xOrOptions === "number"
        ? originalText(value, xOrOptions, y, options)
        : originalText(value, xOrOptions);
    }

    const availableWidth = options.width;
    const align = options.align ?? "right";
    const lineHeight = doc.currentLineHeight(true);
    const lines = wrapProposalBidiText(doc, value, availableWidth);
    const maxLines = options.height
      ? Math.max(1, Math.floor(options.height / lineHeight))
      : lines.length;

    lines.slice(0, maxLines).forEach((line, lineIndex) => {
      const runs = proposalBidiRuns(line);
      const widths = runs.map((run) => doc.widthOfString(run.text));
      const totalWidth = widths.reduce((sum, width) => sum + width, 0);
      let cursorX = align === "center"
        ? xOrOptions + Math.max(0, (availableWidth - totalWidth) / 2)
        : align === "right"
          ? xOrOptions + Math.max(0, availableWidth - totalWidth)
          : xOrOptions;

      runs.forEach((run, index) => {
        if (!/^\s+$/u.test(run.text)) {
          originalText(run.text, cursorX, y + lineIndex * lineHeight, {
            ...options,
            width: widths[index],
            align: run.direction === "rtl" ? "right" : "left",
            lineBreak: false,
            ellipsis: false,
          });
        }
        cursorX += widths[index];
      });
    });

    return doc;
  }) as typeof doc.text;
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

  return formatted;
}

export function formatProposalMoney(
  value: number,
  currencyCode: string,
): string {
  return (
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

export function decodeProposalImageDataUrl(
  value:
    | string
    | null
    | undefined,
): Buffer | null {
  if (!value) {
    return null;
  }

  const match =
    /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
      value,
    );

  if (!match) {
    return null;
  }

  try {
    const buffer = Buffer.from(
      match[1],
      "base64",
    );
    const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    return png || jpeg ? buffer : null;
  } catch {
    return null;
  }
}

export function drawProposalHeader(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  hasLetterhead = false,
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

  if (hasLetterhead) {
    doc
      .fillColor(brand.primary)
      .fontSize(20)
      .text(
        PROPOSAL_TEXT[locale].quotation,
        left,
        LETTERHEAD_SAFE_AREA.top + 4,
        proposalTextOptions("center", usableWidth, 24),
      );

    return LETTERHEAD_SAFE_AREA.top + 38;
  }

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

  if (!hasLetterhead) doc
    .rect(
      0,
      0,
      pageWidth,
      headerHeight,
    )
    .fill(
      brand.primary,
    );

  if (!hasLetterhead) doc
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
    decodeProposalImageDataUrl(
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
  if (logo && !hasLetterhead) {
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

  const headerTextColor = hasLetterhead
    ? brand.primary
    : brand.textOnPrimary;

  doc
    .fillColor(
      headerTextColor,
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
        headerTextColor,
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
        headerTextColor,
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
        headerTextColor,
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
      headerTextColor,
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

export function drawProposalLetterhead(doc: ProposalPdfDocument, snapshot: ProposalSnapshot): boolean {
  const letterhead = decodeProposalImageDataUrl(snapshot.company.letterheadUrl);
  if (!letterhead) return false;
  try {
    doc.image(letterhead, 0, 0, { fit: [doc.page.width, doc.page.height], align: "center", valign: "center" });
    return true;
  } catch {
    return false;
  }
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
  verificationQr?: Buffer | null,
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

  if (!approved) {
    return y;
  }

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

  const signature = approved
    ? decodeProposalImageDataUrl(snapshot.company.signatureUrl)
    : null;
  const stamp = approved
    ? decodeProposalImageDataUrl(snapshot.company.stampUrl)
    : null;

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

  const assetWidth = approved ? 190 : 0;
  const contentWidth = width - 28 - assetWidth;
  const contentX = locale === "ar" && assetWidth
    ? left + 14 + assetWidth
    : left + 14;

  const rows = locale === "en" && approved
    ? [
        { value: PROPOSAL_TEXT.en.approvedBy, size: 7, color: PROPOSAL_COLOR.muted },
        { value: name, size: 9, color: PROPOSAL_COLOR.navy },
        { value: role, size: 8, color: PROPOSAL_COLOR.navy },
        { value: formatProposalDate(quote.approvedAt), size: 8, color: PROPOSAL_COLOR.navy },
      ]
    : [
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
      value: formatProposalDate(quote.approvedAt),
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
          y + 10 + index * 15,
          proposalTextOptions(
            align,
            contentWidth,
            14,
          ),
        );
    },
  );

  if (approved) {
    const assetsX = locale === "ar" ? left + 14 : left + width - 14 - assetWidth;
    if (signature) {
      try {
        doc.image(signature, assetsX, y + 9, { fit: [125, 45], align: "center", valign: "center" });
      } catch { /* Ignore invalid image payloads safely. */ }
    }
    if (stamp) {
      try {
        doc.image(stamp, assetsX + 120, y + 5, { fit: [62, 55], align: "center", valign: "center" });
      } catch { /* Ignore invalid image payloads safely. */ }
    }
    if (!signature) {
      doc
        .fillColor(PROPOSAL_COLOR.muted)
        .fontSize(7)
        .text(PROPOSAL_TEXT[locale].signature, assetsX, y + 16, proposalTextOptions("center", 118, 12));
      doc
        .moveTo(assetsX + 10, y + 43)
        .lineTo(assetsX + 108, y + 43)
        .lineWidth(0.5)
        .strokeColor(PROPOSAL_COLOR.muted)
        .stroke();
    }
  }

  if (approved && verificationQr) {
    try {
      const qrX = locale === "ar" ? left + 84 : left + width - 72;
      doc.image(verificationQr, qrX, y + height - 45, { fit: [28, 28], align: "center", valign: "center" });
      doc.fillColor(PROPOSAL_COLOR.muted).fontSize(5.2).text(
        locale === "ar" ? "التحقق من المستند" : "Verify document",
        locale === "ar" ? left + 64 : left + width - 92,
        y + height - 15,
        proposalTextOptions("center", 68, 8),
      );
    } catch { /* Verification QR failure must not break document rendering. */ }
  }

  if (approved) {
    doc
      .fillColor(PROPOSAL_COLOR.muted)
      .fontSize(5.8)
      .text(
        PROPOSAL_TEXT[locale].electronicApproval,
        locale === "ar" ? contentX : left + 14,
        y + height - 23,
        proposalTextOptions(align, locale === "ar" ? contentWidth : width - 28, 16),
      );
  }

  const signatureY =
    y + height - 20;

  const signatureLabelWidth =
    62;

  const signatureLineWidth =
    width * 0.15;

  if (!approved && locale === "ar") {
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
  } else if (!approved) {
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
