import type { CatalogItemType } from "../../../catalog";
import {
  CommercialCandidate,
  CommercialRankingService,
  IHybridRetrievalRepository,
  IEmbeddingProvider,
  IRetrievalCache,
  RetrievalObservability,
  SearchStrategy,
  SemanticVectorService,
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
  strategy?: SearchStrategy;
}

export interface RetrieveCommercialCandidatesOutput {
  candidates: CommercialCandidate[];
  meta: {
    totalCandidates: number;
    limit: number;
    strategy: SearchStrategy;
    cacheHit?: boolean;
  };
}

export class RetrieveCommercialCandidates {
  private readonly rankingService: CommercialRankingService;
  private readonly embeddingProvider?: IEmbeddingProvider;
  private readonly cache?: IRetrievalCache<RetrieveCommercialCandidatesOutput>;

  constructor(
    private readonly repository: IHybridRetrievalRepository,
    embeddingProvider?: IEmbeddingProvider,
    cache?: IRetrievalCache<RetrieveCommercialCandidatesOutput>
  ) {
    this.rankingService = new CommercialRankingService();
    this.embeddingProvider = embeddingProvider;
    // Tenant commercial candidates include mutable price/unit data. Caching is
    // opt-in so production callers must pair it with an explicit invalidation policy.
    this.cache = cache;
  }

  public async execute(
    input: RetrieveCommercialCandidatesInput
  ): Promise<RetrieveCommercialCandidatesOutput> {
    const startTime = Date.now();
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

    const requestedStrategy: SearchStrategy = input.strategy ?? "hybrid";
    if (requestedStrategy !== "lexical" && requestedStrategy !== "hybrid") {
      throw new Error("Invalid retrieval strategy specified.");
    }

    const query = input.query?.normalize("NFC").replace(/\s+/g, " ").trim() || undefined;
    if (query && query.length > 200) {
      throw new Error("query must not exceed 200 characters.");
    }

    // Check Cache
    const cacheKeyParams = {
      companyId,
      query,
      type: input.type,
      categoryId: input.categoryId,
      manufacturerId: input.manufacturerId,
      brandId: input.brandId,
      locale: input.locale,
      limit: boundedLimit,
      strategy: requestedStrategy,
    };

    let cachedResult: RetrieveCommercialCandidatesOutput | null = null;
    try {
      cachedResult = this.cache ? await this.cache.get(cacheKeyParams) : null;
    } catch {
      // A cache adapter is optional acceleration and must never break retrieval.
    }
    if (cachedResult) {
      this.recordObservability({
        tenantScoped: true,
        strategyUsed: cachedResult.meta.strategy,
        lexicalCandidateCount: 0,
        semanticCandidateCount: 0,
        finalCandidateCount: cachedResult.candidates.length,
        cacheHit: true,
        rankingSummary: {
          topScore: cachedResult.candidates[0]?.score ?? 0,
          matchReasons: cachedResult.candidates[0]?.matchReasons ?? [],
        },
        elapsedMs: Date.now() - startTime,
      });

      return {
        ...cachedResult,
        meta: {
          ...cachedResult.meta,
          cacheHit: true,
        },
      };
    }

    const universalOnlyFilter = Boolean(input.manufacturerId || input.brandId);

    let actualStrategyUsed: SearchStrategy = "lexical";
    let rawSemanticCandidates: CommercialCandidate[] = [];
    let queryEmbedding: number[] | null = null;

    // Optional Semantic Path Execution
    if (
      requestedStrategy === "hybrid" &&
      query &&
      this.embeddingProvider &&
      this.repository.fetchSemanticCandidates
    ) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(query);
        if (!SemanticVectorService.isValidEmbedding(queryEmbedding, this.embeddingProvider.dimensions)) {
          throw new Error("Embedding provider returned an invalid query vector.");
        }
        rawSemanticCandidates = (await this.repository.fetchSemanticCandidates({
          queryEmbedding,
          type: input.type,
          categoryId: input.categoryId,
          manufacturerId: input.manufacturerId,
          brandId: input.brandId,
          isActive,
          limit: oversampleLimit,
        })).slice(0, oversampleLimit);
        actualStrategyUsed = "hybrid";
      } catch {
        // Fallback gracefully to lexical search on embedding provider or index failure
        actualStrategyUsed = "lexical";
        rawSemanticCandidates = [];
      }
    }

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

    // Combine Universal candidates (deduplicating lexical + semantic if any)
    const combinedUniversalMap = new Map<string, CommercialCandidate>();
    // Lexical candidates are canonical projections and win if the semantic adapter
    // returns the same item with a thinner payload.
    for (const uCand of [...rawSemanticCandidates, ...rawUniversalCandidates]) {
      if (uCand.linkedUniversalItemId) {
        combinedUniversalMap.set(uCand.linkedUniversalItemId, uCand);
      }
    }
    const combinedUniversalCandidates = Array.from(combinedUniversalMap.values());

    // Gather IDs for adoption lookup
    const catalogItemIds = rawCatalogCandidates
      .map((c) => c.linkedCatalogItemId!)
      .filter(Boolean);
    const universalItemIds = combinedUniversalCandidates
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
    for (const univCandidate of combinedUniversalCandidates) {
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
        if (fetched.linkedCatalogItemId && fetched.isActive === isActive) {
          catalogCandidateMap.set(fetched.linkedCatalogItemId, fetched);
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

      let semanticScore: number | undefined;
      if (queryEmbedding && this.embeddingProvider && catCand.displayName) {
        try {
          const candidateEmbedding = await this.embeddingProvider.embed(catCand.displayName);
          if (!SemanticVectorService.isValidEmbedding(candidateEmbedding, this.embeddingProvider.dimensions)) {
            throw new Error("Embedding provider returned an invalid candidate vector.");
          }
          semanticScore = SemanticVectorService.cosineSimilarity(queryEmbedding, candidateEmbedding);
        } catch {
          // Candidate embedding failure falls back safely without breaking retrieval
          semanticScore = undefined;
        }
      }

      const { score, matchReasons } = this.rankingService.calculateScore(catCand, {
        ...rankingParams,
        semanticScore,
      });

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

    for (const rawUnivCand of combinedUniversalCandidates) {
      const univCand = this.localizeCandidate(rawUnivCand, input.locale);
      const uId = univCand.linkedUniversalItemId!;

      let semanticScore: number | undefined;
      if (queryEmbedding && this.embeddingProvider && univCand.displayName) {
        try {
          const candidateEmbedding = await this.embeddingProvider.embed(univCand.displayName);
          if (!SemanticVectorService.isValidEmbedding(candidateEmbedding, this.embeddingProvider.dimensions)) {
            throw new Error("Embedding provider returned an invalid candidate vector.");
          }
          semanticScore = SemanticVectorService.cosineSimilarity(queryEmbedding, candidateEmbedding);
        } catch {
          // Candidate embedding failure falls back safely without breaking retrieval
          semanticScore = undefined;
        }
      }

      const { score, matchReasons } = this.rankingService.calculateScore(univCand, {
        ...rankingParams,
        semanticScore,
      });

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
          unadoptedUniversalCandidates.push({
            ...univCand,
            score,
            matchReasons,
            isAdopted: false,
            linkedCatalogItemId: null,
          });
        }
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

    // Bounded candidate count
    const finalCandidates = sorted.slice(0, boundedLimit);

    const resultOutput: RetrieveCommercialCandidatesOutput = {
      candidates: finalCandidates,
      meta: {
        totalCandidates: combinedPool.length,
        limit: boundedLimit,
        strategy: actualStrategyUsed,
        cacheHit: false,
      },
    };

    // Save to Cache
    try {
      if (this.cache) {
        await this.cache.set(cacheKeyParams, resultOutput);
      }
    } catch {
      // A cache adapter is optional acceleration and must never break retrieval.
    }

    // Record Observability
    this.recordObservability({
      tenantScoped: true,
      strategyUsed: actualStrategyUsed,
      lexicalCandidateCount: rawCatalogCandidates.length + rawUniversalCandidates.length,
      semanticCandidateCount: rawSemanticCandidates.length,
      finalCandidateCount: finalCandidates.length,
      cacheHit: false,
      rankingSummary: {
        topScore: finalCandidates[0]?.score ?? 0,
        matchReasons: finalCandidates[0]?.matchReasons ?? [],
      },
      elapsedMs: Date.now() - startTime,
    });

    return resultOutput;
  }

  private recordObservability(
    metrics: Parameters<typeof RetrievalObservability.record>[0]
  ): void {
    try {
      RetrievalObservability.record(metrics);
    } catch {
      // Observability must never become a retrieval dependency.
    }
  }

  private localizeCandidate(candidate: CommercialCandidate, locale?: "ar" | "en"): CommercialCandidate {
    const localizedName = locale === "ar" ? candidate.nameAr : locale === "en" ? candidate.nameEn : null;
    return localizedName?.trim()
      ? { ...candidate, displayName: localizedName.trim() }
      : { ...candidate };
  }
}
