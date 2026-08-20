import { GetCategoriesParams, UniversalCategory, IUniversalLibraryRepository } from "../../domain";

export class GetUniversalTaxonomy {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(params: GetCategoriesParams = {}): Promise<UniversalCategory[]> {
    return this.repository.getCategories({
      parentId: params.parentId,
      search: params.search?.trim() || undefined,
      isActive: params.isActive ?? true,
    });
  }
}
