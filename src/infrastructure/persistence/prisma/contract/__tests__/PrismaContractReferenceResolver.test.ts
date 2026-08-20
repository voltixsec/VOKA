import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { PrismaContractReferenceResolver } from "../PrismaContractReferenceResolver";

describe("PrismaContractReferenceResolver", () => {
  it("scopes active price lists to tenant and currency", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "list-1" });
    const resolver = new PrismaContractReferenceResolver({ priceList: { findFirst } } as any);
    await expect(resolver.isPriceListAvailable({ companyId: "company-1", priceListId: "list-1",
      currencyCode: "KWD" })).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "list-1", companyId: "company-1", currencyCode: "KWD", isActive: true } }));
  });

  it("scopes active catalog items to the tenant and rejects invalid units", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "item-1", type: "PRODUCT", code: "P-1",
      name: "Item", nameAr: null, nameEn: null, description: null, descriptionAr: null,
      descriptionEn: null, taxRateId: null,
      unit: { companyId: "company-2", name: "Box", nameAr: null, nameEn: null, isActive: true } });
    const resolver = new PrismaContractReferenceResolver({ catalogItem: { findFirst } } as any);
    await expect(resolver.getCatalogItemSnapshot("company-1", "item-1")).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "item-1", companyId: "company-1", isActive: true } }));
  });

  it("allows only active tenant or system/global tax rates", async () => {
    const findFirst = vi.fn().mockResolvedValue({ percentage: 7.5 });
    const resolver = new PrismaContractReferenceResolver({ taxRate: { findFirst } } as any);
    await expect(resolver.resolveTaxRatePercentage("company-1", "tax-1")).resolves.toBe(7.5);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "tax-1", isActive: true,
      OR: [{ companyId: "company-1" }, { companyId: null, isSystem: true }],
    } }));
  });
});
