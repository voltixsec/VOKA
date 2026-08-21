import {
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
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

export function serializeUniversalCategory(category: UniversalCategory): SerializedUniversalCategory {
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
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    category: item.category ? serializeUniversalCategory(item.category) : null,
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
