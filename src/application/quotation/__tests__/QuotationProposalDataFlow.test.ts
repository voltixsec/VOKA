import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Quotation } from "../../../domain/quotation";

import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { CreateQuotationUseCase } from "../use-cases/CreateQuotationUseCase";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";

function createRepository(
  quotation?: Quotation,
): IQuotationRepository {
  return {
    existsByNumber:
      vi.fn().mockResolvedValue(false),

    save:
      vi.fn().mockImplementation(
        async (value: Quotation) =>
          value,
      ),

    findById:
      vi.fn().mockResolvedValue(
        quotation ?? null,
      ),

    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    claimLocalization: vi.fn().mockResolvedValue(null),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

function createReferenceValidator():
  IQuotationReferenceValidator {
  return {
    findInvalidReference:
      vi.fn().mockResolvedValue(null),

    getCustomerSnapshot:
      vi.fn().mockResolvedValue({
        name: "Persisted Customer",
      }),
  };
}

const lines = [
  {
    position: 1,
    type: "SERVICE" as const,
    itemName: "Installation service",
    quantity: 1,
    unitPrice: 10,
  },
];

describe(
  "Quotation proposal application data flow",
  () => {
    it(
      "passes proposal metadata through creation",
      async () => {
        const repository =
          createRepository();

        const useCase =
          new CreateQuotationUseCase(
            repository,
            createReferenceValidator(),
          );

        const result =
          await useCase.execute({
            companyId: "company-1",
            customerId: "customer-1",
            quotationNumber: "Q-001",

            customer: {
              name: "Request Customer",
            },

            lines,

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
              "SERVICE",
          });

        expect(result.success).toBe(true);

        if (result.success) {
          expect(
            result.data.subjectEn,
          ).toBe(
            "Technical Proposal",
          );

          expect(
            result.data.projectName,
          ).toBe(
            "Project A",
          );

          expect(
            result.data.scopeType,
          ).toBe(
            "SERVICE",
          );
        }
      },
    );

    it(
      "passes partial proposal updates to the aggregate",
      async () => {
        const quotation =
          new Quotation({
            companyId: "company-1",
            customerId: "customer-1",
            number: "Q-001",

            customer: {
              name: "Persisted Customer",
            },

            lines,

            projectName:
              "Old Project",

            scopeType:
              "SERVICE",
          });

        const repository =
          createRepository(quotation);

        const useCase =
          new UpdateQuotationUseCase(
            repository,
            createReferenceValidator(),
          );

        const result =
          await useCase.execute({
            companyId: "company-1",
            quotationId: "quotation-1",
            lines,

            subjectEn:
              "Updated Proposal",

            projectName:
              null,

            scopeType:
              "MAINTENANCE",
          });

        expect(result.success).toBe(true);

        expect(
          quotation.subjectEn,
        ).toBe(
          "Updated Proposal",
        );

        expect(
          quotation.projectName,
        ).toBeNull();

        expect(
          quotation.scopeType,
        ).toBe(
          "MAINTENANCE",
        );

        expect(
          repository.update,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);
