import { describe, expect, it } from "vitest";
import {
  BoundedMemoryRetrievalCache,
  CommercialCandidate,
  DeterministicFakeEmbeddingProvider,
  IHybridRetrievalRepository,
  RetrieveCommercialCandidates,
  toAICandidateProjection,
} from "../../index";

/**
 * Contract-level scale harness. It models an indexed store with a declared corpus
 * cardinality and materializes only the bounded result window. It intentionally
 * does not claim to benchmark PostgreSQL or allocate/scan the whole corpus.
 */
class SyntheticIndexedScaleRepository implements IHybridRetrievalRepository {
  public maxRequestedLimit = 0;
  public materializedCandidates = 0;

  constructor(public readonly corpusSize: number) {}

  public async fetchCatalogCandidates(): Promise<CommercialCandidate[]> {
    return [];
  }

  public async fetchUniversalCandidates(params: {
    query?: string;
    limit: number;
    isActive?: boolean;
  }): Promise<CommercialCandidate[]> {
    this.maxRequestedLimit = Math.max(this.maxRequestedLimit, params.limit);
    const requestedId = Number(params.query?.match(/(\d+)$/)?.[1] ?? 1);
    const firstId = Math.min(Math.max(requestedId, 1), this.corpusSize);
    const count = Math.min(params.limit, this.corpusSize);
    const candidates = Array.from({ length: count }, (_, offset) =>
      this.makeCandidate(((firstId - 1 + offset) % this.corpusSize) + 1)
    );
    this.materializedCandidates += candidates.length;
    return candidates;
  }

  public async fetchSemanticCandidates(params: {
    limit: number;
    isActive?: boolean;
  }): Promise<CommercialCandidate[]> {
    return this.fetchUniversalCandidates({ limit: params.limit, isActive: params.isActive });
  }

  public async fetchAdoptions(): Promise<[]> {
    return [];
  }

  public async fetchCatalogCandidatesByIds(): Promise<CommercialCandidate[]> {
    return [];
  }

  private makeCandidate(id: number): CommercialCandidate {
    return {
      id: `universal-library:univ-synth-${id}`,
      origin: "UNIVERSAL_LIBRARY",
      type: "PRODUCT",
      displayName: `Synthetic Commercial Item ${id}`,
      modelNumber: `MOD-${id}`,
      identifiers: [{ type: "MPN", value: `MOD-${id}` }],
      manufacturerName: id % 2 === 0 ? "Voltix Industrial" : "Global Tech Corp",
      brandName: id % 3 === 0 ? "ProBrand" : "UltraBrand",
      categoryName: id % 5 === 0 ? "Electrical" : "Mechanical",
      isActive: true,
      isAdopted: false,
      linkedUniversalItemId: `univ-synth-${id}`,
      score: 0,
      matchReasons: [],
    };
  }
}

describe("UCL-5 synthetic bounded-retrieval scale contract", () => {
  it.each([
    [10_000, 501, 20],
    [50_000, 45_001, 50],
    [100_000, 99_999, 20],
  ])("keeps retrieval bounded for a declared %,i-item corpus", async (corpusSize, targetId, limit) => {
    const repo = new SyntheticIndexedScaleRepository(corpusSize);
    const useCase = new RetrieveCommercialCandidates(
      repo,
      new DeterministicFakeEmbeddingProvider(16),
      new BoundedMemoryRetrievalCache(60_000, 100)
    );

    const result = await useCase.execute({
      companyId: "synthetic-tenant",
      query: `Synthetic Commercial Item ${targetId}`,
      limit,
      strategy: "hybrid",
    });

    expect(repo.corpusSize).toBe(corpusSize);
    expect(repo.maxRequestedLimit).toBeLessThanOrEqual(100);
    expect(repo.materializedCandidates).toBeLessThanOrEqual(200);
    expect(result.candidates.length).toBeLessThanOrEqual(limit);
    expect(result.candidates[0]).toBeDefined();
    expect(JSON.stringify(toAICandidateProjection(result.candidates[0])).length).toBeLessThan(1000);
  });

  it("uses synthetic identities only", async () => {
    const repo = new SyntheticIndexedScaleRepository(100_000);
    const candidates = await repo.fetchUniversalCandidates({ limit: 10 });
    expect(candidates.every((candidate) => candidate.id.includes("univ-synth-"))).toBe(true);
  });
});
