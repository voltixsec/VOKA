import {
  DomainError,
  Result,
  type Service,
} from '../../../../lib/core';

import type { CatalogItem } from '../../domain/entities';
import type { CatalogItemRepository } from '../../domain/repositories';

export type UpdateCatalogItemInput = {
  id: string;
  companyId: string;
  name?: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unitId?: string | null;
  taxRateId?: string | null;
  categoryId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  salePrice?: number;
  purchasePrice?: number | null;
  trackInventory?: boolean;
  allowDiscount?: boolean;
  isActive?: boolean;
};

export class UpdateCatalogItem
  implements
    Service<
      UpdateCatalogItemInput,
      Result<CatalogItem, DomainError>
    >
{
  constructor(
    private readonly catalogItemRepository: CatalogItemRepository,
  ) {}

  public async execute(
    input: UpdateCatalogItemInput,
  ): Promise<Result<CatalogItem, DomainError>> {
    const item = await this.catalogItemRepository.findByIdAndCompanyId(
      input.id,
      input.companyId,
    );

    if (!item) {
      return Result.failure(
        new DomainError(
          'Catalog item not found for the active company.',
          'CATALOG_ITEM_NOT_FOUND',
        ),
      );
    }

    if (input.sku && input.sku !== item.sku) {
      const existingBySku = await this.catalogItemRepository.findBySku(
        input.companyId,
        input.sku,
      );
      if (existingBySku && existingBySku.id.toString() !== item.id.toString()) {
        return Result.failure(
          new DomainError(
            'A catalog item with this SKU already exists in this company.',
            'CATALOG_ITEM_SKU_ALREADY_EXISTS',
          ),
        );
      }
    }

    if (input.barcode && input.barcode !== item.barcode) {
      const existingByBarcode = await this.catalogItemRepository.findByBarcode(
        input.companyId,
        input.barcode,
      );
      if (existingByBarcode && existingByBarcode.id.toString() !== item.id.toString()) {
        return Result.failure(
          new DomainError(
            'A catalog item with this barcode already exists in this company.',
            'CATALOG_ITEM_BARCODE_ALREADY_EXISTS',
          ),
        );
      }
    }

    const updateResult = item.updateDetails({
      name: input.name,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      description: input.description,
      descriptionAr: input.descriptionAr,
      descriptionEn: input.descriptionEn,
      unitId: input.unitId,
      taxRateId: input.taxRateId,
      categoryId: input.categoryId,
      sku: input.sku,
      barcode: input.barcode,
      salePrice: input.salePrice,
      purchasePrice: input.purchasePrice,
      trackInventory: input.trackInventory,
      allowDiscount: input.allowDiscount,
      isActive: input.isActive,
    });

    if (!updateResult.isSuccess) {
      return Result.failure(updateResult.getError());
    }

    const savedItem = await this.catalogItemRepository.save(item);
    return Result.success(savedItem);
  }
}
