import { UniversalCatalogItem, IUniversalLibraryRepository } from "../../domain";

export class GetUniversalItem {
  constructor(private readonly repository: IUniversalLibraryRepository) {}

  async execute(id: string): Promise<UniversalCatalogItem | null> {
    if (!id || typeof id !== "string") {
      return null;
    }
    return this.repository.getItemById(id);
  }
}
