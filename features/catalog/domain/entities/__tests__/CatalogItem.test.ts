import { describe, expect, it } from 'vitest';
import { CatalogItem } from '../CatalogItem';

describe('CatalogItem Entity', () => {
  it('creates a valid product with bilingual fields', () => {
    const result = CatalogItem.create({
      companyId: 'company-1',
      type: 'PRODUCT',
      code: 'PROD-101',
      name: 'Smart Camera',
      nameAr: 'كاميرا ذكية',
      nameEn: 'Smart Camera',
      description: '4K Security Camera',
      descriptionAr: 'كاميرا أمنية 4K',
      descriptionEn: '4K Security Camera',
      salePrice: 150.5,
    });

    expect(result.isSuccess).toBe(true);
    const item = result.getValue();
    expect(item.code).toBe('PROD-101');
    expect(item.type).toBe('PRODUCT');
    expect(item.nameAr).toBe('كاميرا ذكية');
    expect(item.nameEn).toBe('Smart Camera');
    expect(item.descriptionAr).toBe('كاميرا أمنية 4K');
    expect(item.descriptionEn).toBe('4K Security Camera');
    expect(item.trackInventory).toBe(true);
  });

  it('creates a valid service with trackInventory forced to false', () => {
    const result = CatalogItem.create({
      companyId: 'company-1',
      type: 'SERVICE',
      code: 'SRV-201',
      name: 'Installation Service',
      salePrice: 50,
      trackInventory: true,
    });

    expect(result.isSuccess).toBe(true);
    const item = result.getValue();
    expect(item.type).toBe('SERVICE');
    expect(item.trackInventory).toBe(false);
  });

  it('rejects negative sale price', () => {
    const result = CatalogItem.create({
      companyId: 'company-1',
      type: 'PRODUCT',
      code: 'PROD-102',
      name: 'Invalid Item',
      salePrice: -10,
    });

    expect(result.isSuccess).toBe(false);
    expect(result.getError().code).toBe('INVALID_CATALOG_ITEM_SALE_PRICE');
  });

  it('updates bilingual details correctly', () => {
    const item = CatalogItem.create({
      companyId: 'company-1',
      type: 'PRODUCT',
      code: 'PROD-103',
      name: 'Initial Name',
      salePrice: 100,
    }).getValue();

    const updateResult = item.updateDetails({
      name: 'Updated Name',
      nameAr: 'الاسم المحدث',
      nameEn: 'Updated Name',
      salePrice: 120,
    });

    expect(updateResult.isSuccess).toBe(true);
    expect(item.name).toBe('Updated Name');
    expect(item.nameAr).toBe('الاسم المحدث');
    expect(item.salePrice).toBe(120);
  });
});
