import {
  UniversalBrand,
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemAlias,
  UniversalItemAttributeValue,
  UniversalItemIdentifier,
  UniversalItemProvenance,
  UniversalManufacturer,
  UniversalProductFamily,
} from "../../../features/universal-library";

export interface SerializedUniversalCategory {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent: SerializedUniversalCategory | null;
  children: SerializedUniversalCategory[];
}

export function serializeUniversalCategory(
  category: UniversalCategory
): SerializedUniversalCategory {
  return {
    id: category.id,
    parentId: category.parentId,
    code: category.code,
    name: category.name,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    parent: category.parent ? serializeUniversalCategory(category.parent) : null,
    children: category.children ? category.children.map(serializeUniversalCategory) : [],
  };
}

export function serializeUniversalManufacturer(m: UniversalManufacturer) {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    countryCode: m.countryCode,
    websiteUrl: m.websiteUrl,
    description: m.description,
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function serializeUniversalBrand(b: UniversalBrand) {
  return {
    id: b.id,
    manufacturerId: b.manufacturerId,
    code: b.code,
    name: b.name,
    nameAr: b.nameAr,
    nameEn: b.nameEn,
    logoUrl: b.logoUrl,
    description: b.description,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    manufacturer: b.manufacturer ? serializeUniversalManufacturer(b.manufacturer) : null,
  };
}

export function serializeUniversalFamily(f: UniversalProductFamily) {
  return {
    id: f.id,
    brandId: f.brandId,
    code: f.code,
    name: f.name,
    nameAr: f.nameAr,
    nameEn: f.nameEn,
    description: f.description,
    isActive: f.isActive,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    brand: f.brand ? serializeUniversalBrand(f.brand) : null,
  };
}

export function serializeUniversalAlias(alias: UniversalItemAlias) {
  return {
    id: alias.id,
    universalItemId: alias.universalItemId,
    alias: alias.alias,
    locale: alias.locale,
    aliasType: alias.aliasType,
    createdAt: alias.createdAt.toISOString(),
    updatedAt: alias.updatedAt.toISOString(),
  };
}

export function serializeUniversalIdentifier(ident: UniversalItemIdentifier) {
  return {
    id: ident.id,
    universalItemId: ident.universalItemId,
    identifierType: ident.identifierType,
    value: ident.value,
    manufacturerId: ident.manufacturerId,
    source: ident.source,
    createdAt: ident.createdAt.toISOString(),
    updatedAt: ident.updatedAt.toISOString(),
  };
}

export function serializeUniversalAttributeValue(attr: UniversalItemAttributeValue) {
  return {
    id: attr.id,
    universalItemId: attr.universalItemId,
    attributeDefinitionId: attr.attributeDefinitionId,
    valueString: attr.valueString,
    valueNumber: attr.valueNumber,
    valueBoolean: attr.valueBoolean,
    valueJson: attr.valueJson,
    unit: attr.unit,
    createdAt: attr.createdAt.toISOString(),
    updatedAt: attr.updatedAt.toISOString(),
    attributeDefinition: attr.attributeDefinition
      ? {
          id: attr.attributeDefinition.id,
          categoryId: attr.attributeDefinition.categoryId,
          code: attr.attributeDefinition.code,
          name: attr.attributeDefinition.name,
          nameAr: attr.attributeDefinition.nameAr,
          nameEn: attr.attributeDefinition.nameEn,
          dataType: attr.attributeDefinition.dataType,
          unitOfMeasure: attr.attributeDefinition.unitOfMeasure,
          description: attr.attributeDefinition.description,
          isRequired: attr.attributeDefinition.isRequired,
          isActive: attr.attributeDefinition.isActive,
        }
      : null,
  };
}

export function serializeUniversalProvenance(provenance: UniversalItemProvenance) {
  return {
    id: provenance.id,
    universalItemId: provenance.universalItemId,
    sourceId: provenance.sourceId,
    externalRef: provenance.externalRef,
    confidence: provenance.confidence,
    observedAt: provenance.observedAt.toISOString(),
    createdAt: provenance.createdAt.toISOString(),
    updatedAt: provenance.updatedAt.toISOString(),
    source: provenance.source
      ? {
          id: provenance.source.id,
          name: provenance.source.name,
          type: provenance.source.type,
          externalRef: provenance.source.externalRef,
          url: provenance.source.url,
          licenseInfo: provenance.source.licenseInfo,
          verificationStatus: provenance.source.verificationStatus,
        }
      : null,
  };
}

export function serializeUniversalItem(item: UniversalCatalogItem) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    searchName: item.searchName,
    description: item.description,
    descriptionAr: item.descriptionAr,
    descriptionEn: item.descriptionEn,
    categoryId: item.categoryId,
    manufacturerId: item.manufacturerId,
    brandId: item.brandId,
    familyId: item.familyId,
    modelNumber: item.modelNumber,
    variantName: item.variantName,
    parentId: item.parentId,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    category: item.category ? serializeUniversalCategory(item.category) : null,
    manufacturer: item.manufacturer ? serializeUniversalManufacturer(item.manufacturer) : null,
    brand: item.brand ? serializeUniversalBrand(item.brand) : null,
    family: item.family ? serializeUniversalFamily(item.family) : null,
    aliases: item.aliases ? item.aliases.map(serializeUniversalAlias) : [],
    identifiers: item.identifiers ? item.identifiers.map(serializeUniversalIdentifier) : [],
    attributeValues: item.attributeValues
      ? item.attributeValues.map(serializeUniversalAttributeValue)
      : [],
    provenances: item.provenances ? item.provenances.map(serializeUniversalProvenance) : [],
  };
}

export function serializeUniversalAdoption(adoption: UniversalItemAdoption) {
  return {
    id: adoption.id,
    companyId: adoption.companyId,
    universalItemId: adoption.universalItemId,
    catalogItemId: adoption.catalogItemId,
    adoptedByUserId: adoption.adoptedByUserId,
    adoptedAt: adoption.adoptedAt.toISOString(),
    catalogItem: adoption.catalogItem
      ? {
          id: adoption.catalogItem.id.toString(),
          companyId: adoption.catalogItem.companyId,
          type: adoption.catalogItem.type,
          code: adoption.catalogItem.code,
          name: adoption.catalogItem.name,
          nameAr: adoption.catalogItem.nameAr,
          nameEn: adoption.catalogItem.nameEn,
          salePrice: adoption.catalogItem.salePrice,
          isActive: adoption.catalogItem.isActive,
        }
      : null,
  };
}
