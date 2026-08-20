import { describe, expect, it } from "vitest";
import {
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
  UniversalSource,
} from "../index";

describe("Universal Library Domain Entities", () => {
  it("prevents self-parenting in UniversalCategory", () => {
    expect(() => {
      new UniversalCategory({
        id: "cat-1",
        parentId: "cat-1",
        name: "Self Parent Category",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }).toThrow("INVALID_CATEGORY_HIERARCHY: Category cannot be its own parent.");
  });

  it("creates global UniversalCatalogItem without tenant ownership fields", () => {
    const item = new UniversalCatalogItem({
      id: "ucl-item-1",
      type: "PRODUCT",
      name: "Portland Cement Type I",
      nameAr: "أسمنت بورتلاندي نوع 1",
      nameEn: "Portland Cement Type I",
      searchName: "portland cement type i",
      description: "Standard commodity cement for construction",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(item.id).toBe("ucl-item-1");
    expect(item.type).toBe("PRODUCT");
    expect(item.searchName).toBe("portland cement type i");
    // Ensure it has no tenant ownership properties on the global record
    expect((item as any).companyId).toBeUndefined();
    expect((item as any).salePrice).toBeUndefined();
    expect((item as any).taxRateId).toBeUndefined();
  });

  it("associates UniversalSource and UniversalItemProvenance with Universal catalog item", () => {
    const source = new UniversalSource({
      id: "src-1",
      name: "Kuwait Building Materials Catalog",
      type: "DISTRIBUTOR",
      verificationStatus: "SOURCE_VERIFIED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const provenance = new UniversalItemProvenance({
      id: "prov-1",
      universalItemId: "ucl-item-1",
      sourceId: "src-1",
      confidence: 0.95,
      observedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      source,
    });

    expect(provenance.source?.id).toBe("src-1");
    expect(provenance.confidence).toBe(0.95);
  });

  it("models UniversalItemAdoption as an explicit tenant boundary link", () => {
    const adoption = new UniversalItemAdoption({
      id: "adopt-1",
      companyId: "company-a",
      universalItemId: "ucl-item-1",
      catalogItemId: "cat-item-100",
      adoptedByUserId: "user-1",
      adoptedAt: new Date(),
    });

    expect(adoption.companyId).toBe("company-a");
    expect(adoption.universalItemId).toBe("ucl-item-1");
    expect(adoption.catalogItemId).toBe("cat-item-100");
  });
});
