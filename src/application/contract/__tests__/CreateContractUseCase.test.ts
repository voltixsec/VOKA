import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";
import { PricingService, type PricingDbClient } from "../../pricing/services/PricingService";
import type { IContractReferenceResolver } from "../repositories/IContractReferenceResolver";
import type { IContractRepository } from "../repositories/IContractRepository";
import { CreateContractUseCase } from "../use-cases/CreateContractUseCase";

describe("CreateContractUseCase", () => {
  const customer = { id: "customer-1", companyId: "company-1", name: "Trusted Customer",
    nameAr: "عميل موثوق", nameEn: "Trusted Customer", email: "customer@example.com",
    phone: "+96512345678", taxNumber: "TAX-1", addressLine1: "Kuwait City" } as any;
  let contracts: IContractRepository;
  let customers: CustomerRepository;
  let references: IContractReferenceResolver;
  let pricingDb: PricingDbClient;
  let useCase: CreateContractUseCase;

  beforeEach(() => {
    contracts = { save: vi.fn().mockImplementation(async (value) => value), findById: vi.fn(),
      findByNumber: vi.fn(), list: vi.fn(), getNextContractNumber: vi.fn().mockResolvedValue("CN-202608-0001") };
    customers = { findByIdAndCompanyId: vi.fn().mockResolvedValue(customer), findById: vi.fn(),
      findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), delete: vi.fn(),
      deleteByIdAndCompanyId: vi.fn() };
    references = {
      isPriceListAvailable: vi.fn().mockResolvedValue(true),
      getCatalogItemSnapshot: vi.fn().mockResolvedValue({ id: "catalog-1", type: "SERVICE",
        itemCode: "SERVER-001", itemName: "Server Item", itemNameAr: "عنصر الخادم",
        itemNameEn: "Server Item EN", description: "Server description", descriptionAr: null,
        descriptionEn: null, unitName: "Hour", unitNameAr: "ساعة", unitNameEn: "Hour",
        defaultTaxRateId: "tax-default" }),
      resolveTaxRatePercentage: vi.fn().mockResolvedValue(5),
    };
    pricingDb = { priceListItem: { findFirst: vi.fn().mockResolvedValue({ price: 250 }) },
      catalogItem: { findFirst: vi.fn().mockResolvedValue({ salePrice: 200 }) } };
    useCase = new CreateContractUseCase(contracts, customers, references, new PricingService(pricingDb));
  });

  const base = () => ({ companyId: "company-1", customerId: "customer-1",
    actor: { userId: "user-1", name: "Sales User", role: "SALES" } });

  it("uses the server catalog snapshot, price, and tax despite spoofed client values", async () => {
    const result = await useCase.execute({ ...base(), priceListId: "price-list-1", currencyCode: "kwd",
      lines: [{ catalogItemId: "catalog-1", taxRateId: "tax-requested", position: 1,
        type: "PRODUCT", itemCode: "SPOOF", itemName: "Spoofed", itemNameAr: "مزيف",
        itemNameEn: "Spoofed EN", unitName: "Box", unitNameAr: "صندوق", unitNameEn: "Box",
        quantity: 2, unitPrice: 1, taxPercentage: 99 }] });

    expect(result.lines[0]).toMatchObject({ type: "SERVICE", itemCode: "SERVER-001",
      itemName: "Server Item", itemNameAr: "عنصر الخادم", itemNameEn: "Server Item EN",
      unitName: "Hour", unitNameAr: "ساعة", unitNameEn: "Hour", unitPrice: 250,
      taxRateId: "tax-requested", taxPercentage: 5, subtotal: 500, taxAmount: 25,
      totalAmount: 525 });
    expect(references.isPriceListAvailable).toHaveBeenCalledWith({ companyId: "company-1",
      priceListId: "price-list-1", currencyCode: "KWD" });
    expect(pricingDb.priceListItem.findFirst).toHaveBeenCalledOnce();
    expect(result.totalAmount).toBe(525);
  });

  it("uses the catalog default tax when taxRateId is omitted", async () => {
    const result = await useCase.execute({ ...base(), lines: [{ catalogItemId: "catalog-1",
      position: 1, type: "PRODUCT", itemName: "Ignored", quantity: 1, unitPrice: 1,
      taxPercentage: 99 }] });
    expect(references.resolveTaxRatePercentage).toHaveBeenCalledWith("company-1", "tax-default");
    expect(result.lines[0]).toMatchObject({ taxRateId: "tax-default", taxPercentage: 5 });
  });

  it("uses catalog salePrice when a price-list item does not exist", async () => {
    vi.mocked(pricingDb.priceListItem.findFirst).mockResolvedValue(null);
    const result = await useCase.execute({ ...base(), priceListId: "price-list-1",
      lines: [{ catalogItemId: "catalog-1", position: 1, type: "PRODUCT",
        itemName: "Ignored", quantity: 1, unitPrice: 1 }] });
    expect(result.lines[0].unitPrice).toBe(200);
  });

  it("retains manual unitPrice but resolves manual tax server-side", async () => {
    vi.mocked(references.resolveTaxRatePercentage).mockResolvedValue(15);
    const result = await useCase.execute({ ...base(), lines: [{ position: 1, type: "CUSTOM",
      itemName: "Custom service", quantity: 3, unitPrice: 40, taxRateId: "tax-manual",
      taxPercentage: 88 }] });
    expect(result.lines[0]).toMatchObject({ unitPrice: 40, taxPercentage: 15, subtotal: 120,
      taxAmount: 18, totalAmount: 138 });
  });

  it.each([
    ["customer", "CUSTOMER_NOT_FOUND"], ["catalog", "CATALOG_ITEM_NOT_FOUND"],
    ["priceList", "PRICE_LIST_NOT_FOUND"], ["tax", "TAX_RATE_NOT_FOUND"],
  ])("rejects an invalid, cross-tenant, or inactive %s reference", async (failure, code) => {
    if (failure === "customer") vi.mocked(customers.findByIdAndCompanyId).mockResolvedValue(null);
    if (failure === "catalog") vi.mocked(references.getCatalogItemSnapshot).mockResolvedValue(null);
    if (failure === "priceList") vi.mocked(references.isPriceListAvailable).mockResolvedValue(false);
    if (failure === "tax") vi.mocked(references.resolveTaxRatePercentage).mockResolvedValue(null);
    const promise = useCase.execute({ ...base(), priceListId: failure === "priceList" ? "bad-list" : undefined,
      lines: [{ catalogItemId: failure === "catalog" || failure === "tax" ? "catalog-1" : undefined,
        taxRateId: failure === "tax" ? "bad-tax" : undefined, position: 1, type: "CUSTOM",
        itemName: "Line", quantity: 1, unitPrice: 10 }] });
    await expect(promise).rejects.toMatchObject({ code });
    expect(contracts.save).not.toHaveBeenCalled();
  });
});
