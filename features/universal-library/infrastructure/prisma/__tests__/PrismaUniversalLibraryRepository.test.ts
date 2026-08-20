import { describe, expect, it, vi } from "vitest";
import { PrismaUniversalLibraryRepository } from "../PrismaUniversalLibraryRepository";

describe("PrismaUniversalLibraryRepository", () => {
  it("enforces maximum page size limit on searchItems", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);

    const prismaMock = {
      universalCatalogItem: {
        findMany,
        count,
      },
    } as any;

    const repository = new PrismaUniversalLibraryRepository(prismaMock);

    await repository.searchItems({
      limit: 100, // Should be clamped to 50
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51, // limit + 1
      })
    );
  });

  it("returns existing adoption without creating duplicate tenant catalog item when already adopted", async () => {
    const existingAdoption = {
      id: "adopt-1",
      companyId: "comp-1",
      universalItemId: "ucl-1",
      catalogItemId: "cat-item-1",
      adoptedByUserId: "user-1",
      adoptedAt: new Date(),
      catalogItem: {
        id: "cat-item-1",
        companyId: "comp-1",
        type: "PRODUCT",
        code: "UCL-12345",
        name: "Security Camera",
        salePrice: { toNumber: () => 150 },
        isActive: true,
        trackInventory: true,
        allowDiscount: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const findUniqueAdoption = vi.fn().mockResolvedValue(existingAdoption);

    const prismaMock = {
      universalItemAdoption: {
        findUnique: findUniqueAdoption,
      },
    } as any;

    const repository = new PrismaUniversalLibraryRepository(prismaMock);

    const result = await repository.adoptItem({
      companyId: "comp-1",
      universalItemId: "ucl-1",
    });

    expect(result.isNewAdoption).toBe(false);
    expect(result.catalogItem.id.toString()).toBe("cat-item-1");
    expect(findUniqueAdoption).toHaveBeenCalledWith({
      where: {
        companyId_universalItemId: {
          companyId: "comp-1",
          universalItemId: "ucl-1",
        },
      },
      include: {
        catalogItem: true,
      },
    });
  });
});
