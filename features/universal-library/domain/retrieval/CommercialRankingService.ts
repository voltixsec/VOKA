import {
  CommercialCandidate,
  MatchReason,
} from "./CommercialCandidate";
import type { CatalogItemType } from "../../../catalog";

export interface RankingParams {
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  semanticScore?: number; // Optional semantic similarity score 0.0 - 1.0
}

export class CommercialRankingService {
  /**
   * Calculates score and match reasons for a given candidate based on query, filters, and optional semantic similarity.
   */
  public calculateScore(
    candidate: Omit<CommercialCandidate, "score" | "matchReasons"> & {
      score?: number;
      matchReasons?: MatchReason[];
    },
    params: RankingParams = {}
  ): { score: number; matchReasons: MatchReason[] } {
    let lexicalScore = 0;
    const matchReasons = new Set<MatchReason>();

    const query = params.query?.trim().toLowerCase();

    if (query) {
      // 1. Exact Code / SKU Match
      const codeMatch =
        candidate.code?.trim().toLowerCase() === query ||
        candidate.sku?.trim().toLowerCase() === query;
      if (codeMatch) {
        lexicalScore = Math.max(lexicalScore, 10_000);
        matchReasons.add("EXACT_CODE");
      }

      // 2. Exact Identifier / Barcode Match
      const barcodeMatch = candidate.barcode?.trim().toLowerCase() === query;
      const identifierQueries = new Set([
        query,
        query.replace(/[\s-]+/g, ""),
        query.replace(/\s+/g, " ").toUpperCase(),
      ]);
      const identifierMatch = candidate.identifiers.some((id) =>
        identifierQueries.has((id.normalizedValue || id.value).trim()) ||
        identifierQueries.has((id.normalizedValue || id.value).trim().toLowerCase())
      );
      if (barcodeMatch || identifierMatch) {
        lexicalScore = Math.max(lexicalScore, 9_000);
        matchReasons.add("EXACT_IDENTIFIER");
      }

      // 3. Exact Model Match
      const modelMatch =
        candidate.modelNumber?.trim().toLowerCase() === query;
      if (modelMatch) {
        lexicalScore = Math.max(lexicalScore, 8_000);
        matchReasons.add("EXACT_MODEL");
      }

      // 4. Exact Name Match
      const exactNameMatch =
        candidate.displayName.trim().toLowerCase() === query ||
        candidate.nameAr?.trim().toLowerCase() === query ||
        candidate.nameEn?.trim().toLowerCase() === query;
      if (exactNameMatch) {
        lexicalScore = Math.max(lexicalScore, 7_000);
        matchReasons.add("EXACT_NAME");
      }

      // 5. Alias Match
      const aliasExact = candidate.aliases?.some(
        (alias) => alias.trim().toLowerCase() === query
      );
      const aliasPartial = candidate.aliases?.some(
        (alias) => alias.trim().toLowerCase().includes(query)
      );

      if (aliasExact) {
        lexicalScore = Math.max(lexicalScore, 6_000);
        matchReasons.add("ALIAS_MATCH");
      } else if (aliasPartial) {
        lexicalScore = Math.max(lexicalScore, 5_000);
        matchReasons.add("ALIAS_MATCH");
      }

      // 6. Partial Name / Description Match
      const partialNameMatch =
        candidate.displayName.toLowerCase().includes(query) ||
        candidate.nameAr?.toLowerCase().includes(query) ||
        candidate.nameEn?.toLowerCase().includes(query) ||
        candidate.description?.toLowerCase().includes(query) ||
        candidate.descriptionAr?.toLowerCase().includes(query) ||
        candidate.descriptionEn?.toLowerCase().includes(query);

      if (partialNameMatch && !exactNameMatch) {
        lexicalScore = Math.max(lexicalScore, 4_000);
        matchReasons.add("PARTIAL_NAME_MATCH");
      }
    } else {
      // When query is empty, base relevancy on structural fit
      lexicalScore = 1_000;
    }

    let structuralScore = 0;

    // Category Proximity Signal
    if (params.categoryId && candidate.categoryId === params.categoryId) {
      structuralScore += 20;
      matchReasons.add("CATEGORY_MATCH");
    }

    // Type Match Signal
    if (params.type && candidate.type === params.type) {
      structuralScore += 10;
      matchReasons.add("TYPE_MATCH");
    }

    if (params.manufacturerId && candidate.manufacturerId === params.manufacturerId) {
      structuralScore += 20;
      matchReasons.add("MANUFACTURER_MATCH");
    }

    if (params.brandId && candidate.brandId === params.brandId) {
      structuralScore += 20;
      matchReasons.add("BRAND_MATCH");
    }

    // Company Catalog Priority Signal
    if (candidate.origin === "COMPANY_CATALOG") {
      structuralScore += 100;
      matchReasons.add("COMPANY_CATALOG_PRIORITY");
    }

    // Optional Semantic Similarity Signal
    // Bounded between 0 and 1000 points so semantic score NEVER overrides strong exact identity evidence
    // (exact code = 10k, exact identifier = 9k, exact model = 8k, exact name = 7k)
    let boundedSemanticScore = 0;
    if (params.semanticScore !== undefined && params.semanticScore > 0) {
      boundedSemanticScore = Math.min(Math.max(params.semanticScore, 0), 1) * 1_000;
      if (boundedSemanticScore > 100) {
        matchReasons.add("ALIAS_MATCH"); // signal semantic match
      }
    }

    return {
      score: lexicalScore + structuralScore + boundedSemanticScore,
      matchReasons: Array.from(matchReasons),
    };
  }

  /**
   * Sorts candidates deterministically by:
   * 1. score DESC
   * 2. origin (COMPANY_CATALOG before UNIVERSAL_LIBRARY)
   * 3. displayName ASC (locale-aware)
   * 4. id ASC
   */
  public sortCandidates(candidates: CommercialCandidate[]): CommercialCandidate[] {
    return [...candidates].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.origin !== b.origin) {
        return a.origin === "COMPANY_CATALOG" ? -1 : 1;
      }
      const aName = a.displayName.normalize("NFC");
      const bName = b.displayName.normalize("NFC");
      const nameCompare = aName < bName ? -1 : aName > bName ? 1 : 0;
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
}
