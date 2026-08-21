import { describe, expect, it, vi } from "vitest";
import { PrismaUniversalLibraryRepository, UniversalAdoptionError } from "../PrismaUniversalLibraryRepository";

const now = new Date("2026-08-21T12:00:00.000Z");
const item = (id: string) => ({
  id, type: "PRODUCT", name: id, nameAr: null, nameEn: null, searchName: id,
  description: null, descriptionAr: null, descriptionEn: null, categoryId: null,
  isActive: true, createdAt: now, updatedAt: now, category: null, provenances: [],
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
