import {
  describe,
  expect,
  it,
} from "vitest";

import { Quotation } from "../../../../../domain/quotation";
import { PrismaQuotationMapper } from "../PrismaQuotationMapper";

describe(
  "PrismaQuotationMapper proposal metadata",
  () => {
    it(
      "maps proposal metadata to persistence",
      () => {
        const quotation =
          new Quotation({
            companyId: "company-1",
            customerId: "customer-1",
            number: "Q-001",

            customer: {
              name: "First United",
            },

            subjectAr:
              "\u0639\u0631\u0636 \u0641\u0646\u064a",

            subjectEn:
              "Technical Proposal",

            briefAr:
              "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u0631\u0636",

            briefEn:
              "Proposal brief",

            projectName:
              "Project A",

            attentionName:
              "Mr. Customer",

            scopeType:
              "SUPPLY_ONLY",
          });

        const data =
          PrismaQuotationMapper.toPersistence(
            quotation,
          );

        expect(
          data.subjectEn,
        ).toBe(
          "Technical Proposal",
        );

        expect(
          data.projectName,
        ).toBe(
          "Project A",
        );

        expect(
          data.attentionName,
        ).toBe(
          "Mr. Customer",
        );

        expect(
          data.scopeType,
        ).toBe(
          "SUPPLY_ONLY",
        );
      },
    );

    it(
      "restores proposal metadata from persistence",
      () => {
        const now =
          new Date(
            "2026-08-06T00:00:00.000Z",
          );

        const quotation =
          PrismaQuotationMapper.toDomain({
            id: "quotation-1",
            companyId: "company-1",
            customerId: "customer-1",
            priceListId: null,
            number: "Q-001",
            status: "DRAFT",
            issueDate: now,
            expiryDate: null,
            currencyCode: "KWD",
            customerName: "First United",
            customerEmail: null,
            customerPhone: null,
            customerTaxNo: null,
            billingAddress: null,

            subjectAr:
              "\u0639\u0631\u0636 \u0641\u0646\u064a",

            subjectEn:
              "Technical Proposal",

            briefAr:
              null,

            briefEn:
              "Proposal brief",

            projectName:
              "Project A",

            attentionName:
              "Mr. Customer",

            scopeType:
              "MAINTENANCE",

            subtotal: 0,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: 0,
            notes: null,
            termsAndConditions: null,
            sentAt: null,
            approvedAt: null,
            rejectedAt: null,
            cancelledAt: null,
            isDeleted: false,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
            lines: [],
          } as never);

        expect(
          quotation.subjectEn,
        ).toBe(
          "Technical Proposal",
        );

        expect(
          quotation.briefEn,
        ).toBe(
          "Proposal brief",
        );

        expect(
          quotation.projectName,
        ).toBe(
          "Project A",
        );

        expect(
          quotation.attentionName,
        ).toBe(
          "Mr. Customer",
        );

        expect(
          quotation.scopeType,
        ).toBe(
          "MAINTENANCE",
        );
      },
    );
  },
);
