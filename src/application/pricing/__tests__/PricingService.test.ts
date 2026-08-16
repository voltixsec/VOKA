import { describe, expect, it, vi } from "vitest";
import { PricingService } from "../services";

describe("PricingService", () => {
  it("PriceList price 120 overrides catalog sale price 150", async () => {
    const mockDb = {
      priceListItem: {
        findFirst: vi.fn().mockResolvedValue({ price: 120 }),
      },
      catalogItem: {
        findFirst: vi.fn().mockResolvedValue({ salePrice: 150 }),
      },
    };

    const service = new PricingService(mockDb as never);

    const result = await service.resolveUnitPrice({
      companyId: "company-1",
      priceListId: "pl-1",
      catalogItemId: "cat-1",
      quantity: 5,
    });

    expect(result.unitPrice).toBe(120);
    expect(result.subtotal).toBe(600);
    expect(mockDb.catalogItem.findFirst).not.toHaveBeenCalled();
  });

  it("Missing PriceList item falls back to catalog sale price 150", async () => {
    const mockDb = {
      priceListItem: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      catalogItem: {
        findFirst: vi.fn().mockResolvedValue({ salePrice: 150 }),
      },
    };

    const service = new PricingService(mockDb as never);

    const result = await service.resolveUnitPrice({
      companyId: "company-1",
      priceListId: "pl-1",
      catalogItemId: "cat-1",
      quantity: 2,
    });

    expect(result.unitPrice).toBe(150);
    expect(result.subtotal).toBe(300);
  });

  it("PriceList price 0 remains exactly 0 even when catalog price is non-zero (e.g. 150)", async () => {
    const mockDb = {
      priceListItem: {
        findFirst: vi.fn().mockResolvedValue({ price: 0 }),
      },
      catalogItem: {
        findFirst: vi.fn().mockResolvedValue({ salePrice: 150 }),
      },
    };

    const service = new PricingService(mockDb as never);

    const result = await service.resolveUnitPrice({
      companyId: "company-1",
      priceListId: "pl-1",
      catalogItemId: "cat-1",
      quantity: 10,
    });

    expect(result.unitPrice).toBe(0);
    expect(result.subtotal).toBe(0);
    expect(mockDb.catalogItem.findFirst).not.toHaveBeenCalled();
  });

  it("enforces companyId tenant isolation for price list and catalog lookup", async () => {
    const mockDb = {
      priceListItem: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      catalogItem: {
        findFirst: vi.fn().mockResolvedValue({ salePrice: 100 }),
      },
    };

    const service = new PricingService(mockDb as never);

    await service.resolveUnitPrice({
      companyId: "tenant-99",
      priceListId: "pl-1",
      catalogItemId: "cat-1",
      quantity: 1,
    });

    expect(mockDb.priceListItem.findFirst).toHaveBeenCalledWith({
      where: {
        priceListId: "pl-1",
        catalogItemId: "cat-1",
        priceList: {
          companyId: "tenant-99",
          isActive: true,
        },
      },
    });

    expect(mockDb.catalogItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: "cat-1",
        companyId: "tenant-99",
      },
    });
  });
});
