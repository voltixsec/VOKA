import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialDocumentProvenance } from "../../../domain/commercial";
import { Contract } from "../../../domain/contract";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";
import { PricingService, type PricingDbClient } from "../../pricing/services/PricingService";
import type { IContractReferenceResolver } from "../repositories/IContractReferenceResolver";
import type { IContractRepository } from "../repositories/IContractRepository";
import { UpdateContractUseCase } from "../use-cases/UpdateContractUseCase";

describe("UpdateContractUseCase", () => {
  const existingContract = new Contract({
    id: "contract-1",
    companyId: "company-1",
    number: "CN-202608-0001",
    provenance: CommercialDocumentProvenance.direct(),
    customerId: "customer-1",
    customer: { name: "Existing Customer" },
    lines: [
      {
        position: 1,
        type: "CUSTOM",
        itemName: "Line 1",
        quantity: 1,
        unitPrice: 10,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 10,
        totalAmount: 10,
      },
    ],
    createdByName: "Sales User",
    createdByRole: "SALES",
  });

  const customer = {
    id: "customer-1",
    companyId: "company-1",
    name: "Updated Customer",
    nameAr: "عميل محدث",
    nameEn: "Updated Customer",
    email: "updated@example.com",
    phone: "+96599998888",
    taxNumber: "TAX-UPDATED",
    addressLine1: "Kuwait City Central",
  } as any;

  let contracts: IContractRepository;
  let customers: CustomerRepository;
  let references: IContractReferenceResolver;
  let pricingDb: PricingDbClient;
  let useCase: UpdateContractUseCase;

  beforeEach(() => {
    contracts = {
      save: vi.fn().mockImplementation(async (value) => value),
      findById: vi.fn().mockResolvedValue(existingContract),
      findByNumber: vi.fn(),
      list: vi.fn(),
      getNextContractNumber: vi.fn().mockResolvedValue("CN-202608-0001"),
    };
    customers = {
      findByIdAndCompanyId: vi.fn().mockResolvedValue(customer),
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      deleteByIdAndCompanyId: vi.fn(),
    };
    references = {
      isPriceListAvailable: vi.fn().mockResolvedValue(true),
      getCatalogItemSnapshot: vi.fn().mockResolvedValue({
        id: "catalog-1",
        type: "SERVICE",
        itemCode: "SERV-100",
        itemName: "Service Catalog",
        itemNameAr: "خدمة كتالوج",
        itemNameEn: "Service Catalog EN",
        description: "Service Desc",
        descriptionAr: null,
        descriptionEn: null,
        unitName: "Hour",
        unitNameAr: "ساعة",
        unitNameEn: "Hour",
        defaultTaxRateId: "tax-default",
      }),
      resolveTaxRatePercentage: vi.fn().mockResolvedValue(5),
    };
    pricingDb = {
      priceListItem: { findFirst: vi.fn().mockResolvedValue({ price: 300 }) } as any,
      catalogItem: { findFirst: vi.fn().mockResolvedValue({ salePrice: 250 }) } as any,
    };

    useCase = new UpdateContractUseCase(
      contracts,
      customers,
      references,
      new PricingService(pricingDb),
    );
  });

  const baseDto = () => ({
    contractId: "contract-1",
    companyId: "company-1",
    actor: { userId: "user-1", name: "Sales User", role: "SALES" },
  });

  it("updates existing contract lines with server-authoritative catalog prices and tax rates", async () => {
    const updated = await useCase.execute({
      ...baseDto(),
      priceListId: "price-list-1",
      lines: [
        {
          catalogItemId: "catalog-1",
          position: 1,
          type: "PRODUCT",
          itemName: "Spoofed Name",
          quantity: 2,
          unitPrice: 1, // Spoofed client value
          taxPercentage: 99, // Spoofed client value
        },
      ],
    });

    expect(updated.lines[0]).toMatchObject({
      catalogItemId: "catalog-1",
      itemCode: "SERV-100",
      itemName: "Service Catalog",
      unitPrice: 300,
      taxPercentage: 5,
      subtotal: 600,
      taxAmount: 30,
      totalAmount: 630,
    });
    expect(updated.totalAmount).toBe(630);
  });

  it("preserves existing commercial line snapshots when PATCH does not include lines", async () => {
    const existingCatalogContract = new Contract({
      id: "contract-1",
      companyId: "company-1",
      number: "CN-202608-0001",
      provenance: CommercialDocumentProvenance.direct(),
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      lines: [
        {
          catalogItemId: "catalog-1",
          taxRateId: "tax-old",
          position: 1,
          type: "SERVICE",
          itemCode: "OLD-CODE",
          itemName: "Historical Service",
          itemNameAr: "Historical Service AR",
          itemNameEn: "Historical Service",
          unitName: "Day",
          unitNameAr: "Day AR",
          unitNameEn: "Day",
          quantity: 2,
          unitPrice: 111,
          discountValue: 0,
          discountAmount: 0,
          taxPercentage: 3,
          taxAmount: 6.66,
          subtotal: 222,
          totalAmount: 228.66,
        },
      ],
      createdByName: "Original Creator",
      createdByRole: "SALES",
    });

    vi.mocked(contracts.findById).mockResolvedValue(existingCatalogContract);

    const updated = await useCase.execute({
      ...baseDto(),
      notes: "Only notes changed",
    });

    expect(references.getCatalogItemSnapshot).not.toHaveBeenCalled();
    expect(references.resolveTaxRatePercentage).not.toHaveBeenCalled();

    expect(updated.lines[0]).toMatchObject({
      catalogItemId: "catalog-1",
      taxRateId: "tax-old",
      itemCode: "OLD-CODE",
      itemName: "Historical Service",
      unitName: "Day",
      quantity: 2,
      unitPrice: 111,
      taxPercentage: 3,
      subtotal: 222,
      taxAmount: 6.66,
      totalAmount: 228.66,
    });
  });
  it("preserves an unchanged historical price list reference during unrelated PATCH", async () => {
    const existingWithHistoricalPriceList = new Contract({
      id: "contract-1",
      companyId: "company-1",
      number: "CN-202608-0001",
      provenance: CommercialDocumentProvenance.direct(),
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      priceListId: "historical-price-list",
      lines: [
        {
          position: 1,
          type: "SERVICE",
          itemCode: "HIST-001",
          itemName: "Historical Service",
          itemNameAr: "Historical Service AR",
          itemNameEn: "Historical Service",
          unitName: "Day",
          unitNameAr: "Day AR",
          unitNameEn: "Day",
          quantity: 1,
          unitPrice: 100,
          discountValue: 0,
          discountAmount: 0,
          taxPercentage: 0,
          taxAmount: 0,
          subtotal: 100,
          totalAmount: 100,
        },
      ],
      createdByName: "Original Creator",
      createdByRole: "SALES",
    });

    vi.mocked(contracts.findById).mockResolvedValue(
      existingWithHistoricalPriceList,
    );

    vi.mocked(references.isPriceListAvailable).mockResolvedValue(false);

    const updated = await useCase.execute({
      ...baseDto(),
      notes: "Only notes changed",
    });

    expect(references.isPriceListAvailable).not.toHaveBeenCalled();
    expect(updated.priceListId).toBe("historical-price-list");
    expect(updated.notes).toBe("Only notes changed");
  });
  it("updates milestones and validates percentage bounds", async () => {
    const updated = await useCase.execute({
      ...baseDto(),
      milestones: [
        {
          position: 1,
          title: "Advance Payment",
          amountType: "PERCENTAGE",
          percentage: 40,
        },
        {
          position: 2,
          title: "Completion Payment",
          amountType: "PERCENTAGE",
          percentage: 60,
        },
      ],
    });

    expect(updated.milestones).toHaveLength(2);
    expect(updated.milestones[0].title).toBe("Advance Payment");
    expect(updated.milestones[0].percentage).toBe(40);
    expect(updated.milestones[1].percentage).toBe(60);
  });

  it("rejects update when contract is not found", async () => {
    vi.mocked(contracts.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseDto(),
        contractId: "non-existent",
      }),
    ).rejects.toMatchObject({ code: "CONTRACT_NOT_FOUND" });
  });

  it("rejects update when customer is not found", async () => {
    vi.mocked(customers.findByIdAndCompanyId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseDto(),
        customerId: "bad-customer",
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  });
});
