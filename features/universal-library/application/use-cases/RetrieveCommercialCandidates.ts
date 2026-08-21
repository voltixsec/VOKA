import type { CatalogItemType } from "../../../catalog";
import {
  CommercialCandidate,
  CommercialRankingService,
  IHybridRetrievalRepository,
} from "../../domain";

export const DEFAULT_HYBRID_RETRIEVAL_LIMIT = 20;
export const MAX_HYBRID_RETRIEVAL_LIMIT = 50;

export interface RetrieveCommercialCandidatesInput {
  companyId: string;
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  locale?: "ar" | "en";
  limit?: number;
  isActive?: boolean;
}

export interface RetrieveCommercialCandidatesOutput {
  candidates: CommercialCandidate[];
  meta: {
    totalCandidates: number;
    limit: number;
  };
}

export class RetrieveCommercialCandidates {
  private readonly rankingService: CommercialRankingService;

  constructor(private readonly repository: IHybridRetrievalRepository) {
    this.rankingService = new CommercialRankingService();
  }

  public async execute(
    input: RetrieveCommercialCandidatesInput
  ): Promise<RetrieveCommercialCandidatesOutput> {
    if (!input.companyId?.trim()) {
      throw new Error("companyId is required for commercial candidate retrieval.");
    }

    const rawLimit = input.limit ?? DEFAULT_HYBRID_RETRIEVAL_LIMIT;
    const boundedLimit = Math.max(1, Math.min(rawLimit, MAX_HYBRID_RETRIEVAL_LIMIT));
    const oversampleLimit = Math.min(boundedLimit * 2, 100);
    const isActive = input.isActive ?? true;

    // Fetch initial candidate batches in parallel
    const [rawCatalogCandidates, rawUniversalCandidates] = await Promise.all([
      this.repository.fetchCatalogCandidates({
        companyId: input.companyId,
        query: input.query,
        type: input.type,
        categoryId: input.categoryId,
        isActive,
        limit: oversampleLimit,
      }),
      this.repository.fetchUniversalCandidates({
        query: input.query,
        type: input.type,
        categoryId: input.categoryId,
        manufacturerId: input.manufacturerId,
        brandId: input.brandId,
        isActive,
        limit: oversampleLimit,
      }),
    ]);

    // Gather IDs for adoption lookup
    const catalogItemIds = rawCatalogCandidates
      .map((c) => c.linkedCatalogItemId!)
      .filter(Boolean);
    const universalItemIds = rawUniversalCandidates
      .map((u) => u.linkedUniversalItemId!)
      .filter(Boolean);

    // Fetch adoption links for company
    const adoptions = await this.repository.fetchAdoptions(
      input.companyId,
      universalItemIds,
      catalogItemIds
    );

    const universalToCatalogMap = new Map<string, string>();
    const catalogToUniversalMap = new Map<string, string>();

    for (const adoption of adoptions) {
      universalToCatalogMap.set(adoption.universalItemId, adoption.catalogItemId);
      catalogToUniversalMap.set(adoption.catalogItemId, adoption.universalItemId);
    }

    // Identify adopted CatalogItems that were not in initial Catalog search result
    const catalogCandidateMap = new Map<string, CommercialCandidate>();
    for (const catCandidate of rawCatalogCandidates) {
      if (catCandidate.linkedCatalogItemId) {
        catalogCandidateMap.set(catCandidate.linkedCatalogItemId, catCandidate);
      }
    }

    const missingCatalogIdsToFetch: string[] = [];
    for (const univCandidate of rawUniversalCandidates) {
      const uId = univCandidate.linkedUniversalItemId;
      if (uId && universalToCatalogMap.has(uId)) {
        const catId = universalToCatalogMap.get(uId)!;
        if (!catalogCandidateMap.has(catId)) {
          missingCatalogIdsToFetch.push(catId);
        }
      }
    }

    if (missingCatalogIdsToFetch.length > 0) {
      const fetchedMissing = await this.repository.fetchCatalogCandidatesByIds(
        input.companyId,
        missingCatalogIdsToFetch
      );
      for (const fetched of fetchedMissing) {
        if (fetched.linkedCatalogItemId) {
          // Verify active state if required
          if (!isActive || (isActive && fetched.isActive)) {
            catalogCandidateMap.set(fetched.linkedCatalogItemId, fetched);
          }
        }
      }
    }

    // Score all catalog candidates
    const rankingParams = {
      query: input.query,
      type: input.type,
      categoryId: input.categoryId,
      manufacturerId: input.manufacturerId,
      brandId: input.brandId,
    };

    const scoredCatalogCandidates: CommercialCandidate[] = [];
    for (const catCand of catalogCandidateMap.values()) {
      const { score, matchReasons } = this.rankingService.calculateScore(catCand, rankingParams);

      const linkedUnivId = catalogToUniversalMap.get(catCand.linkedCatalogItemId!);
      scoredCatalogCandidates.push({
        ...catCand,
        score,
        matchReasons,
        isAdopted: Boolean(linkedUnivId),
        linkedUniversalItemId: linkedUnivId ?? null,
      });
    }

    // Score all universal candidates and handle adoption collapse
    const catalogCandidateByCatalogId = new Map<string, CommercialCandidate>();
    for (const c of scoredCatalogCandidates) {
      catalogCandidateByCatalogId.set(c.linkedCatalogItemId!, c);
    }

    const unadoptedUniversalCandidates: CommercialCandidate[] = [];

    for (const univCand of rawUniversalCandidates) {
      const uId = univCand.linkedUniversalItemId!;
      const { score, matchReasons } = this.rankingService.calculateScore(univCand, rankingParams);

      if (universalToCatalogMap.has(uId)) {
        // Universal item is adopted! Collapse to tenant CatalogItem candidate
        const catId = universalToCatalogMap.get(uId)!;
        const tenantCand = catalogCandidateByCatalogId.get(catId);

        if (tenantCand) {
          tenantCand.isAdopted = true;
          tenantCand.linkedUniversalItemId = uId;
          if (score > tenantCand.score) {
            tenantCand.score = score;
          }
          tenantCand.matchReasons = Array.from(
            new Set([...tenantCand.matchReasons, ...matchReasons])
          );
        }
        // Suppress univCand (do not push to unadoptedUniversalCandidates)
      } else {
        unadoptedUniversalCandidates.push({
          ...univCand,
          score,
          matchReasons,
          isAdopted: false,
        });
      }
    }

    // Combine collapsed tenant candidates + unadopted Universal candidates
    const combinedPool = [
      ...Array.from(catalogCandidateByCatalogId.values()),
      ...unadoptedUniversalCandidates,
    ];

    // Sort deterministically
    const sorted = this.rankingService.sortCandidates(combinedPool);

    // Limit output to bounded limit
    const finalCandidates = sorted.slice(0, boundedLimit);

    return {
      candidates: finalCandidates,
      meta: {
        totalCandidates: combinedPool.length,
        limit: boundedLimit,
      },
    };
  }
}
