import { describe, expect, it, vi } from "vitest";

import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { ApproveQuotationUseCase } from "../use-cases/ApproveQuotationUseCase";
import { CancelQuotationUseCase } from "../use-cases/CancelQuotationUseCase";
import { RejectQuotationUseCase } from "../use-cases/RejectQuotationUseCase";
import { SendQuotationUseCase } from "../use-cases/SendQuotationUseCase";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";

function createRepository(): IQuotationRepository {
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    claimLocalization: vi.fn().mockResolvedValue(null),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

describe("Quotation use case tenant isolation", () => {
  it.each([
    {
      name: "update",
      create: (repository: IQuotationRepository) =>
        new UpdateQuotationUseCase(
          repository,
          {
            findInvalidReference: vi.fn(),
            getCustomerSnapshot: vi.fn(),
            resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
            listAvailableTaxRates: vi.fn().mockResolvedValue([]),
          },
        ),
      dto: {
        companyId: "company-1",
        quotationId: "quotation-1",
        lines: [],
      },
    },
    {
      name: "send",
      create: (repository: IQuotationRepository) =>
        new SendQuotationUseCase(repository),
      dto: {
        companyId: "company-1",
        quotationId: "quotation-1",
      },
    },
    {
      name: "approve",
      create: (repository: IQuotationRepository) =>
        new ApproveQuotationUseCase(repository, { generate: () => "verification-token-0000000000000000" }),
      dto: {
        companyId: "company-1",
        quotationId: "quotation-1",
      },
    },
    {
      name: "reject",
      create: (repository: IQuotationRepository) =>
        new RejectQuotationUseCase(repository),
      dto: {
        companyId: "company-1",
        quotationId: "quotation-1",
      },
    },
    {
      name: "cancel",
      create: (repository: IQuotationRepository) =>
        new CancelQuotationUseCase(repository),
      dto: {
        companyId: "company-1",
        quotationId: "quotation-1",
      },
    },
  ])(
    "scopes $name lookup to the active company",
    async ({ create, dto }) => {
      const repository = createRepository();
      const useCase = create(repository);

      const result = await useCase.execute(dto as never);

      expect(repository.findById).toHaveBeenCalledWith(
        "company-1",
        "quotation-1",
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: {
          code: "QUOTATION_NOT_FOUND",
          message: "Quotation not found.",
        },
      });
    },
  );
});
