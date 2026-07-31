import type { Repository } from '../../../../lib/core';
import type {
  CatalogItem,
  CatalogItemType,
} from '../entities/CatalogItem';

export type CatalogItemListFilters = {
  companyId: string;
  search?: string;
  type?: CatalogItemType;
  categoryId?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
};

export interface CatalogItemRepository
  extends Repository<CatalogItem, string> {
  findByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<CatalogItem | null>;

  findByCode(
    companyId: string,
    code: string,
  ): Promise<CatalogItem | null>;

  findBySku(
    companyId: string,
    sku: string,
  ): Promise<CatalogItem | null>;

  findByBarcode(
    companyId: string,
    barcode: string,
  ): Promise<CatalogItem | null>;

  findAll(
    filters: CatalogItemListFilters,
  ): Promise<CatalogItem[]>;

  count(
    filters: CatalogItemListFilters,
  ): Promise<number>;

  deleteByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<void>;
}