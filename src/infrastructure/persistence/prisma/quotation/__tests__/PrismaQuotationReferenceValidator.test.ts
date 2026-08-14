import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/prisma", () => ({
  prisma: {},
}));

import { PrismaQuotationReferenceValidator } from "../PrismaQuotationReferenceValidator";

function createDb() {
  return {
    customer: {
      findFirst: vi.fn().mockResolvedValue({
        id: "customer-1",
      }),
    },
    priceList: {
      findFirst: vi.fn().mockResolvedValue({
        id: "price-list-1",
      }),
    },
    catalogItem: {
      count: vi.fn().mockResolvedValue(1),
    },
    taxRate: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const input = {
  companyId: "company-1",
  customerId: "customer-1",
  priceListId: "price-list-1",
  catalogItemIds: ["item-1"],
  taxRateIds: ["tax-1"],
};

describe("PrismaQuotationReferenceValidator", () => {
  it("accepts only company references and global system tax rates", async () => {
    const db = createDb();
    const validator =
      new PrismaQuotationReferenceValidator(db as never);

    const result =
      await validator.findInvalidReference(input);

    expect(result).toBeNull();
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: "customer-1",
        companyId: "company-1",
        isDeleted: false,
      },
      select: {
        id: true,
      },
    });
    expect(db.priceList.findFirst).toHaveBeenCalledWith({
      where: {
        id: "price-list-1",
        companyId: "company-1",
      },
      select: {
        id: true,
      },
    });
    expect(db.catalogItem.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["item-1"],
        },
        companyId: "company-1",
      },
    });
    expect(db.taxRate.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["tax-1"],
        },
        OR: [
          {
            companyId: "company-1",
          },
          {
            companyId: null,
            isSystem: true,
          },
        ],
      },
    });
  });

  it("rejects a customer outside the active company", async () => {
    const db = createDb();
    db.customer.findFirst.mockResolvedValue(null);
    const validator =
      new PrismaQuotationReferenceValidator(db as never);

    const result =
      await validator.findInvalidReference(input);

    expect(result?.code).toBe("CUSTOMER_NOT_FOUND");
    expect(db.priceList.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a price list outside the active company", async () => {
    const db = createDb();
    db.priceList.findFirst.mockResolvedValue(null);
    const validator =
      new PrismaQuotationReferenceValidator(db as never);

    const result =
      await validator.findInvalidReference(input);

    expect(result?.code).toBe("PRICE_LIST_NOT_FOUND");
    expect(db.catalogItem.count).not.toHaveBeenCalled();
  });

  it("rejects a catalog item outside the active company", async () => {
    const db = createDb();
    db.catalogItem.count.mockResolvedValue(0);
    const validator =
      new PrismaQuotationReferenceValidator(db as never);

    const result =
      await validator.findInvalidReference(input);

    expect(result?.code).toBe("CATALOG_ITEM_NOT_FOUND");
    expect(db.taxRate.count).not.toHaveBeenCalled();
  });

  it("rejects a tax rate outside the active company", async () => {
    const db = createDb();
    db.taxRate.count.mockResolvedValue(0);
    const validator =
      new PrismaQuotationReferenceValidator(db as never);

    const result =
      await validator.findInvalidReference(input);

    expect(result?.code).toBe("TAX_RATE_NOT_FOUND");
  });

  it("resolves canonical percentages only for company or system rates", async () => {
    const db = createDb();
    db.taxRate.findMany.mockResolvedValue([
      { id: "tax-company", percentage: 5 },
      { id: "tax-system", percentage: 10 },
    ]);
    const validator = new PrismaQuotationReferenceValidator(db as never);

    const result = await validator.resolveTaxRatePercentages(
      "company-1",
      ["tax-company", "tax-system"],
    );

    expect([...result.entries()]).toEqual([
      ["tax-company", 5],
      ["tax-system", 10],
    ]);
    expect(db.taxRate.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tax-company", "tax-system"] },
        OR: [
          { companyId: "company-1" },
          { companyId: null, isSystem: true },
        ],
      },
      select: { id: true, percentage: true },
    });
  });

  it("lists only active company and active system composer choices", async () => {
    const db = createDb();
    db.taxRate.findMany.mockResolvedValue([
      { id: "tax-system", name: "VAT", percentage: 5, isSystem: true },
    ]);
    const validator = new PrismaQuotationReferenceValidator(db as never);

    const result = await validator.listAvailableTaxRates("company-1");

    expect(result).toEqual([
      { id: "tax-system", name: "VAT", percentage: 5, isSystem: true },
    ]);
    expect(db.taxRate.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { companyId: "company-1" },
          { companyId: null, isSystem: true },
        ],
      },
      select: { id: true, name: true, percentage: true, isSystem: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  });

  it("limits canonical resolution to active rates when requested for a new selection", async () => {
    const db = createDb();
    const validator = new PrismaQuotationReferenceValidator(db as never);

    await validator.resolveTaxRatePercentages(
      "company-1",
      ["tax-1"],
      { activeOnly: true },
    );

    expect(db.taxRate.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tax-1"] },
        isActive: true,
        OR: [
          { companyId: "company-1" },
          { companyId: null, isSystem: true },
        ],
      },
      select: { id: true, percentage: true },
    });
  });
});
