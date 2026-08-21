import {
  DEFAULT_UNIVERSAL_SEARCH_LIMIT,
  IUniversalLibraryRepository,
  MAX_UNIVERSAL_SEARCH_LIMIT,
  UniversalBrand,
} from "../../domain";

export interface SearchUniversalBrandsInput {
  query?: string;
  manufacturerId?: string;
  isActive?: boolean;
  limit?: number;
}

export class SearchUniversalBrands {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(input: SearchUniversalBrandsInput = {}): Promise<UniversalBrand[]> {
    const rawLimit = input.limit ?? DEFAULT_UNIVERSAL_SEARCH_LIMIT;
    const boundedLimit = Math.max(1, Math.min(rawLimit, MAX_UNIVERSAL_SEARCH_LIMIT));

    return this.repository.searchBrands({
      query: input.query?.trim() || undefined,
      manufacturerId: input.manufacturerId,
      isActive: input.isActive ?? true,
      limit: boundedLimit,
    });
  }
}
