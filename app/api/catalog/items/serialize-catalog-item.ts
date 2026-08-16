import type { CatalogItem } from '../../../../features/catalog';

export function serializeCatalogItem(item: CatalogItem) {
  return {
    id: item.id.toString(),
    companyId: item.companyId,
    categoryId: item.categoryId,
    unitId: item.unitId,
    taxRateId: item.taxRateId,
    type: item.type,
    code: item.code,
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    description: item.description,
    descriptionAr: item.descriptionAr,
    descriptionEn: item.descriptionEn,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    trackInventory: item.trackInventory,
    allowDiscount: item.allowDiscount,
    imageUrl: item.imageUrl,
    notes: item.notes,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
