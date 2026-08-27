import type { CatalogItem } from '../../../../features/catalog';
import { resolveCatalogText, type CatalogLocalizationView } from '../../../../lib/catalog/catalog-localization';

export function serializeCatalogItem(
  item: CatalogItem,
  localizations: CatalogLocalizationView[] = [],
  requestedLocale = 'en',
) {
  const display = resolveCatalogText(
    { name: item.name, description: item.description },
    localizations,
    requestedLocale,
  );
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
    localizations,
    display,
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
