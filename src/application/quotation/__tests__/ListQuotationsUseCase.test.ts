import { describe, expect, it, vi } from "vitest";

import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { ListQuotationsUseCase } from "../use-cases/ListQuotationsUseCase";

function createRepository(): IQuotationRepository {
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue({
      quotations: [],
      total: 45,
    }),
    update: vi.fn(),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
  };
}

describe("ListQuotationsUseCase", () => {
  it("passes tenant filters and calculates pagination", async () => {
    const repository = createRepository();
    const useCase = new ListQuotationsUseCase(repository);

    const result = await useCase.execute({
      companyId: "company-1",
      status: "SENT",
      customerId: "customer-1",
      search: "Q-",
      page: 2,
      pageSize: 20,
    });

    expect(repository.findAll).toHaveBeenCalledWith({
      companyId: "company-1",
      status: "SENT",
      customerId: "customer-1",
      search: "Q-",
      skip: 20,
      take: 20,
    });
    expect(result.pagination).toEqual({
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it("normalizes unsafe pagination values", async () => {
    const repository = createRepository();
    const useCase = new ListQuotationsUseCase(repository);

    const result = await useCase.execute({
      companyId: "company-1",
      page: -5,
      pageSize: 500,
    });

    expect(repository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", skip: 0, take: 100 }),
    );
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(100);
  });
});
