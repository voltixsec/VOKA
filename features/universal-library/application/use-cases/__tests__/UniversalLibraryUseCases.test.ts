import { describe, expect, it, vi } from "vitest";
import {
  AdoptUniversalItem,
  GetUniversalItem,
  GetUniversalTaxonomy,
  SearchUniversalLibrary,
} from "../index";
import {
  IUniversalLibraryRepository,
  UniversalCatalogItem,
  UniversalCategory,
} from "../../../domain";

describe("Universal Library Application Use Cases", () => {
  const mockItem = new UniversalCatalogItem({
    id: "ucl-1",
    type: "PRODUCT",
    name: "Industrial Security Camera",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockInactiveItem = new UniversalCatalogItem({
    id: "ucl-2",
    type: "PRODUCT",
    name: "Deprecated Camera V1",
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("clamps search limit to maximum 50 to prevent unbounded responses", async () => {
    const searchItems = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const repository = { searchItems } as unknown as IUniversalLibraryRepository;
    const searchUseCase = new SearchUniversalLibrary(repository);

    await searchUseCase.execute({ limit: 500 });

    expect(searchItems).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
      })
    );
  });

  it("returns single universal item by ID", async () => {
    const getItemById = vi.fn().mockResolvedValue(mockItem);
    const repository = { getItemById } as unknown as IUniversalLibraryRepository;
    const getUseCase = new GetUniversalItem(repository);

    const result = await getUseCase.execute("ucl-1");

    expect(result?.id).toBe("ucl-1");
    expect(getItemById).toHaveBeenCalledWith("ucl-1");
  });

  it("returns null when item ID is empty or invalid", async () => {
    const repository = {} as unknown as IUniversalLibraryRepository;
    const getUseCase = new GetUniversalItem(repository);

    expect(await getUseCase.execute("")).toBeNull();
  });

  it("retrieves taxonomy categories", async () => {
    const mockCategory = new UniversalCategory({
      id: "cat-10",
      name: "CCTV & Security",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const getCategories = vi.fn().mockResolvedValue([mockCategory]);
    const repository = { getCategories } as unknown as IUniversalLibraryRepository;
    const getTaxonomy = new GetUniversalTaxonomy(repository);

    const categories = await getTaxonomy.execute({ parentId: null });

    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("CCTV & Security");
  });

  it("rejects adoption of missing or inactive universal items", async () => {
    const getItemById = vi.fn().mockImplementation(async (id: string) => {
      if (id === "ucl-1") return mockItem;
      if (id === "ucl-2") return mockInactiveItem;
      return null;
    });

    const repository = { getItemById } as unknown as IUniversalLibraryRepository;
    const adoptUseCase = new AdoptUniversalItem(repository);

    // Missing item
    const missingRes = await adoptUseCase.execute({
      companyId: "comp-1",
      universalItemId: "missing-id",
    });
    expect(missingRes.isSuccess).toBe(false);
    expect(missingRes.error?.code).toBe("UNIVERSAL_ITEM_NOT_FOUND");

    // Inactive item
    const inactiveRes = await adoptUseCase.execute({
      companyId: "comp-1",
      universalItemId: "ucl-2",
    });
    expect(inactiveRes.isSuccess).toBe(false);
    expect(inactiveRes.error?.code).toBe("UNIVERSAL_ITEM_INACTIVE");
  });
});
