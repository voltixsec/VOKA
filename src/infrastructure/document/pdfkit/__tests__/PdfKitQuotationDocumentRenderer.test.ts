import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  QuotationDocumentSnapshot,
} from "@/src/application/document";

import {
  PdfKitQuotationDocumentRenderer,
} from "../PdfKitQuotationDocumentRenderer";
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe('professional terms and localized unit PDF presentation', () => {
  it.each(['ar', 'en'] as const)('renders the 180-camera %s review fixture without changing approved text or unit codes', async (locale) => {
    const data = snapshot(locale);
    const quote = data.quotation;
    quote.subjectAr = 'عرض سعر – توريد وتركيب نظام مراقبة بالكاميرات – 180 كاميرا';
    quote.subjectEn = 'Quotation – Supply and installation CCTV system – 180 cameras';
    quote.attentionNameAr = 'الأستاذ محمد خالد';
    quote.attentionNameEn = 'Mr. Mohamed Khaled';
    quote.notes = quote.notesAr = quote.notesEn = null;
    quote.termsAndConditionsAr = 'شروط الدفع: 50% مقدم\nمدة التوريد: 14 يوم\nالضمان: سنة\nصلاحية العرض: 15 يوم\nالأعمال المستثناة: الأعمال المدنية';
    quote.termsAndConditionsEn = 'Payment: 50% advance\nDelivery: 14 days\nWarranty: 1 year\nQuotation validity: 15 days\nExclusions: Civil works';
    const row = quote.lines[0];
    quote.lines = ['Unit', 'Package', 'Roll', 'Set', 'Point'].map((unitName, i) => ({ ...row, position: i + 1, itemNameAr: ['كاميرا IP', 'حزمة تخزين', 'كابلات CAT6', 'وصلات RJ45', 'خدمة تركيب'][i], itemNameEn: ['IP camera', 'Storage package', 'CAT6 cable', 'RJ45 connectors', 'Installation service'][i], description: null, descriptionAr: null, descriptionEn: null, unitName, unitNameAr: null, unitNameEn: null, quantity: i === 0 ? 180 : 1, unitPrice: 10, discountAmount: 0, taxAmount: 0, totalAmount: i === 0 ? 1800 : 10 }));
    quote.discount = null;
    quote.totals = { subtotal: 1840, discountAmount: 0, taxAmount: 0, totalAmount: 1840 };
    const before = JSON.stringify(data);
    const bytes = await new PdfKitQuotationDocumentRenderer().render(data);
    expect(JSON.stringify(data)).toBe(before);
    expect(Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    // Opt-in local visual QA artifacts; no writes in normal CI/test runs.
    if (process.env.VOKA_PDF_QA_DIR) {
      mkdirSync(process.env.VOKA_PDF_QA_DIR, { recursive: true });
      writeFileSync(join(process.env.VOKA_PDF_QA_DIR, `quotation-180-${locale}.pdf`), bytes);
    }
  });
});

function snapshot(
  locale: "ar" | "en",
): QuotationDocumentSnapshot {
  return {
    locale,

    company: {
      name:
        locale === "ar"
          ? "\u0634\u0631\u0643\u0629 \u0641\u0648\u0643\u0627"
          : "VOKA Company",
    },

    qrValue:
      "VOKA:Q-001",

    quotation: {
      number:
        "Q-001",

      status:
        "APPROVED",

      issueDate:
        new Date(
          "2026-08-05T00:00:00Z",
        ),

      expiryDate:
        new Date(
          "2026-08-20T00:00:00Z",
        ),

      currencyCode:
        "KWD",

      subjectAr:
        "\u0639\u0631\u0636 \u0641\u0646\u064a \u0648\u062a\u062c\u0627\u0631\u064a",

      subjectEn:
        "Technical and Commercial Proposal",

      briefAr:
        "\u0646\u0642\u062f\u0645 \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636 \u0644\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u0623\u0639\u0645\u0627\u0644.",

      briefEn:
        "This proposal covers the required works.",

      projectName:
        "VOKA Project",

      projectNameAr:
        "\u0645\u0634\u0631\u0648\u0639 \u0641\u0648\u0643\u0627",

      projectNameEn:
        "VOKA Project",

      attentionName:
        "Mr. Customer",

      attentionNameAr:
        "\u0627\u0644\u0633\u064a\u062f \u0627\u0644\u0639\u0645\u064a\u0644",

      attentionNameEn:
        "Mr. Customer",

      scopeType:
        "SUPPLY_AND_INSTALLATION",

      customer: {
        name:
          locale === "ar"
            ? "\u0627\u0644\u0639\u0645\u064a\u0644 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a"
            : "Demo Customer",

        email:
          "customer@example.com",

        phone:
          "+965 0000 0000",

        taxNumber:
          null,

        billingAddress:
          null,
      },

      lines: [
        {
          position: 1,
          type: "PRODUCT",
          itemCode: "SKU-1",

          itemName:
            locale === "ar"
              ? "\u0645\u0646\u062a\u062c \u062a\u062c\u0631\u064a\u0628\u064a"
              : "Demo product",

          itemNameAr:
            "\u0645\u0646\u062a\u062c \u062a\u062c\u0631\u064a\u0628\u064a",

          itemNameEn:
            "Demo product",

          description:
            "Product description.",

          descriptionAr:
            "\u0648\u0635\u0641 \u0627\u0644\u0645\u0646\u062a\u062c.",

          descriptionEn:
            "Product description.",

          unitName:
            locale === "ar"
              ? "\u0642\u0637\u0639\u0629"
              : "piece",

          unitNameAr:
            "\u0642\u0637\u0639\u0629",

          unitNameEn:
            "piece",

          quantity: 2,
          unitPrice: 100,
          discountAmount: 0,
          taxAmount: 9,
          totalAmount: 189,
        },
      ],

      discount: {
        type:
          "PERCENTAGE",

        value:
          10,
      },

      totals: {
        subtotal: 200,
        discountAmount: 20,
        taxAmount: 9,
        totalAmount: 189,
      },

      notes:
        "Proposal notes.",

      notesAr:
        "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0639\u0631\u0636.",

      notesEn:
        "Proposal notes.",

      termsAndConditions:
        "Payment and delivery are subject to the stated terms.",

      termsAndConditionsAr:
        "\u064a\u062e\u0636\u0639 \u0627\u0644\u062f\u0641\u0639 \u0648\u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0644\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629.",

      termsAndConditionsEn:
        "Payment and delivery are subject to the stated terms.",

      approvedAt:
        new Date(
          "2026-08-06T18:00:00Z",
        ),

      approvedByName:
        "Hani Othman",

      approvedByRole:
        "OWNER",
    },
  };
}

describe(
  "PdfKitQuotationDocumentRenderer",
  () => {
    it.each(
      [
        "en",
        "ar",
      ] as const,
    )(
      "renders a valid %s PDF",
      async (locale) => {
        const bytes =
          await new PdfKitQuotationDocumentRenderer()
            .render(
              snapshot(locale),
            );

        expect(
          bytes.length,
        ).toBeGreaterThan(
          1_000,
        );

        expect(
          new TextDecoder()
            .decode(
              bytes.slice(
                0,
                5,
              ),
            ),
        ).toBe(
          "%PDF-",
        );
      },
    );
  },
);

describe(
  "Proposal PDF pagination",
  () => {
    it(
      "renders the proposal as exactly two pages",
      async () => {
        const base =
          snapshot("en");

        const template =
          base.quotation.lines[0];

        if (!template) {
          throw new Error(
            "PDF test template line is missing.",
          );
        }

        const lines =
          Array.from(
            {
              length: 3,
            },
            (
              _,
              index,
            ) => ({
              ...template,

              position:
                index + 1,

              itemCode:
                "SKU-" +
                String(
                  index + 1,
                ),

              itemName:
                "Proposal item " +
                String(
                  index + 1,
                ),

              description:
                "Commercial item description for exact two-page validation.",
            }),
          );

        const bytes =
          await new PdfKitQuotationDocumentRenderer()
            .render({
              ...base,

              quotation: {
                ...base.quotation,
                lines,
              },
            });

        const pdfSource =
          Buffer.from(
            bytes,
          ).toString(
            "latin1",
          );

        const pages =
          pdfSource.match(
            /\/Type\s*\/Page\b/g,
          ) ?? [];

        expect(
          pages.length,
        ).toBe(2);
      },
    );
  },
);

describe("Proposal PDF asset integration", () => {
  it("renders a valid letterhead on the fixed two-page proposal and approved assets safely", async () => {
    const data = snapshot("en");
    data.company.letterheadUrl = PNG_DATA_URL;
    data.company.signatureUrl = PNG_DATA_URL;
    data.company.stampUrl = PNG_DATA_URL;

    const bytes = await new PdfKitQuotationDocumentRenderer().render(data);
    const pdfSource = Buffer.from(bytes).toString("latin1");
    expect(pdfSource.match(/\/Type\s*\/Page\b/g) ?? []).toHaveLength(2);
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it("ignores invalid letterhead, signature, and stamp without failing generation", async () => {
    const data = snapshot("en");
    data.company.letterheadUrl = "data:image/png;base64,AAAA";
    data.company.signatureUrl = "data:image/jpeg;base64,AAAA";
    data.company.stampUrl = "data:image/webp;base64,AAAA";
    await expect(new PdfKitQuotationDocumentRenderer().render(data)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("does not render uploaded approval assets for a pending quotation", async () => {
    const data = snapshot("en");
    data.quotation.status = "SENT";
    data.quotation.approvedAt = null;
    data.company.signatureUrl = PNG_DATA_URL;
    data.company.stampUrl = PNG_DATA_URL;
    await expect(new PdfKitQuotationDocumentRenderer().render(data)).resolves.toBeInstanceOf(Uint8Array);
  });
});
