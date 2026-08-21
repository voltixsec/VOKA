import { CatalogItemType } from "../../../catalog";
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
      isActive: input.isActive ?? true,
      limit: boundedLimit,
      cursor: input.cursor,
    });
  }
}
