import { CatalogItem, CatalogItemType } from "../../../catalog";
import {
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
} from "../entities";

export const MAX_UNIVERSAL_SEARCH_LIMIT = 50;
export const DEFAULT_UNIVERSAL_SEARCH_LIMIT = 20;
export const MAX_UNIVERSAL_TAXONOMY_LIMIT = 100;
export const DEFAULT_UNIVERSAL_TAXONOMY_LIMIT = 50;

export interface SearchUniversalLibraryParams {
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  isActive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SearchUniversalLibraryResult {
  items: UniversalCatalogItem[];
  total: number;
  nextCursor?: string;
}

export interface GetCategoriesParams {
  parentId?: string | null;
  search?: string;
  isActive?: boolean;
  limit?: number;
}

export interface AdoptUniversalItemParams {
  companyId: string;
  universalItemId: string;
  adoptedByUserId?: string | null;
  code?: string;
  salePrice?: number;
  unitId?: string;
  taxRateId?: string;
}

export interface AdoptUniversalItemResult {
  catalogItem: CatalogItem;
  adoption: UniversalItemAdoption;
  isNewAdoption: boolean;
}

export interface IUniversalLibraryRepository {
  searchItems(params: SearchUniversalLibraryParams): Promise<SearchUniversalLibraryResult>;
  getItemById(id: string): Promise<UniversalCatalogItem | null>;
  getCategories(params?: GetCategoriesParams): Promise<UniversalCategory[]>;
  getCategoryById(id: string): Promise<UniversalCategory | null>;
  findAdoption(companyId: string, universalItemId: string): Promise<UniversalItemAdoption | null>;
  adoptItem(params: AdoptUniversalItemParams): Promise<AdoptUniversalItemResult>;
}
