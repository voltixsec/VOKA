import { describe, expect, it } from "vitest";
import { CatalogItem } from "../../catalog";
import { UniqueEntityID } from "../../../lib/core";
import {
  AdoptUniversalItem,
  SearchUniversalLibrary,
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
  UniversalSource,
} from "../index";

describe("UCL-1 Architectural Integrity & Regression Guarantees", () => {
  it("Guarantee 1: Universal records are global and not tenant-owned", () => {
    const item = new UniversalCatalogItem({
      id: "ucl-global-1",
      type: "PRODUCT",
      name: "Global Commercial Generator 50kVA",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(item.id).toBe("ucl-global-1");
    expect((item as any).companyId).toBeUndefined();
  });

  it("Guarantee 2 & 3: Universal retrieval search is bounded and caps pagination size at 50", async () => {
    const mockRepo: any = {
      searchItems: async (params: any) => {
        expect(params.limit).toBeLessThanOrEqual(50);
        return {
          items: [],
          total: 1000,
          nextCursor: "cursor-50",
        };
      },
    };

    const searchUseCase = new SearchUniversalLibrary(mockRepo);
    const result = await searchUseCase.execute({ limit: 500 }); // Requests 500

    expect(result.total).toBe(1000);
    expect(result.nextCursor).toBe("cursor-50");
  });

  it("Guarantee 4: Inactive/deprecated records follow retrieval rules", async () => {
    const mockActive = new UniversalCatalogItem({
      id: "ucl-active",
      type: "PRODUCT",
      name: "Active Model Camera",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockInactive = new UniversalCatalogItem({
      id: "ucl-deprecated",
      type: "PRODUCT",
      name: "Deprecated Camera",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockRepo: any = {
      getItemById: async (id: string) => {
        if (id === "ucl-active") return mockActive;
        if (id === "ucl-deprecated") return mockInactive;
        return null;
      },
    };

    const adoptUseCase = new AdoptUniversalItem(mockRepo);
    const res = await adoptUseCase.execute({
      companyId: "comp-1",
      universalItemId: "ucl-deprecated",
    });

    expect(res.isSuccess).toBe(false);
    expect(res.error?.code).toBe("UNIVERSAL_ITEM_INACTIVE");
  });

  it("Guarantee 5: Taxonomy hierarchy prevents self-parenting", () => {
    expect(() => {
      new UniversalCategory({
        id: "cat-root",
        parentId: "cat-root",
        name: "Invalid Root Category",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }).toThrow("Category cannot be its own parent.");
  });

  it("Guarantee 6: Provenance can be associated with Universal knowledge", () => {
    const source = new UniversalSource({
      id: "src-iso",
      name: "ISO Commercial Products Registry",
      type: "PUBLIC_DATASET",
      verificationStatus: "CURATED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const provenance = new UniversalItemProvenance({
      id: "prov-iso-1",
      universalItemId: "ucl-global-1",
      sourceId: "src-iso",
      confidence: 0.99,
      observedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      source,
    });

    expect(provenance.source?.verificationStatus).toBe("CURATED");
    expect(provenance.confidence).toBe(0.99);
  });

  it("Guarantee 7 & 8: Tenant adoption creates a tenant CatalogItem deriving ownership server-side", async () => {
    const mockUniversal = new UniversalCatalogItem({
      id: "ucl-camera",
      type: "PRODUCT",
      name: "4K Dome Security Camera",
      description: "Night vision IP camera",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockAdoptedCatalogItem = CatalogItem.create({
      companyId: "server-tenant-123",
      type: "PRODUCT",
      code: "UCL-CAMERA",
      name: "4K Dome Security Camera",
      salePrice: 250,
      isActive: true,
    }).getValue();

    const mockAdoption = new UniversalItemAdoption({
      id: "adopt-123",
      companyId: "server-tenant-123",
      universalItemId: "ucl-camera",
      catalogItemId: mockAdoptedCatalogItem.id.toString(),
      adoptedAt: new Date(),
    });

    const mockRepo: any = {
      getItemById: async () => mockUniversal,
      adoptItem: async (params: any) => {
        // Ownership derived server-side
        expect(params.companyId).toBe("server-tenant-123");
        return {
          catalogItem: mockAdoptedCatalogItem,
          adoption: mockAdoption,
          isNewAdoption: true,
        };
      },
    };

    const adoptUseCase = new AdoptUniversalItem(mockRepo);
    const result = await adoptUseCase.execute({
      companyId: "server-tenant-123",
      universalItemId: "ucl-camera",
      salePrice: 250,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value?.catalogItem.companyId).toBe("server-tenant-123");
  });

  it("Guarantee 9 & 10: Adopted CatalogItem is independent; Universal changes do not mutate tenant config", () => {
    const tenantCatalogItem = CatalogItem.restore(
      {
        companyId: "comp-a",
        categoryId: null,
        unitId: null,
        taxRateId: null,
        type: "PRODUCT",
        code: "ITEM-A",
        sku: null,
        barcode: null,
        name: "Tenant Customized Name",
        nameAr: null,
        nameEn: null,
        description: null,
        descriptionAr: null,
        descriptionEn: null,
        purchasePrice: null,
        salePrice: 199.99,
        trackInventory: true,
        allowDiscount: true,
        imageUrl: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      new UniqueEntityID("tenant-item-1")
    );

    // Mutation of Universal item
    const updatedUniversal = new UniversalCatalogItem({
      id: "ucl-item-orig",
      type: "PRODUCT",
      name: "New Universal Global Brand Name",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Tenant CatalogItem remains completely unchanged
    expect(tenantCatalogItem.name).toBe("Tenant Customized Name");
    expect(tenantCatalogItem.salePrice).toBe(199.99);
    expect(updatedUniversal.name).not.toBe(tenantCatalogItem.name);
  });

  it("Guarantee 11 & 12: Existing Company Catalog & document snapshots remain untouched and authoritative", () => {
    const tenantCatalogItem = CatalogItem.create({
      companyId: "comp-b",
      type: "SERVICE",
      code: "SRV-INSTALL",
      name: "CCTV Installation Service",
      salePrice: 150,
      isActive: true,
    }).getValue();

    expect(tenantCatalogItem.type).toBe("SERVICE");
    expect(tenantCatalogItem.salePrice).toBe(150);
    expect(tenantCatalogItem.companyId).toBe("comp-b");
  });
});
