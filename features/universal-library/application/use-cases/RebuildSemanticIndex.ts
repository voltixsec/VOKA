import { IEmbeddingProvider } from "../../domain/embeddings/EmbeddingProvider";
import { SemanticVectorService } from "../../domain/embeddings/SemanticVectorService";
import { DeterministicFakeEmbeddingProvider } from "../../domain/embeddings/DeterministicFakeEmbeddingProvider";

export interface UniversalCatalogItemForIndexing {
  id: string;
  name: string;
  aliases?: string[];
  manufacturerName?: string | null;
  brandName?: string | null;
  modelNumber?: string | null;
  categoryName?: string | null;
  isActive: boolean;
}

export interface RebuildSemanticIndexInput {
  items: UniversalCatalogItemForIndexing[];
}

export interface IndexedSemanticItem {
  itemId: string;
  searchableText: string;
  embedding: number[];
  isActive: boolean;
}

export interface RebuildSemanticIndexOutput {
  indexedCount: number;
  failedCount: number;
  indexedItems: IndexedSemanticItem[];
}

export class RebuildSemanticIndex {
  private readonly embeddingProvider: IEmbeddingProvider;

  constructor(embeddingProvider?: IEmbeddingProvider) {
    this.embeddingProvider = embeddingProvider ?? new DeterministicFakeEmbeddingProvider();
  }

  public async execute(input: RebuildSemanticIndexInput): Promise<RebuildSemanticIndexOutput> {
    const indexedItems: IndexedSemanticItem[] = [];
    let failedCount = 0;

    for (const item of input.items) {
      if (!item.isActive) {
        continue; // Inactive items cannot be indexed or returned
      }

      try {
        const searchableText = SemanticVectorService.buildSearchableText({
          name: item.name,
          aliases: item.aliases,
          manufacturerName: item.manufacturerName,
          brandName: item.brandName,
          modelNumber: item.modelNumber,
          categoryName: item.categoryName,
        });

        const embedding = await this.embeddingProvider.embed(searchableText);

        indexedItems.push({
          itemId: item.id,
          searchableText,
          embedding,
          isActive: true,
        });
      } catch {
        // Semantic indexing failure does not block canonical operation
        failedCount++;
      }
    }

    return {
      indexedCount: indexedItems.length,
      failedCount,
      indexedItems,
    };
  }
}
