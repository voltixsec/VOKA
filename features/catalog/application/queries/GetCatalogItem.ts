import type { CatalogItem } from '../../domain/entities';
import type { CatalogItemRepository } from '../../domain/repositories';

export type GetCatalogItemInput = {
  id: string;
  companyId: string;
};

export class GetCatalogItem {
  constructor(
    private readonly catalogItemRepository: CatalogItemRepository,
  ) {}

  public async execute(
    input: GetCatalogItemInput,
  ): Promise<CatalogItem | null> {
    return this.catalogItemRepository.findByIdAndCompanyId(
      input.id,
      input.companyId,
    );
  }
}
