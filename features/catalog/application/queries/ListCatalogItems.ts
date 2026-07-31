import type { Service } from '../../../../lib/core';

import type {
  CatalogItem,
  CatalogItemType,
} from '../../domain/entities';

import type { CatalogItemRepository } from '../../domain/repositories';

export type ListCatalogItemsInput = {
  companyId: string;
  search?: string;
  type?: CatalogItemType;
  categoryId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
};

export type ListCatalogItemsOutput = {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export class ListCatalogItems
  implements
    Service<
      ListCatalogItemsInput,
      ListCatalogItemsOutput
    >
{
  constructor(
    private readonly catalogItemRepository:
      CatalogItemRepository,
  ) {}

  public async execute(
    input: ListCatalogItemsInput,
  ): Promise<ListCatalogItemsOutput> {
    const page = this.normalizePage(input.page);
    const pageSize = this.normalizePageSize(
      input.pageSize,
    );

    const filters = {
      companyId: input.companyId,
      search: input.search?.trim() || undefined,
      type: input.type,
      categoryId:
        input.categoryId?.trim() || undefined,
      isActive: input.isActive,
      skip: (page - 1) * pageSize,
      take: pageSize,
    };

    const [items, total] = await Promise.all([
      this.catalogItemRepository.findAll(filters),
      this.catalogItemRepository.count(filters),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / pageSize),
    };
  }

  private normalizePage(page?: number): number {
    if (
      page === undefined ||
      !Number.isInteger(page) ||
      page < 1
    ) {
      return 1;
    }

    return page;
  }

  private normalizePageSize(
    pageSize?: number,
  ): number {
    if (
      pageSize === undefined ||
      !Number.isInteger(pageSize) ||
      pageSize < 1
    ) {
      return 20;
    }

    return Math.min(pageSize, 100);
  }
}