import { describe, expect, it } from "vitest";
import {
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
  UniversalSource,
  UniversalManufacturer,
  UniversalBrand,
  UniversalProductFamily,
  UniversalItemAlias,
  UniversalItemIdentifier,
  UniversalAttributeDefinition,
  UniversalItemAttributeValue,
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

  it("creates global UniversalCatalogItem with identity enrichment fields", () => {
    const manufacturer = new UniversalManufacturer({
      id: "mfg-1",
      name: "Hikvision",
      code: "HIK",
      countryCode: "CN",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const brand = new UniversalBrand({
      id: "brand-1",
      manufacturerId: "mfg-1",
      name: "Hikvision IP Cameras",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      manufacturer,
    });

    const family = new UniversalProductFamily({
      id: "family-1",
      brandId: "brand-1",
      name: "Pro Series",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      brand,
    });

    const alias = new UniversalItemAlias({
      id: "alias-1",
      universalItemId: "ucl-item-1",
      alias: "4MP Dome Camera",
      locale: "EN",
      aliasType: "SYNONYM",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const identifier = new UniversalItemIdentifier({
      id: "ident-1",
      universalItemId: "ucl-item-1",
      identifierType: "GTIN_13",
      value: "6941218201234",
      normalizedValue: "6941218201234",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const item = new UniversalCatalogItem({
      id: "ucl-item-1",
      type: "PRODUCT",
      name: "DS-2CD2143G0-I 4MP IP Camera",
      manufacturerId: "mfg-1",
      brandId: "brand-1",
      familyId: "family-1",
      modelNumber: "DS-2CD2143G0-I",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      manufacturer,
      brand,
      family,
      aliases: [alias],
      identifiers: [identifier],
    });

    expect(item.id).toBe("ucl-item-1");
    expect(item.type).toBe("PRODUCT");
    expect(item.manufacturer?.name).toBe("Hikvision");
    expect(item.brand?.name).toBe("Hikvision IP Cameras");
    expect(item.family?.name).toBe("Pro Series");
    expect(item.modelNumber).toBe("DS-2CD2143G0-I");
    expect(item.aliases).toHaveLength(1);
    expect(item.identifiers).toHaveLength(1);
  });

  it("models attribute definitions and typed attribute values", () => {
    const attrDef = new UniversalAttributeDefinition({
      id: "attr-def-1",
      code: "RESOLUTION",
      name: "Resolution",
      dataType: "STRING",
      isRequired: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const attrVal = new UniversalItemAttributeValue({
      id: "attr-val-1",
      universalItemId: "ucl-item-1",
      attributeDefinitionId: "attr-def-1",
      valueString: "4MP (2688x1520)",
      createdAt: new Date(),
      updatedAt: new Date(),
      attributeDefinition: attrDef,
    });

    expect(attrVal.attributeDefinition?.code).toBe("RESOLUTION");
    expect(attrVal.valueString).toBe("4MP (2688x1520)");
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
