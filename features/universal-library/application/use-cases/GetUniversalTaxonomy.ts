import {
  DEFAULT_UNIVERSAL_TAXONOMY_LIMIT,
  GetCategoriesParams,
  UniversalCategory,
  IUniversalLibraryRepository,
  MAX_UNIVERSAL_TAXONOMY_LIMIT,
} from "../../domain";

export class GetUniversalTaxonomy {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(params: GetCategoriesParams = {}): Promise<UniversalCategory[]> {
    return this.repository.getCategories({
      parentId: params.parentId,
      search: params.search?.trim() || undefined,
      isActive: params.isActive ?? true,
      limit: Math.max(
        1,
        Math.min(
          params.limit ?? DEFAULT_UNIVERSAL_TAXONOMY_LIMIT,
          MAX_UNIVERSAL_TAXONOMY_LIMIT
        )
      ),
    });
  }
}
