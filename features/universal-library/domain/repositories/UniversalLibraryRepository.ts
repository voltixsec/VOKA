import { CatalogItem, CatalogItemType } from "../../../catalog";
import type { UniversalIdentifierType } from "@/lib/generated/prisma/client";
import {
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalManufacturer,
  UniversalBrand,
} from "../entities";

export const MAX_UNIVERSAL_SEARCH_LIMIT = 50;
export const DEFAULT_UNIVERSAL_SEARCH_LIMIT = 20;
export const MAX_UNIVERSAL_TAXONOMY_LIMIT = 100;
export const DEFAULT_UNIVERSAL_TAXONOMY_LIMIT = 50;

export interface SearchUniversalLibraryParams {
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  familyId?: string;
  modelNumber?: string;
  identifierType?: UniversalIdentifierType;
  identifierValue?: string;
  identifierManufacturerId?: string;
  identifierSource?: string;
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

export interface SearchManufacturersParams {
  query?: string;
  isActive?: boolean;
  limit?: number;
}

export interface SearchBrandsParams {
  query?: string;
  manufacturerId?: string;
  isActive?: boolean;
  limit?: number;
}

export interface LookupIdentifierParams {
  identifierType: UniversalIdentifierType;
  value: string;
  manufacturerId?: string;
  source?: string;
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
  searchManufacturers(params?: SearchManufacturersParams): Promise<UniversalManufacturer[]>;
  getManufacturerById(id: string): Promise<UniversalManufacturer | null>;
  searchBrands(params?: SearchBrandsParams): Promise<UniversalBrand[]>;
  getBrandById(id: string): Promise<UniversalBrand | null>;
  lookupByIdentifier(params: LookupIdentifierParams): Promise<UniversalCatalogItem | null>;
  findAdoption(companyId: string, universalItemId: string): Promise<UniversalItemAdoption | null>;
  adoptItem(params: AdoptUniversalItemParams): Promise<AdoptUniversalItemResult>;
}
