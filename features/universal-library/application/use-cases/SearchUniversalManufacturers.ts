import {
  DEFAULT_UNIVERSAL_SEARCH_LIMIT,
  IUniversalLibraryRepository,
  MAX_UNIVERSAL_SEARCH_LIMIT,
  UniversalManufacturer,
} from "../../domain";

export interface SearchUniversalManufacturersInput {
  query?: string;
  isActive?: boolean;
  limit?: number;
}

export class SearchUniversalManufacturers {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(
    input: SearchUniversalManufacturersInput = {}
  ): Promise<UniversalManufacturer[]> {
    const rawLimit = input.limit ?? DEFAULT_UNIVERSAL_SEARCH_LIMIT;
    const boundedLimit = Math.max(1, Math.min(rawLimit, MAX_UNIVERSAL_SEARCH_LIMIT));

    return this.repository.searchManufacturers({
      query: input.query?.trim() || undefined,
      isActive: input.isActive ?? true,
      limit: boundedLimit,
    });
  }
}
