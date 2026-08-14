import { describe, expect, it, vi } from "vitest";

import { Quotation } from "@/src/domain/quotation";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";

function quotation() {
  return new Quotation({
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: { name: "Customer" },
    lines: [{
      id: "line-1",
      position: 1,
      type: "SERVICE",
      itemName: "Service",
      quantity: 1,
      unitPrice: 100,
      taxRateId: "tax-old",
      taxPercentage: 7,
    }],
  });
}

function repository(value: Quotation): IQuotationRepository {
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(value),
    findAll: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

function references(
  percentages: ReadonlyMap<string, number>,
  invalid: Awaited<ReturnType<IQuotationReferenceValidator["findInvalidReference"]>> = null,
): IQuotationReferenceValidator {
  return {
    findInvalidReference: vi.fn().mockResolvedValue(invalid),
    getCustomerSnapshot: vi.fn(),
    resolveTaxRatePercentages: vi.fn().mockResolvedValue(percentages),
    listAvailableTaxRates: vi.fn().mockResolvedValue([]),
  };
}

describe("UpdateQuotationUseCase tax integrity", () => {
  it("resolves a newly selected rate and overrides client percentage", async () => {
    const value = quotation();
    const repo = repository(value);
    const refs = references(new Map([["tax-new", 5]]));
    const result = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      lines: [{
        id: "line-1",
        position: 1,
        type: "SERVICE",
        itemName: "Service updated",
        quantity: 2,
        unitPrice: 100,
        taxRateId: "tax-new",
        taxPercentage: 99,
      }],
      localizationSourceLocale: "en",
    });

    expect(result.success).toBe(true);
    expect(value.lines[0]).toMatchObject({
      taxRateId: "tax-new",
      taxPercentage: 5,
      taxAmount: 10,
      totalAmount: 210,
    });
    expect(refs.resolveTaxRatePercentages).toHaveBeenCalledWith(
      "company-1",
      ["tax-new"],
      { activeOnly: true },
    );
  });

  it("preserves the persisted snapshot when unrelated edits keep the same rate", async () => {
    const value = quotation();
    const repo = repository(value);
    const refs = references(new Map([["tax-old", 10]]));
    const result = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      lines: [{
        id: "line-1",
        position: 1,
        type: "SERVICE",
        itemName: "Renamed service",
        quantity: 1,
        unitPrice: 100,
        taxRateId: "tax-old",
        taxPercentage: 55,
      }],
      localizationSourceLocale: "en",
    });

    expect(result.success).toBe(true);
    expect(value.lines[0]).toMatchObject({
      itemName: "Renamed service",
      taxRateId: "tax-old",
      taxPercentage: 7,
      taxAmount: 7,
      totalAmount: 107,
    });
    expect(refs.resolveTaxRatePercentages).toHaveBeenCalledWith(
      "company-1",
      [],
      { activeOnly: true },
    );
  });

  it("refreshes the same rate to its current canonical percentage only with explicit intent", async () => {
    const value = quotation();
    const repo = repository(value);
    const refs = references(new Map([["tax-old", 10]]));
    const result = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      taxRateRefreshLineIds: ["line-1"],
      lines: [{
        id: "line-1",
        position: 1,
        type: "SERVICE",
        itemName: "Service",
        quantity: 1,
        unitPrice: 100,
        taxRateId: "tax-old",
        taxPercentage: 7,
      }],
    });

    expect(result.success).toBe(true);
    expect(value.lines[0]).toMatchObject({
      taxRateId: "tax-old",
      taxPercentage: 10,
      taxAmount: 10,
      totalAmount: 110,
    });
    expect(refs.resolveTaxRatePercentages).toHaveBeenCalledWith(
      "company-1",
      ["tax-old"],
      { activeOnly: true },
    );
  });

  it("retains an unchanged inactive historical rate but rejects selecting it on a new line", async () => {
    const value = quotation();
    const repo = repository(value);
    const refs = references(new Map());

    const preserved = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      lines: [{ ...value.lines[0], itemName: "Historical edit" }],
    });
    expect(preserved.success).toBe(true);
    expect(value.lines[0].taxPercentage).toBe(7);

    const rejected = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      lines: [
        { ...value.lines[0] },
        {
          position: 2,
          type: "SERVICE",
          itemName: "New line",
          quantity: 1,
          unitPrice: 100,
          taxRateId: "tax-old",
        },
      ],
    });
    expect(rejected).toMatchObject({ success: false, error: { code: "TAX_RATE_NOT_FOUND" } });
  });

  it("rejects another tenant's selected rate before updating", async () => {
    const value = quotation();
    const repo = repository(value);
    const error = {
      code: "TAX_RATE_NOT_FOUND" as const,
      message: "A tax rate was not found for the active company.",
    };
    const refs = references(new Map(), error);
    const result = await new UpdateQuotationUseCase(repo, refs).execute({
      companyId: "company-1",
      quotationId: value.id ?? "quotation-1",
      lines: [{
        id: "line-1",
        position: 1,
        type: "SERVICE",
        itemName: "Service",
        quantity: 1,
        unitPrice: 100,
        taxRateId: "other-company-tax",
      }],
    });

    expect(result).toEqual({ success: false, error });
    expect(repo.update).not.toHaveBeenCalled();
    expect(refs.resolveTaxRatePercentages).not.toHaveBeenCalled();
  });
});
