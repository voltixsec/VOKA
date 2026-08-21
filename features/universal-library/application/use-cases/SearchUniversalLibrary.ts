import { CatalogItemType } from "../../../catalog";
import type { UniversalIdentifierType } from "@/lib/generated/prisma/client";
import {
  DEFAULT_UNIVERSAL_SEARCH_LIMIT,
  IUniversalLibraryRepository,
  MAX_UNIVERSAL_SEARCH_LIMIT,
  SearchUniversalLibraryResult,
} from "../../domain";

export interface SearchUniversalLibraryInput {
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

export class SearchUniversalLibrary {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(input: SearchUniversalLibraryInput = {}): Promise<SearchUniversalLibraryResult> {
    const rawLimit = input.limit ?? DEFAULT_UNIVERSAL_SEARCH_LIMIT;
    const boundedLimit = Math.max(1, Math.min(rawLimit, MAX_UNIVERSAL_SEARCH_LIMIT));

    return this.repository.searchItems({
      query: input.query?.trim() || undefined,
      type: input.type,
      categoryId: input.categoryId,
      manufacturerId: input.manufacturerId,
      brandId: input.brandId,
      familyId: input.familyId,
      modelNumber: input.modelNumber?.trim() || undefined,
      identifierType: input.identifierType,
      identifierValue: input.identifierValue?.trim() || undefined,
      identifierManufacturerId: input.identifierManufacturerId?.trim() || undefined,
      identifierSource: input.identifierSource?.trim() || undefined,
      isActive: input.isActive ?? true,
      limit: boundedLimit,
      cursor: input.cursor,
    });
  }
}
