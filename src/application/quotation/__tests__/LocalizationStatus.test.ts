// Phase 1.2 Localization Status tests
import { describe, expect, it, vi } from "vitest";

import { Quotation } from "../../../domain/quotation";
import { LocalizationStatus } from "../../../domain/quotation/types/LocalizationStatus";
import { CreateQuotationUseCase } from "../use-cases/CreateQuotationUseCase";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";

function createReferenceValidator(): IQuotationReferenceValidator {
  return {
    findInvalidReference: vi.fn().mockResolvedValue(null),
    getCustomerSnapshot: vi.fn().mockResolvedValue({ name: "Persisted Customer" }),
    resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()),
    listAvailableTaxRates: vi.fn().mockResolvedValue([]),
  };
}

function createRepository(quotation?: Quotation): IQuotationRepository {
  let stored = quotation;
  return {
    existsByNumber: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockImplementation(async (q) => {
      stored = q;
      return q;
    }),
    findById: vi.fn().mockImplementation(async () => stored),
    findAll: vi.fn(),
    update: vi.fn().mockImplementation(async (_companyId: string, updated: Quotation) => {
      stored = updated;
    }),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

describe("Localization lifecycle", () => {
  it("creates a bilingual quotation with COMPLETED status", async () => {
    const repository = createRepository();
    const useCase = new CreateQuotationUseCase(repository, createReferenceValidator());

    const dto = {
      companyId: "company-1",
      customerId: "customer-1",
      quotationNumber: "Q-001",
      lines: [{
        id: "line-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Hikvision Camera",
        itemNameAr: "كاميرا هيكفيجن",
        itemNameEn: "Hikvision Camera",
        description: "8 Megapixel Camera",
        descriptionAr: "كاميرا 8 ميجابكسل",
        descriptionEn: "8 Megapixel Camera",
        unitName: "Piece",
        unitNameAr: "حبة",
        unitNameEn: "Piece",
        quantity: 2,
        unitPrice: 50,
      }],
    } as any;

    const result = await useCase.execute(dto);
    expect(result.success).toBe(true);
    const saved = await repository.findById("company-1", "any-id");
    expect(saved).toBeDefined();
    expect(saved!.localizationStatus).toBe(LocalizationStatus.COMPLETED);
    expect(saved!.localizationRequestedAt).toBeNull();
    expect(saved!.localizationCompletedAt).toBeNull();
  });

  it("creates a quotation with missing target fields as PENDING", async () => {
    const repository = createRepository();
    const useCase = new CreateQuotationUseCase(repository, createReferenceValidator());

    const dto = {
      companyId: "company-1",
      customerId: "customer-1",
      quotationNumber: "Q-002",
      lines: [{
        id: "line-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Hikvision Camera",
        itemNameAr: "كاميرا هيكفيجن",
        description: "8 Megapixel Camera",
        unitName: "Piece",
        quantity: 2,
        unitPrice: 50,
      }],
    } as any;

    const result = await useCase.execute(dto);
    expect(result.success).toBe(true);
    const saved = await repository.findById("company-1", "any-id");
    expect(saved).toBeDefined();
    expect(saved!.localizationStatus).toBe(LocalizationStatus.PENDING);
    expect(saved!.localizationSourceSignature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("updates quotation and transitions to COMPLETED when no fields need localization", async () => {
    // initial quotation with already localized fields
    const initial = Quotation.restore({
      id: "quotation-1",
      companyId: "company-1",
      customerId: "customer-1",
      number: "Q-001",
      issueDate: new Date(),
      customer: { name: "Customer" },
      lines: [{
        id: "line-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Hikvision Camera",
        itemNameAr: "كاميرا هيكفيجن",
        itemNameEn: "Hikvision Camera",
        description: "8 Megapixel Camera",
        descriptionAr: "كاميرا 8 ميجابكسل",
        descriptionEn: "8 Megapixel Camera",
        unitName: "Piece",
        unitNameAr: "حبة",
        unitNameEn: "Piece",
        quantity: 2,
        unitPrice: 50,
      }],
    });
    initial.markLocalizationCompleted();
    const repository = createRepository(initial);
    const useCase = new UpdateQuotationUseCase(repository, createReferenceValidator());

    const updateDto = {
      companyId: "company-1",
      quotationId: "quotation-1",
      lines: [{
        id: "line-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Hikvision Camera",
        itemNameAr: "كاميرا هيكفيجن",
        itemNameEn: "Hikvision Camera",
        description: "8 Megapixel Camera",
        descriptionAr: "كاميرا 8 ميجابكسل",
        descriptionEn: "8 Megapixel Camera",
        unitName: "Piece",
        unitNameAr: "حبة",
        unitNameEn: "Piece",
        quantity: 2,
        unitPrice: 50,
      }],
    } as any;

    const result = await useCase.execute(updateDto);
    expect(result.success).toBe(true);
    const updated = await repository.findById("company-1", "quotation-1");
    expect(updated).toBeDefined();
    expect(updated!.localizationStatus).toBe(LocalizationStatus.COMPLETED);
  });
});
