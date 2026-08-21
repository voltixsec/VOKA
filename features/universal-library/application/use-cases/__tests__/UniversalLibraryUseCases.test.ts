import { describe, expect, it, vi } from "vitest";
import {
  AdoptUniversalItem,
  GetUniversalItem,
  GetUniversalTaxonomy,
  LookupByUniversalIdentifier,
  SearchUniversalBrands,
  SearchUniversalManufacturers,
  SearchUniversalLibrary,
} from "../index";
import {
  IUniversalLibraryRepository,
  UniversalBrand,
  UniversalCatalogItem,
  UniversalCategory,
  UniversalManufacturer,
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
    expect(getCategories).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("clamps taxonomy retrieval to the hard maximum", async () => {
    const getCategories = vi.fn().mockResolvedValue([]);
    const getTaxonomy = new GetUniversalTaxonomy({ getCategories } as unknown as IUniversalLibraryRepository);
    await getTaxonomy.execute({ limit: 1000 });
    expect(getCategories).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("searches manufacturers with bounded limit", async () => {
    const mockMfg = new UniversalManufacturer({
      id: "mfg-1",
      name: "Schneider Electric",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const searchManufacturers = vi.fn().mockResolvedValue([mockMfg]);
    const repository = { searchManufacturers } as unknown as IUniversalLibraryRepository;
    const searchMfgUseCase = new SearchUniversalManufacturers(repository);

    const result = await searchMfgUseCase.execute({ query: "Schneider", limit: 200 });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Schneider Electric");
    expect(searchManufacturers).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Schneider", limit: 50 })
    );
  });

  it("searches brands filtered by manufacturer", async () => {
    const mockBrand = new UniversalBrand({
      id: "brand-1",
      manufacturerId: "mfg-1",
      name: "APC",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const searchBrands = vi.fn().mockResolvedValue([mockBrand]);
    const repository = { searchBrands } as unknown as IUniversalLibraryRepository;
    const searchBrandUseCase = new SearchUniversalBrands(repository);

    const result = await searchBrandUseCase.execute({
      query: "APC",
      manufacturerId: "mfg-1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("APC");
    expect(searchBrands).toHaveBeenCalledWith(
      expect.objectContaining({ query: "APC", manufacturerId: "mfg-1", limit: 20 })
    );
  });

  it("performs exact typed identifier lookup", async () => {
    const lookupByIdentifier = vi.fn().mockResolvedValue(mockItem);
    const repository = { lookupByIdentifier } as unknown as IUniversalLibraryRepository;
    const lookupUseCase = new LookupByUniversalIdentifier(repository);

    const result = await lookupUseCase.execute({
      identifierType: "GTIN_13",
      value: " 6941218201234 ",
    });

    expect(result?.id).toBe("ucl-1");
    expect(lookupByIdentifier).toHaveBeenCalledWith({
      identifierType: "GTIN_13",
      value: "6941218201234",
    });
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
