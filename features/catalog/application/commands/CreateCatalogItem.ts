import {
  DomainError,
  Result,
  type Service,
} from '../../../../lib/core';

import {
  CatalogItem,
  type CreateCatalogItemProps,
} from '../../domain/entities';

import type { CatalogItemRepository } from '../../domain/repositories';

export type CreateCatalogItemInput =
  CreateCatalogItemProps;

export class CreateCatalogItem
  implements
    Service<
      CreateCatalogItemInput,
      Result<CatalogItem, DomainError>
    >
{
  constructor(
    private readonly catalogItemRepository:
      CatalogItemRepository,
  ) {}

  public async execute(
    input: CreateCatalogItemInput,
  ): Promise<Result<CatalogItem, DomainError>> {
    const itemResult = CatalogItem.create(input);

    if (!itemResult.isSuccess) {
      return Result.failure(itemResult.getError());
    }

    const item = itemResult.getValue();

    const existingByCode =
      await this.catalogItemRepository.findByCode(
        item.companyId,
        item.code,
      );

    if (existingByCode) {
      return Result.failure(
        new DomainError(
          'A catalog item with this code already exists in this company.',
          'CATALOG_ITEM_CODE_ALREADY_EXISTS',
        ),
      );
    }

    if (item.sku) {
      const existingBySku =
        await this.catalogItemRepository.findBySku(
          item.companyId,
          item.sku,
        );

      if (existingBySku) {
        return Result.failure(
          new DomainError(
            'A catalog item with this SKU already exists in this company.',
            'CATALOG_ITEM_SKU_ALREADY_EXISTS',
          ),
        );
      }
    }

    if (item.barcode) {
      const existingByBarcode =
        await this.catalogItemRepository.findByBarcode(
          item.companyId,
          item.barcode,
        );

      if (existingByBarcode) {
        return Result.failure(
          new DomainError(
            'A catalog item with this barcode already exists in this company.',
            'CATALOG_ITEM_BARCODE_ALREADY_EXISTS',
          ),
        );
      }
    }

    const savedItem =
      await this.catalogItemRepository.save(item);

    return Result.success(savedItem);
  }
}