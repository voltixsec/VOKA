import { describe, expect, it, vi } from "vitest";

import { Quotation } from "../../../domain/quotation";

import type { CreateQuotationDto } from "../dto/CreateQuotationDto";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { CreateQuotationUseCase } from "../use-cases/CreateQuotationUseCase";

function createRepository(): IQuotationRepository {
  return {
    existsByNumber: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockImplementation(async (quotation: Quotation) =>
      Quotation.restore({
        id: "saved-quotation-1",
        companyId: quotation.companyId,
        customerId: quotation.customerId,
        priceListId: quotation.priceListId,
        number: quotation.number.toString(),
        status: quotation.status,
        issueDate: quotation.issueDate,
        expiryDate: quotation.expiryDate,
        currencyCode: quotation.currencyCode,
        customer: quotation.customer.toJSON(),
        lines: [...quotation.lines],
        discount: quotation.discount,
        notes: quotation.notes,
        termsAndConditions: quotation.termsAndConditions,
      }),
    ),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createDto(): CreateQuotationDto {
  return {
    companyId: "company-1",
    customerId: "customer-1",
    priceListId: "price-list-1",
    quotationNumber: "Q-001",
    customer: {
      name: "First United",
    },
    lines: [
      {
        catalogItemId: "item-1",
        taxRateId: "tax-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Product",
        quantity: 1,
        unitPrice: 10,
      },
    ],
  };
}

describe("CreateQuotationUseCase reference isolation", () => {
  it("validates every referenced record before saving", async () => {
    const repository = createRepository();
    const referenceValidator: IQuotationReferenceValidator = {
      findInvalidReference: vi.fn().mockResolvedValue(null),
      getCustomerSnapshot: vi.fn().mockResolvedValue({
        name: "Persisted Customer",
      }),
    };
    const useCase = new CreateQuotationUseCase(
      repository,
      referenceValidator,
    );

    const result = await useCase.execute(createDto());

    expect(
      referenceValidator.findInvalidReference,
    ).toHaveBeenCalledWith({
      companyId: "company-1",
      customerId: "customer-1",
      priceListId: "price-list-1",
      catalogItemIds: ["item-1"],
      taxRateIds: ["tax-1"],
    });
    expect(repository.save).toHaveBeenCalledOnce();
    expect(
      referenceValidator.getCustomerSnapshot,
    ).toHaveBeenCalledWith("company-1", "customer-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("saved-quotation-1");
      expect(result.data.customer.name).toBe(
        "Persisted Customer",
      );
      expect(result.data.customer.name).not.toBe("First United");
    }
  });

  it.each([
    {
      code: "CUSTOMER_NOT_FOUND",
      message: "Customer was not found for the active company.",
    },
    {
      code: "PRICE_LIST_NOT_FOUND",
      message: "Price list was not found for the active company.",
    },
    {
      code: "CATALOG_ITEM_NOT_FOUND",
      message: "A catalog item was not found for the active company.",
    },
    {
      code: "TAX_RATE_NOT_FOUND",
      message: "A tax rate was not found for the active company.",
    },
  ] as const)(
    "rejects $code without saving",
    async (invalidReference) => {
      const repository = createRepository();
      const referenceValidator: IQuotationReferenceValidator = {
        findInvalidReference:
          vi.fn().mockResolvedValue(invalidReference),
        getCustomerSnapshot: vi.fn(),
      };
      const useCase = new CreateQuotationUseCase(
        repository,
        referenceValidator,
      );

      const result = await useCase.execute(createDto());

      expect(result).toEqual({
        success: false,
        error: invalidReference,
      });
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
});
