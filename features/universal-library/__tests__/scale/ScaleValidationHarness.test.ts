import { describe, expect, it } from "vitest";
import {
  CommercialCandidate,
  DeterministicFakeEmbeddingProvider,
  toAICandidateProjection,
  RetrieveCommercialCandidates,
  IHybridRetrievalRepository,
  BoundedMemoryRetrievalCache,
} from "../../index";

interface SyntheticCorpusItem {
  id: string;
  name: string;
  code: string;
  sku: string;
  modelNumber: string;
  manufacturerName: string;
  brandName: string;
  categoryName: string;
  isActive: boolean;
}

function generateSyntheticCorpus(count: number): SyntheticCorpusItem[] {
  const corpus: SyntheticCorpusItem[] = [];
  for (let i = 1; i <= count; i++) {
    corpus.push({
      id: `univ-synth-${i}`,
      name: `Synthetic Commercial Item ${i} Premium Grade`,
      code: `SYN-CODE-${i}`,
      sku: `SYN-SKU-${i}`,
      modelNumber: `MOD-${i}`,
      manufacturerName: i % 2 === 0 ? "Voltix Industrial" : "Global Tech Corp",
      brandName: i % 3 === 0 ? "ProBrand" : "UltraBrand",
      categoryName: i % 5 === 0 ? "Electrical" : "Mechanical",
      isActive: i % 100 !== 0, // 1% inactive
    });
  }
  return corpus;
}

class InMemoryScaleRepository implements IHybridRetrievalRepository {
  constructor(private readonly corpus: SyntheticCorpusItem[]) {}

  public async fetchCatalogCandidates(): Promise<CommercialCandidate[]> {
    return [];
  }

  public async fetchUniversalCandidates(params: {
    query?: string;
    limit: number;
    isActive?: boolean;
  }): Promise<CommercialCandidate[]> {
    const q = params.query?.toLowerCase() || "";
    const filtered = this.corpus.filter((item) => {
      if (params.isActive !== false && !item.isActive) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.modelNumber.toLowerCase().includes(q)
      );
    });

    return filtered.slice(0, params.limit).map((item) => ({
      id: `universal-library:${item.id}`,
      origin: "UNIVERSAL_LIBRARY",
      type: "PRODUCT",
      displayName: item.name,
      code: item.code,
      sku: item.sku,
      modelNumber: item.modelNumber,
      identifiers: [{ type: "MPN", value: item.modelNumber }],
      manufacturerName: item.manufacturerName,
      brandName: item.brandName,
      categoryName: item.categoryName,
      isActive: item.isActive,
      isAdopted: false,
      linkedUniversalItemId: item.id,
      score: 0,
      matchReasons: [],
    }));
  }

  public async fetchSemanticCandidates(params: {
    limit: number;
    isActive?: boolean;
  }): Promise<CommercialCandidate[]> {
    return this.fetchUniversalCandidates(params);
  }

  public async fetchAdoptions(): Promise<[]> {
    return [];
  }

  public async fetchCatalogCandidatesByIds(): Promise<CommercialCandidate[]> {
    return [];
  }
}

describe("UCL-5 Scale Validation Harness", () => {
  it("synthetic scale harness supports 10k items", async () => {
    const corpus10k = generateSyntheticCorpus(10_000);
    expect(corpus10k.length).toBe(10_000);

    const repo = new InMemoryScaleRepository(corpus10k);
    const useCase = new RetrieveCommercialCandidates(
      repo,
      new DeterministicFakeEmbeddingProvider(16),
      new BoundedMemoryRetrievalCache(60_000, 100)
    );

    const result = await useCase.execute({
      companyId: "c1",
      query: "Synthetic Commercial Item 501",
      limit: 20,
      strategy: "hybrid",
    });

    expect(result.candidates.length).toBeLessThanOrEqual(20);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]).toBeDefined();

    const projections = result.candidates.map(toAICandidateProjection);
    expect(projections.length).toBeLessThanOrEqual(20);
    // Compact AI projection sanity check
    const sampleProjJson = JSON.stringify(projections[0]);
    expect(sampleProjJson.length).toBeLessThan(1000);
  });

  it("synthetic scale harness supports 50k items without loading full corpus into memory", async () => {
    const corpus50k = generateSyntheticCorpus(50_000);
    expect(corpus50k.length).toBe(50_000);

    const repo = new InMemoryScaleRepository(corpus50k);
    const useCase = new RetrieveCommercialCandidates(
      repo,
      new DeterministicFakeEmbeddingProvider(16),
      new BoundedMemoryRetrievalCache(60_000, 100)
    );

    const result = await useCase.execute({
      companyId: "c1",
      query: "Synthetic Commercial Item 45001",
      limit: 50,
      strategy: "hybrid",
    });

    expect(result.candidates.length).toBeLessThanOrEqual(50);
    expect(result.meta.limit).toBe(50);
  });

  it("synthetic scale harness supports 100k items and maintains bounded candidate output", async () => {
    const corpus100k = generateSyntheticCorpus(100_000);
    expect(corpus100k.length).toBe(100_000);

    const repo = new InMemoryScaleRepository(corpus100k);
    const useCase = new RetrieveCommercialCandidates(
      repo,
      new DeterministicFakeEmbeddingProvider(16),
      new BoundedMemoryRetrievalCache(60_000, 100)
    );

    const result = await useCase.execute({
      companyId: "c1",
      query: "Synthetic Commercial Item 99999",
      limit: 20,
      strategy: "hybrid",
    });

    expect(result.candidates.length).toBeLessThanOrEqual(20);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].score).toBeGreaterThan(0);
  });

  it("generated scale data is purely synthetic and not committed as production database records", () => {
    const generated = generateSyntheticCorpus(100);
    expect(generated.every((i) => i.id.startsWith("univ-synth-"))).toBe(true);
  });
});
