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
    const companyId = input.companyId?.trim();
    if (!companyId) {
      throw new Error("companyId is required for commercial candidate retrieval.");
    }

    const rawLimit = input.limit ?? DEFAULT_HYBRID_RETRIEVAL_LIMIT;
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_HYBRID_RETRIEVAL_LIMIT) {
      throw new Error(`limit must be an integer between 1 and ${MAX_HYBRID_RETRIEVAL_LIMIT}.`);
    }
    const boundedLimit = rawLimit;
    const oversampleLimit = Math.min(boundedLimit * 2, 100);
    if (input.isActive === false) {
      throw new Error("Commercial retrieval only returns active candidates.");
    }
    const isActive = true;
    const query = input.query?.normalize("NFC").replace(/\s+/g, " ").trim() || undefined;
    const universalOnlyFilter = Boolean(input.manufacturerId || input.brandId);

    // Fetch initial candidate batches in parallel
    const [rawCatalogCandidates, rawUniversalCandidates] = await Promise.all([
      universalOnlyFilter ? Promise.resolve([]) : this.repository.fetchCatalogCandidates({
        companyId,
        query,
        type: input.type,
        categoryId: input.categoryId,
        isActive,
        limit: oversampleLimit,
      }),
      this.repository.fetchUniversalCandidates({
        query,
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
      companyId,
      universalItemIds,
      catalogItemIds
    );

    const universalToCatalogMap = new Map<string, string>();
    const catalogToUniversalMap = new Map<string, string>();

    for (const adoption of adoptions) {
      if (adoption.companyId !== companyId) continue;
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
        companyId,
        [...new Set(missingCatalogIdsToFetch)].slice(0, oversampleLimit)
      );
      for (const fetched of fetchedMissing) {
        if (fetched.linkedCatalogItemId) {
          // Verify active state if required
          if (fetched.isActive === isActive) {
            catalogCandidateMap.set(fetched.linkedCatalogItemId, fetched);
          }
        }
      }
    }

    // Score all catalog candidates
    const rankingParams = {
      query,
      type: input.type,
      categoryId: input.categoryId,
      manufacturerId: input.manufacturerId,
      brandId: input.brandId,
    };

    const scoredCatalogCandidates: CommercialCandidate[] = [];
    for (const rawCatCand of catalogCandidateMap.values()) {
      const catCand = this.localizeCandidate(rawCatCand, input.locale);
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

    for (const rawUnivCand of rawUniversalCandidates) {
      const univCand = this.localizeCandidate(rawUnivCand, input.locale);
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
        } else {
          // A stale or cross-tenant-inconsistent adoption must never hide a
          // globally discoverable candidate or collapse to foreign data.
          unadoptedUniversalCandidates.push({
            ...univCand,
            score,
            matchReasons,
            isAdopted: false,
            linkedCatalogItemId: null,
          });
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

  private localizeCandidate(candidate: CommercialCandidate, locale?: "ar" | "en"): CommercialCandidate {
    const localizedName = locale === "ar" ? candidate.nameAr : locale === "en" ? candidate.nameEn : null;
    return localizedName?.trim()
      ? { ...candidate, displayName: localizedName.trim() }
      : { ...candidate };
  }
}
