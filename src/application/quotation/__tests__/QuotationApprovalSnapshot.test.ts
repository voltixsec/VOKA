import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  Quotation,
} from "../../../domain/quotation";
import { LocalizationStatus } from "../../../domain/quotation/types/LocalizationStatus";

import type {
  IQuotationRepository,
} from "../repositories/IQuotationRepository";

import {
  ApproveQuotationUseCase,
} from "../use-cases/ApproveQuotationUseCase";
import { createCompanyDocumentBrandSnapshot } from "../../../domain/document/CompanyDocumentBrandSnapshot";

const brandSnapshot = createCompanyDocumentBrandSnapshot({
  nameAr: "شركة فوكا", nameEn: "VOKA", addressAr: "الكويت", addressEn: "Kuwait",
  poBox: "123", phone: "2222", mobile: "9999", whatsapp: "9999",
  logoUrl: "data:image/png;base64,AAAA", brandTheme: "NAVY_GOLD",
});

describe(
  "Quotation approval snapshot",
  () => {
    it("generates and persists an immutable verification token on approval", async () => {
      const quotation = Quotation.restore({
        id: "quotation-token", companyId: "company-1", customerId: "customer-1", number: "Q-TOKEN",
        status: "SENT", customer: { name: "Customer" },
        lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
      });
      const repository = {
        existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation),
        findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(), completeLocalization: vi.fn(), failLocalization: vi.fn(),
      } satisfies IQuotationRepository;
      const generator = { generate: vi.fn(() => "generated-verification-token-1234567890") };
      await new ApproveQuotationUseCase(repository, generator).execute({ companyId: "company-1", quotationId: "quotation-token", documentBrandSnapshot: brandSnapshot });
      expect(generator.generate).toHaveBeenCalledOnce();
      expect(quotation.verificationToken).toBe("generated-verification-token-1234567890");
      expect(repository.update).toHaveBeenCalledWith("company-1", quotation);
    });

    it("never replaces an existing verification token", async () => {
      const quotation = Quotation.restore({
        id: "quotation-token", companyId: "company-1", customerId: "customer-1", number: "Q-TOKEN",
        status: "SENT", verificationToken: "existing-verification-token-1234567890",
        customer: { name: "Customer" }, lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
      });
      const repository = { existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation), findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(), completeLocalization: vi.fn(), failLocalization: vi.fn() } satisfies IQuotationRepository;
      const generator = { generate: vi.fn(() => "replacement-verification-token-123456") };
      await new ApproveQuotationUseCase(repository, generator).execute({ companyId: "company-1", quotationId: "quotation-token", documentBrandSnapshot: brandSnapshot });
      expect(generator.generate).not.toHaveBeenCalled();
      expect(quotation.verificationToken).toBe("existing-verification-token-1234567890");
    });

    it("does not generate a verification token for a non-sent quotation", async () => {
      const quotation = Quotation.restore({ id: "quotation-draft", companyId: "company-1", customerId: "customer-1", number: "Q-DRAFT", status: "DRAFT", customer: { name: "Customer" }, lines: [] });
      const repository = { existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation), findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(), completeLocalization: vi.fn(), failLocalization: vi.fn() } satisfies IQuotationRepository;
      const generator = { generate: vi.fn(() => "should-not-be-generated-token-123456") };
      const result = await new ApproveQuotationUseCase(repository, generator).execute({ companyId: "company-1", quotationId: "quotation-draft", documentBrandSnapshot: brandSnapshot });
      expect(result.success).toBe(false);
      expect(generator.generate).not.toHaveBeenCalled();
      expect(quotation.verificationToken).toBeNull();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it.each([
      [LocalizationStatus.PENDING, "QUOTATION_LOCALIZATION_PENDING"],
      [LocalizationStatus.FAILED, "QUOTATION_LOCALIZATION_FAILED"],
    ] as const)("refuses approval while required localization is %s", async (localizationStatus, code) => {
      const quotation = Quotation.restore({
        id: "quotation-localizing", companyId: "company-1", customerId: "customer-1",
        number: "Q-LOCALIZING", status: "SENT", localizationStatus,
        customer: { name: "Customer" },
        lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
      });
      const repository = {
        existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation),
        findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(),
        completeLocalization: vi.fn(), failLocalization: vi.fn(),
      } satisfies IQuotationRepository;
      const generator = { generate: vi.fn(() => "should-not-be-generated-token-123456") };

      const result = await new ApproveQuotationUseCase(repository, generator).execute({
        companyId: "company-1", quotationId: "quotation-localizing", documentBrandSnapshot: brandSnapshot,
      });

      expect(result).toEqual(expect.objectContaining({ success: false, error: expect.objectContaining({ code }) }));
      expect(generator.generate).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(quotation.status).toBe("SENT");
      expect(quotation.documentBrandSnapshot).toBeNull();
    });
    it(
      "stores approver name and role",
      async () => {
        const quotation =
          Quotation.restore({
            id: "quotation-1",
            companyId: "company-1",
            customerId: "customer-1",
            number: "Q-001",
            status: "SENT",

            customer: {
              name: "Customer",
            },

            lines: [
              {
                position: 1,
                type: "SERVICE",
                itemName: "Service",
                quantity: 1,
                unitPrice: 10,
              },
            ],
          });

        const repository:
          IQuotationRepository = {
          existsByNumber: vi.fn(),
          save: vi.fn(),

          findById:
            vi.fn()
              .mockResolvedValue(
                quotation,
              ),

          findAll: vi.fn(),

          update:
            vi.fn()
              .mockResolvedValue(
                undefined,
              ),

          delete: vi.fn(),
          claimLocalization: vi.fn(),
          completeLocalization: vi.fn(),
          failLocalization: vi.fn(),
        };

        const result =
          await new ApproveQuotationUseCase(
            repository,
            { generate: () => "verification-token-0000000000000000" },
          ).execute({
            companyId: "company-1",
            quotationId: "quotation-1",
            approvedByName:
              "Hani Othman",
            approvedByRole:
              "OWNER",
            documentBrandSnapshot: brandSnapshot,
          });

        expect(result.success)
          .toBe(true);

        expect(
          quotation.approvedByName,
        ).toBe("Hani Othman");

        expect(
          quotation.approvedByRole,
        ).toBe("OWNER");

        expect(
          quotation.approvedAt,
        ).toBeInstanceOf(Date);
        expect(quotation.documentBrandSnapshot).toEqual(brandSnapshot);
      },
    );

    it("does not overwrite an existing document brand snapshot", async () => {
      const original = {
        version: 1 as const,
        nameAr: brandSnapshot.nameAr, nameEn: "Original Brand",
        addressAr: brandSnapshot.addressAr, addressEn: brandSnapshot.addressEn,
        poBox: brandSnapshot.poBox, phone: brandSnapshot.phone,
        mobile: brandSnapshot.mobile, whatsapp: brandSnapshot.whatsapp,
        logoUrl: brandSnapshot.logoUrl, brandTheme: brandSnapshot.brandTheme,
      };
      const quotation = Quotation.restore({
        id: "quotation-1", companyId: "company-1", customerId: "customer-1",
        number: "Q-001", status: "SENT", customer: { name: "Customer" },
        lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
        documentBrandSnapshot: original,
      });
      const repository = {
        existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation),
        findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(),
        completeLocalization: vi.fn(), failLocalization: vi.fn(),
      } satisfies IQuotationRepository;
      await new ApproveQuotationUseCase(repository, { generate: () => "verification-token-0000000000000000" }).execute({
        companyId: "company-1", quotationId: "quotation-1",
        documentBrandSnapshot: { ...brandSnapshot, nameEn: "Changed Brand" },
      });
      expect(quotation.documentBrandSnapshot).toEqual(original);
    });
  },
);
