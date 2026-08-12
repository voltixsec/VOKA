import {
  describe,
  expect,
  it,
} from "vitest";

import { LocalizationStatus } from "../../../../../domain/quotation/types/LocalizationStatus";
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

    it(
      "maps localization lifecycle metadata to persistence and restores it",
      () => {
        const now = new Date(
          "2026-08-06T00:00:00.000Z",
        );

        const quotation = new Quotation({
          companyId: "company-1",
          customerId: "customer-1",
          number: "Q-001",
          customer: {
            name: "First United",
          },
        });

        quotation.markLocalizationPending(
          "ar",
          now,
        );

        const data =
          PrismaQuotationMapper.toPersistence(
            quotation,
          );

        expect(
          data.localizationStatus,
        ).toBe("PENDING");
        expect(
          data.localizationRequestedAt,
        ).toEqual(now);
        expect(
          data.localizationSourceLocale,
        ).toBe("AR");

        const restored =
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
            localizationStatus: "PENDING",
            localizationRequestedAt: now,
            localizationCompletedAt: null,
            localizationLastError: null,
            localizationSourceLocale: "AR",
            subjectAr: null,
            subjectEn: null,
            briefAr: null,
            briefEn: null,
            projectName: null,
            attentionName: null,
            scopeType: null,
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
          restored.localizationStatus,
        ).toBe(LocalizationStatus.PENDING);
        expect(
          restored.localizationRequestedAt,
        ).toEqual(now);
        expect(
          restored.localizationSourceLocale,
        ).toBe("ar");
      },
    );

    it(
      "maps Phase 1.3 concurrency fields to persistence and restores them with default attemptCount",
      () => {
        const now = new Date("2026-08-06T00:00:00.000Z");
        const leaseUntil = new Date("2026-08-06T00:02:00.000Z");

        // 1. Check default domain properties for new Quotation
        const freshQuotation = new Quotation({
          companyId: "company-1",
          customerId: "customer-1",
          number: "Q-001",
          customer: { name: "First United" },
        });

        expect(freshQuotation.localizationAttemptCount).toBe(0);
        expect(freshQuotation.localizationSourceSignature).toBeNull();
        expect(freshQuotation.localizationClaimToken).toBeNull();
        expect(freshQuotation.localizationLeaseUntil).toBeNull();

        // 2. Check persistence mapping with populated fields
        const hydratedQuotation = Quotation.restore({
          id: "quotation-1",
          companyId: "company-1",
          customerId: "customer-1",
          number: "Q-001",
          customer: { name: "First United" },
          localizationSourceSignature: "sig_abc123",
          localizationClaimToken: "token_xyz789",
          localizationLeaseUntil: leaseUntil,
          localizationAttemptCount: 2,
        });

        const data = PrismaQuotationMapper.toPersistence(hydratedQuotation);

        expect(data.localizationSourceSignature).toBe("sig_abc123");
        expect(data.localizationClaimToken).toBe("token_xyz789");
        expect(data.localizationLeaseUntil).toEqual(leaseUntil);
        expect(data.localizationAttemptCount).toBe(2);

        // 3. Check domain restoration from record
        const restored = PrismaQuotationMapper.toDomain({
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
          localizationStatus: "PENDING",
          localizationRequestedAt: now,
          localizationCompletedAt: null,
          localizationLastError: null,
          localizationSourceLocale: "AR",
          localizationSourceSignature: "sig_abc123",
          localizationClaimToken: "token_xyz789",
          localizationLeaseUntil: leaseUntil,
          localizationAttemptCount: 2,
          subjectAr: null,
          subjectEn: null,
          briefAr: null,
          briefEn: null,
          projectName: null,
          attentionName: null,
          scopeType: null,
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

        expect(restored.localizationSourceSignature).toBe("sig_abc123");
        expect(restored.localizationClaimToken).toBe("token_xyz789");
        expect(restored.localizationLeaseUntil).toEqual(leaseUntil);
        expect(restored.localizationAttemptCount).toBe(2);
      },
    );

    it("round-trips the versioned document brand snapshot", () => {
      const snapshot = {
        version: 1 as const, nameAr: null, nameEn: "Original Brand",
        addressAr: null, addressEn: "Kuwait", poBox: null, phone: null,
        mobile: null, whatsapp: null, logoUrl: null, brandTheme: "EMERALD",
      };
      const quotation = Quotation.restore({
        id: "quotation-1", companyId: "company-1", customerId: "customer-1",
        number: "Q-001", customer: { name: "Customer" }, documentBrandSnapshot: snapshot,
      });
      expect(PrismaQuotationMapper.toPersistence(quotation).documentBrandSnapshot).toEqual(snapshot);

      const record = {
        id: "quotation-1", companyId: "company-1", customerId: "customer-1",
        priceListId: null, number: "Q-001", status: "APPROVED", issueDate: new Date(),
        expiryDate: null, currencyCode: "KWD", customerName: "Customer",
        lines: [], documentBrandSnapshot: snapshot,
      } as never;
      expect(PrismaQuotationMapper.toDomain(record).documentBrandSnapshot).toEqual(snapshot);
    });
  },
);
