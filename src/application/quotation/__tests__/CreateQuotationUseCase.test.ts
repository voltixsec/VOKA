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
    claimLocalization: vi.fn(),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
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
        taxPercentage: 99,
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
      resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map([["tax-1", 5]])),
      listAvailableTaxRates: vi.fn().mockResolvedValue([]),
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
    expect(referenceValidator.resolveTaxRatePercentages).toHaveBeenCalledWith(
      "company-1",
      ["tax-1"],
      { activeOnly: true },
    );
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
      expect(result.data.lines[0]).toMatchObject({
        taxRateId: "tax-1",
        taxPercentage: 5,
        taxAmount: 0.5,
        totalAmount: 10.5,
      });
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
        resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
        listAvailableTaxRates: vi.fn().mockResolvedValue([]),
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

  it("sets new lines without a tax rate to zero tax", async () => {
    const repository = createRepository();
    const referenceValidator: IQuotationReferenceValidator = {
      findInvalidReference: vi.fn().mockResolvedValue(null),
      getCustomerSnapshot: vi.fn().mockResolvedValue({ name: "Customer" }),
      resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
      listAvailableTaxRates: vi.fn().mockResolvedValue([]),
    };
    const dto = createDto();
    dto.lines[0].taxRateId = null;
    dto.lines[0].taxPercentage = 88;

    const result = await new CreateQuotationUseCase(repository, referenceValidator)
      .execute(dto);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lines[0]).toMatchObject({
        taxRateId: null,
        taxPercentage: 0,
        taxAmount: 0,
        totalAmount: 10,
      });
    }
  });

  it("rejects an inactive rate even when it belongs to the company", async () => {
    const repository = createRepository();
    const referenceValidator: IQuotationReferenceValidator = {
      findInvalidReference: vi.fn().mockResolvedValue(null),
      getCustomerSnapshot: vi.fn(),
      resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
      listAvailableTaxRates: vi.fn().mockResolvedValue([]),
    };

    const result = await new CreateQuotationUseCase(repository, referenceValidator)
      .execute(createDto());

    expect(result).toMatchObject({ success: false, error: { code: "TAX_RATE_NOT_FOUND" } });
    expect(repository.save).not.toHaveBeenCalled();
    expect(referenceValidator.resolveTaxRatePercentages).toHaveBeenCalledWith(
      "company-1",
      ["tax-1"],
      { activeOnly: true },
    );
  });

  it("uses canonical tax with document-discount calculator semantics", async () => {
    const repository = createRepository();
    const referenceValidator: IQuotationReferenceValidator = {
      findInvalidReference: vi.fn().mockResolvedValue(null),
      getCustomerSnapshot: vi.fn().mockResolvedValue({ name: "Customer" }),
      resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map([["tax-1", 10]])),
      listAvailableTaxRates: vi.fn().mockResolvedValue([]),
    };
    const dto = createDto();
    dto.lines[0].unitPrice = 100;
    dto.discount = { type: "FIXED", value: 20 };

    const result = await new CreateQuotationUseCase(repository, referenceValidator)
      .execute(dto);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totals).toEqual({
        subtotal: 100,
        discountAmount: 20,
        taxAmount: 8,
        totalAmount: 88,
      });
    }
  });
});
