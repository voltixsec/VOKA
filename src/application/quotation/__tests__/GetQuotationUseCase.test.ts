import { describe, expect, it, vi } from "vitest";

import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { GetQuotationUseCase } from "../use-cases/GetQuotationUseCase";

function createRepository(
  quotation: Awaited<
    ReturnType<IQuotationRepository["findById"]>
  >,
): IQuotationRepository {
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(quotation),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
  };
}

describe("GetQuotationUseCase", () => {
  it("returns the quotation from the active company", async () => {
    const quotation = {
      id: "quotation-1",
    } as never;
    const repository = createRepository(quotation);
    const useCase = new GetQuotationUseCase(repository);

    const result = await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });

    expect(repository.findById).toHaveBeenCalledWith(
      "company-1",
      "quotation-1",
    );
    expect(result).toEqual({
      success: true,
      data: quotation,
    });
  });

  it("does not reveal a missing or cross-company quotation", async () => {
    const repository = createRepository(null);
    const useCase = new GetQuotationUseCase(repository);

    const result = await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-from-another-company",
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: "QUOTATION_NOT_FOUND",
        message: "Quotation not found.",
      },
    });
  });
});
