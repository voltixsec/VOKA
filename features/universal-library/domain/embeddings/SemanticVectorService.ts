export interface SearchableEntityInput {
  name: string;
  aliases?: string[];
  manufacturerName?: string | null;
  brandName?: string | null;
  modelNumber?: string | null;
  categoryName?: string | null;
  attributes?: Record<string, string | number | boolean | null | undefined>;
}

export class SemanticVectorService {
  /**
   * Constructs compact search string using only canonical Universal Library fields.
   * Strictly omits raw ingestion payloads, tenant-private pricing/tax, and historical documents.
   */
  public static buildSearchableText(entity: SearchableEntityInput): string {
    const parts: string[] = [];

    if (entity.name?.trim()) parts.push(entity.name.trim());
    if (entity.modelNumber?.trim()) parts.push(`Model: ${entity.modelNumber.trim()}`);
    if (entity.manufacturerName?.trim()) parts.push(`Manufacturer: ${entity.manufacturerName.trim()}`);
    if (entity.brandName?.trim()) parts.push(`Brand: ${entity.brandName.trim()}`);
    if (entity.categoryName?.trim()) parts.push(`Category: ${entity.categoryName.trim()}`);

    if (entity.aliases && entity.aliases.length > 0) {
      const cleanAliases = entity.aliases.map((a) => a.trim()).filter(Boolean);
      if (cleanAliases.length > 0) {
        parts.push(`Aliases: ${cleanAliases.join(", ")}`);
      }
    }

    if (entity.attributes) {
      const attrEntries = Object.entries(entity.attributes)
        .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${v}`);
      if (attrEntries.length > 0) {
        parts.push(`Attributes: ${attrEntries.join("; ")}`);
      }
    }

    return parts.join(" | ");
  }

  /**
   * Computes cosine similarity between two numeric vectors.
   * Returns a float between -1.0 and 1.0 (or 0 if vector magnitude is 0).
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
