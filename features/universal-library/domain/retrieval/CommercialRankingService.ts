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
}

export class CommercialRankingService {
  /**
   * Calculates score and match reasons for a given candidate based on query and filters.
   */
  public calculateScore(
    candidate: Omit<CommercialCandidate, "score" | "matchReasons"> & {
      score?: number;
      matchReasons?: MatchReason[];
    },
    params: RankingParams = {}
  ): { score: number; matchReasons: MatchReason[] } {
    let score = 0;
    const matchReasons = new Set<MatchReason>();

    const query = params.query?.trim().toLowerCase();

    if (query) {
      // 1. Exact Code / SKU Match
      const codeMatch =
        candidate.code?.trim().toLowerCase() === query ||
        candidate.sku?.trim().toLowerCase() === query;
      if (codeMatch) {
        score += 1000;
        matchReasons.add("EXACT_CODE");
      }

      // 2. Exact Identifier / Barcode Match
      const barcodeMatch = candidate.barcode?.trim().toLowerCase() === query;
      const identifierMatch = candidate.identifiers.some(
        (id) => id.value.trim().toLowerCase() === query
      );
      if (barcodeMatch || identifierMatch) {
        score += 950;
        matchReasons.add("EXACT_IDENTIFIER");
      }

      // 3. Exact Model Match
      const modelMatch =
        candidate.modelNumber?.trim().toLowerCase() === query;
      if (modelMatch) {
        score += 800;
        matchReasons.add("EXACT_MODEL");
      }

      // 4. Exact Name Match
      const exactNameMatch =
        candidate.displayName.trim().toLowerCase() === query ||
        candidate.nameAr?.trim().toLowerCase() === query ||
        candidate.nameEn?.trim().toLowerCase() === query;
      if (exactNameMatch) {
        score += 700;
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
        score += 500;
        matchReasons.add("ALIAS_MATCH");
      } else if (aliasPartial) {
        score += 300;
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
        score += 200;
        matchReasons.add("PARTIAL_NAME_MATCH");
      }
    } else {
      // When query is empty, base relevancy on structural fit
      score += 100;
    }

    // Category Proximity Signal
    if (params.categoryId && candidate.categoryId === params.categoryId) {
      score += 100;
      matchReasons.add("CATEGORY_MATCH");
    }

    // Type Match Signal
    if (params.type && candidate.type === params.type) {
      score += 50;
      matchReasons.add("TYPE_MATCH");
    }

    // Company Catalog Priority Signal
    if (candidate.origin === "COMPANY_CATALOG") {
      score += 100;
      matchReasons.add("COMPANY_CATALOG_PRIORITY");
    }

    return {
      score,
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
      const nameCompare = a.displayName.localeCompare(b.displayName);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.id.localeCompare(b.id);
    });
  }
}
