import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  Quotation,
} from "../../../domain/quotation";

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
      const original = { ...brandSnapshot, nameEn: "Original Brand" };
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
      await new ApproveQuotationUseCase(repository).execute({
        companyId: "company-1", quotationId: "quotation-1",
        documentBrandSnapshot: { ...brandSnapshot, nameEn: "Changed Brand" },
      });
      expect(quotation.documentBrandSnapshot).toEqual(original);
    });
  },
);
