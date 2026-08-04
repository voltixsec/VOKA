import { describe, expect, it, vi } from "vitest";

import { PrismaCatalogItemRepository } from "../PrismaCatalogItemRepository";

describe("PrismaCatalogItemRepository optional filters", () => {
  it("omits undefined enum and relation filters from findAll", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaCatalogItemRepository({
      catalogItem: { findMany },
    } as never);

    await repository.findAll({
      companyId: "company-1",
      isActive: true,
      skip: 0,
      take: 20,
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      companyId: "company-1",
      isActive: true,
    });
    expect(where).not.toHaveProperty("type");
    expect(where).not.toHaveProperty("categoryId");
  });

  it("omits undefined enum and relation filters from count", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const repository = new PrismaCatalogItemRepository({
      catalogItem: { count },
    } as never);

    await repository.count({
      companyId: "company-1",
      skip: 0,
      take: 20,
    });

    const where = count.mock.calls[0][0].where;
    expect(where).toEqual({ companyId: "company-1" });
    expect(where).not.toHaveProperty("type");
    expect(where).not.toHaveProperty("categoryId");
    expect(where).not.toHaveProperty("isActive");
  });
});
