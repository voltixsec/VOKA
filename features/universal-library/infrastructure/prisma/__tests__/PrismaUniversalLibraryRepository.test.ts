import { describe, expect, it, vi } from "vitest";
import { PrismaUniversalLibraryRepository, UniversalAdoptionError } from "../PrismaUniversalLibraryRepository";

const now = new Date("2026-08-21T12:00:00.000Z");
const item = (id: string) => ({
  id, type: "PRODUCT", name: id, nameAr: null, nameEn: null, searchName: id,
  description: null, descriptionAr: null, descriptionEn: null, categoryId: null,
  manufacturerId: null, brandId: null, familyId: null, modelNumber: null,
  variantName: null, parentId: null, isActive: true, createdAt: now, updatedAt: now,
  category: null, manufacturer: null, brand: null, family: null, parent: null,
  variants: [], aliases: [], identifiers: [], attributeValues: [], provenances: [],
});
const catalog = () => ({
  id: "catalog-1", companyId: "company-1", categoryId: null, unitId: null,
  taxRateId: null, type: "PRODUCT", code: "UCL-ITEM-1", sku: null, barcode: null,
  name: "Item", nameAr: null, nameEn: null, description: null, descriptionAr: null,
  descriptionEn: null, purchasePrice: null, salePrice: { toNumber: () => 0 },
  trackInventory: true, allowDiscount: true, imageUrl: null, notes: null,
  isActive: true, createdAt: now, updatedAt: now,
});
const adoption = () => ({
  id: "adoption-1", companyId: "company-1", universalItemId: "item-1",
  catalogItemId: "catalog-1", adoptedByUserId: "user-1", adoptedAt: now,
  catalogItem: catalog(),
});

function transaction(options: { unit?: unknown; taxRate?: unknown } = {}) {
  return {
    universalItemAdoption: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(adoption()),
    },
    universalCatalogItem: { findFirst: vi.fn().mockResolvedValue(item("item-1")) },
    unit: { findFirst: vi.fn().mockResolvedValue(options.unit) },
    taxRate: { findFirst: vi.fn().mockResolvedValue(options.taxRate) },
    catalogItem: { create: vi.fn().mockResolvedValue(catalog()) },
  };
}

function adoptionRepository(tx: ReturnType<typeof transaction>) {
  return new PrismaUniversalLibraryRepository({
    universalItemAdoption: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback) => callback(tx)),
  } as any);
}

describe("PrismaUniversalLibraryRepository", () => {
  it("continues after the last returned row with deterministic equal-timestamp ordering", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([item("A"), item("B"), item("C")])
      .mockResolvedValueOnce([item("C"), item("D"), item("E")])
      .mockResolvedValueOnce([item("E")]);
    const repository = new PrismaUniversalLibraryRepository({
      universalCatalogItem: { findMany, count: vi.fn().mockResolvedValue(5) },
    } as any);
    const first = await repository.searchItems({ limit: 2 });
    const second = await repository.searchItems({ limit: 2, cursor: first.nextCursor });
    const third = await repository.searchItems({ limit: 2, cursor: second.nextCursor });
    expect(first.items.map((value) => value.id)).toEqual(["A", "B"]);
    expect(second.items.map((value) => value.id)).toEqual(["C", "D"]);
    expect(third.items.map((value) => value.id)).toEqual(["E"]);
    expect(findMany.mock.calls[1][0]).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      where: { AND: [expect.any(Object), { OR: [
        { createdAt: { lt: now } },
        { createdAt: now, id: { gt: "B" } },
      ] }] },
    });
  });

  it("rejects malformed cursors and clamps the search maximum", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaUniversalLibraryRepository({
      universalCatalogItem: { findMany, count: vi.fn().mockResolvedValue(0) },
    } as any);
    await repository.searchItems({ limit: 500 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
    await expect(repository.searchItems({ cursor: "bad" })).rejects.toThrow("cursor is invalid");
  });

  it("bounds taxonomy and avoids an unbounded children projection", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaUniversalLibraryRepository({ universalCategory: { findMany } } as any);
    await repository.getCategories({ limit: 999 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 100, include: { parent: true },
    }));
  });

  it("searches manufacturers with bounded limits", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "mfg-1", name: "Hikvision", code: "HIK", countryCode: "CN",
        websiteUrl: null, description: null, isActive: true, createdAt: now, updatedAt: now,
      },
    ]);
    const repository = new PrismaUniversalLibraryRepository({
      universalManufacturer: { findMany },
    } as any);

    const result = await repository.searchManufacturers({ query: "Hikvision", limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Hikvision");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("searches brands with manufacturer filter", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "brand-1", manufacturerId: "mfg-1", code: "HIK-IP", name: "Hikvision IP",
        logoUrl: null, description: null, isActive: true, createdAt: now, updatedAt: now,
        manufacturer: null,
      },
    ]);
    const repository = new PrismaUniversalLibraryRepository({
      universalBrand: { findMany },
    } as any);

    const result = await repository.searchBrands({ manufacturerId: "mfg-1" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Hikvision IP");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ manufacturerId: "mfg-1" }),
    }));
  });

  it("looks up items by exact typed identifier", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "ident-1", universalItemId: "item-1", identifierType: "GTIN_13",
      value: "6941218201234", normalizedValue: "6941218201234", source: null,
      createdAt: now, updatedAt: now,
      universalItem: item("item-1"),
    });
    const repository = new PrismaUniversalLibraryRepository({
      universalItemIdentifier: { findFirst },
    } as any);

    const result = await repository.lookupByIdentifier({
      identifierType: "GTIN_13", value: " 6941218201234 ",
    });

    expect(result?.id).toBe("item-1");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { identifierType: "GTIN_13", normalizedValue: "6941218201234" },
    }));
  });

  it("returns an existing zero-price adoption without writing", async () => {
    const runTransaction = vi.fn();
    const repository = new PrismaUniversalLibraryRepository({
      universalItemAdoption: { findUnique: vi.fn().mockResolvedValue(adoption()) },
      $transaction: runTransaction,
    } as any);
    const result = await repository.adoptItem({ companyId: "company-1", universalItemId: "item-1" });
    expect(result).toMatchObject({ isNewAdoption: false, catalogItem: { salePrice: 0 } });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([["tenant", { id: "unit-1", companyId: "company-1" }], ["shared", { id: "unit-1", companyId: null }]])
  ("allows a valid %s unit using canonical ownership rules", async (_label, unit) => {
    const tx = transaction({ unit });
    const result = await adoptionRepository(tx).adoptItem({
      companyId: "company-1", universalItemId: "item-1", unitId: "unit-1",
    });
    expect(result.isNewAdoption).toBe(true);
    expect(tx.catalogItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ salePrice: 0 }),
    }));
    expect(tx.unit.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "unit-1", OR: [{ companyId: "company-1" }, { companyId: null }] },
    }));
  });

  it.each(["foreign", "missing"])("rejects a %s unit before writes", async () => {
    const tx = transaction({ unit: null });
    await expect(adoptionRepository(tx).adoptItem({
      companyId: "company-1", universalItemId: "item-1", unitId: "bad-unit",
    })).rejects.toMatchObject({ code: "UNIT_NOT_FOUND" });
    expect(tx.catalogItem.create).not.toHaveBeenCalled();
    expect(tx.universalItemAdoption.create).not.toHaveBeenCalled();
  });

  it("allows an own tax rate using canonical tenant/system rules", async () => {
    const tx = transaction({ taxRate: { id: "tax-1" } });
    await adoptionRepository(tx).adoptItem({
      companyId: "company-1", universalItemId: "item-1", taxRateId: "tax-1",
    });
    expect(tx.taxRate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tax-1", OR: [
        { companyId: "company-1" }, { companyId: null, isSystem: true },
      ] },
    }));
  });

  it.each(["foreign", "missing"])("rejects a %s tax rate without partial state", async () => {
    const tx = transaction({ taxRate: null });
    await expect(adoptionRepository(tx).adoptItem({
      companyId: "company-1", universalItemId: "item-1", taxRateId: "bad-tax",
    })).rejects.toMatchObject({ code: "TAX_RATE_NOT_FOUND" });
    expect(tx.catalogItem.create).not.toHaveBeenCalled();
    expect(tx.universalItemAdoption.create).not.toHaveBeenCalled();
  });

  it("recovers the winning adoption after a unique race", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(adoption());
    const repository = new PrismaUniversalLibraryRepository({
      universalItemAdoption: { findUnique },
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
    } as any);
    const result = await repository.adoptItem({ companyId: "company-1", universalItemId: "item-1" });
    expect(result.isNewAdoption).toBe(false);
    expect(result.catalogItem.id.toString()).toBe("catalog-1");
  });

  it("turns a unique code collision without an adoption winner into a stable error", async () => {
    const repository = new PrismaUniversalLibraryRepository({
      universalItemAdoption: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
    } as any);
    await expect(repository.adoptItem({
      companyId: "company-1", universalItemId: "item-1", code: "TAKEN",
    })).rejects.toEqual(new UniversalAdoptionError("CATALOG_CODE_CONFLICT"));
  });
});
