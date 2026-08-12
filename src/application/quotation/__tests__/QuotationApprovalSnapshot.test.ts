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
      },
    );
  },
);
