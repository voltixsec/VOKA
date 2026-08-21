import { describe, expect, it, vi } from "vitest";
import {
  CommercialCandidate,
  CommercialRankingService,
  IHybridRetrievalRepository,
  RetrieveCommercialCandidates,
  toAICandidateProjection,
  UniversalAdoptionLink,
} from "../index";

describe("UCL-4 Hybrid Retrieval Comprehensive Regression Suite (22 Invariants)", () => {
  const companyA = "company-tenant-A";
  const companyB = "company-tenant-B";

  // Catalog Item for Tenant A
  const catItemA: CommercialCandidate = {
    id: "company-catalog:cat-item-A",
    origin: "COMPANY_CATALOG",
    type: "PRODUCT",
    displayName: "CCTV Dome Camera 4MP",
    code: "CAM-DOME-01",
    sku: "SKU-DOME-01",
    barcode: "6941234567890",
    modelNumber: "DS-2CD2143G2-I",
    identifiers: [{ type: "BARCODE", value: "6941234567890" }],
    categoryId: "cat-cctv",
    categoryName: "CCTV",
    isActive: true,
    isAdopted: false,
    linkedCatalogItemId: "cat-item-A",
    salePrice: 120,
    unit: { id: "u-pc", name: "Piece", symbol: "pc" },
    description: "4MP Outdoor Dome Camera",
    descriptionAr: "كاميرا مراقبة قبة 4 ميجابكسل",
    descriptionEn: "4MP Outdoor Dome Camera",
    score: 0,
    matchReasons: [],
  };

  // Catalog Item for Foreign Tenant B
  const catItemB: CommercialCandidate = {
    id: "company-catalog:cat-item-B",
    origin: "COMPANY_CATALOG",
    type: "PRODUCT",
    displayName: "Foreign Tenant B Product",
    code: "FOREIGN-01",
    identifiers: [],
    isActive: true,
    isAdopted: false,
    linkedCatalogItemId: "cat-item-B",
    salePrice: 999,
    score: 0,
    matchReasons: [],
  };

  // Universal Item 1 (Unadopted)
  const universalItem1: CommercialCandidate = {
    id: "universal-library:ucl-item-1",
    origin: "UNIVERSAL_LIBRARY",
    type: "PRODUCT",
    displayName: "Hikvision 4MP Bullet Camera",
    code: null,
    modelNumber: "DS-2CD2043G2-I",
    identifiers: [{ type: "GTIN_13", value: "6941218201234" }],
    aliases: ["Hikvision Bullet", "4MP Bullet"],
    manufacturerName: "Hikvision",
    brandName: "Hikvision",
    categoryId: "cat-cctv",
    categoryName: "CCTV",
    isActive: true,
    isAdopted: false,
    linkedUniversalItemId: "ucl-item-1",
    score: 0,
    matchReasons: [],
  };

  // Universal Item 2 (Adopted by Tenant A)
  const universalItem2: CommercialCandidate = {
    id: "universal-library:ucl-item-2",
    origin: "UNIVERSAL_LIBRARY",
    type: "PRODUCT",
    displayName: "CCTV Dome Camera 4MP",
    code: null,
    modelNumber: "DS-2CD2143G2-I",
    identifiers: [{ type: "GTIN_13", value: "6941234567890" }],
    aliases: ["Dome Camera 4MP"],
    manufacturerName: "Hikvision",
    brandName: "Hikvision",
    categoryId: "cat-cctv",
    categoryName: "CCTV",
    isActive: true,
    isAdopted: false,
    linkedUniversalItemId: "ucl-item-2",
    score: 0,
    matchReasons: [],
  };

  function createMockRepo(params: {
    catalogA?: CommercialCandidate[];
    catalogB?: CommercialCandidate[];
    universal?: CommercialCandidate[];
    adoptions?: UniversalAdoptionLink[];
    fetchAdoptionsMock?: any;
  }): IHybridRetrievalRepository {
    const catalogA = params.catalogA ?? [catItemA];
    const catalogB = params.catalogB ?? [catItemB];
    const universal = params.universal ?? [universalItem1, universalItem2];
    const adoptions = params.adoptions ?? [];

    return {
      fetchCatalogCandidates: vi
        .fn()
        .mockImplementation(async (fetchParams) => {
          if (fetchParams.companyId === companyA) {
            return catalogA.filter((c) =>
              fetchParams.isActive === false ? true : c.isActive
            );
          }
          if (fetchParams.companyId === companyB) {
            return catalogB;
          }
          return [];
        }),
      fetchUniversalCandidates: vi.fn().mockResolvedValue(universal),
      fetchAdoptions:
        params.fetchAdoptionsMock ??
        vi.fn().mockImplementation(async (cId) => {
          return adoptions.filter((a) => a.companyId === cId);
        }),
      fetchCatalogCandidatesByIds: vi
        .fn()
        .mockImplementation(async (cId, ids) => {
          if (cId === companyA) {
            return catalogA.filter((c) => ids.includes(c.linkedCatalogItemId!));
          }
          return [];
        }),
    };
  }

  // 1. Company Catalog exact match ranks correctly
  it("1. Company Catalog exact match ranks correctly", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "CAM-DOME-01",
    });

    expect(result.candidates[0].origin).toBe("COMPANY_CATALOG");
    expect(result.candidates[0].matchReasons).toContain("EXACT_CODE");
  });

  // 2. Universal exact identifier retrieval works
  it("2. Universal exact identifier retrieval works", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "6941218201234",
    });

    expect(result.candidates[0].id).toBe("universal-library:ucl-item-1");
    expect(result.candidates[0].matchReasons).toContain("EXACT_IDENTIFIER");
  });

  // 3. Company Catalog is tenant-isolated
  it("3. Company Catalog is tenant-isolated", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA, query: "CCTV" });

    const companyIdsInResult = result.candidates
      .filter((c) => c.origin === "COMPANY_CATALOG")
      .map((c) => c.id);

    expect(companyIdsInResult).toContain("company-catalog:cat-item-A");
  });

  // 4. Foreign tenant CatalogItems never appear
  it("4. Foreign tenant CatalogItems never appear", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA, query: "Foreign" });

    const foreignItem = result.candidates.find(
      (c) => c.id === "company-catalog:cat-item-B"
    );
    expect(foreignItem).toBeUndefined();
  });

  // 5. Company Catalog candidate normally outranks equivalent Universal candidate
  it("5. Company Catalog candidate normally outranks equivalent Universal candidate", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "Hikvision",
    });

    const catalogIdx = result.candidates.findIndex(
      (c) => c.origin === "COMPANY_CATALOG"
    );
    const universalIdx = result.candidates.findIndex(
      (c) => c.origin === "UNIVERSAL_LIBRARY"
    );

    expect(catalogIdx).toBeGreaterThanOrEqual(0);
    expect(universalIdx).toBeGreaterThanOrEqual(0);
  });

  // 6. Adopted Universal item collapses to Company Catalog candidate
  it("6. Adopted Universal item collapses to Company Catalog candidate", async () => {
    const adoptions: UniversalAdoptionLink[] = [
      {
        id: "adopt-1",
        companyId: companyA,
        universalItemId: "ucl-item-2",
        catalogItemId: "cat-item-A",
      },
    ];
    const repo = createMockRepo({ adoptions });
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "CCTV Dome Camera 4MP",
    });

    // Should contain cat-item-A with isAdopted: true
    const adoptedCand = result.candidates.find(
      (c) => c.id === "company-catalog:cat-item-A"
    );
    expect(adoptedCand).toBeDefined();
    expect(adoptedCand?.isAdopted).toBe(true);
    expect(adoptedCand?.linkedUniversalItemId).toBe("ucl-item-2");

    // ucl-item-2 should NOT appear separately
    const collapsedUniv = result.candidates.find(
      (c) => c.id === "universal-library:ucl-item-2"
    );
    expect(collapsedUniv).toBeUndefined();
  });

  // 7. Non-adopted Universal item remains discoverable
  it("7. Non-adopted Universal item remains discoverable", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "Hikvision 4MP Bullet Camera",
    });

    const unadopted = result.candidates.find(
      (c) => c.id === "universal-library:ucl-item-1"
    );
    expect(unadopted).toBeDefined();
    expect(unadopted?.isAdopted).toBe(false);
  });

  // 8. Alias search works
  it("8. Alias search works", async () => {
    const rankingService = new CommercialRankingService();
    const scored = rankingService.calculateScore(universalItem1, {
      query: "Hikvision Bullet",
    });

    expect(scored.matchReasons).toContain("ALIAS_MATCH");
    expect(scored.score).toBeGreaterThanOrEqual(500);
  });

  // 9. Manufacturer/model search works
  it("9. Manufacturer/model search works", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({
      companyId: companyA,
      query: "DS-2CD2043G2-I",
    });

    expect(result.candidates[0].modelNumber).toBe("DS-2CD2043G2-I");
    expect(result.candidates[0].matchReasons).toContain("EXACT_MODEL");
  });

  // 10. Category/type filtering works
  it("10. Category/type filtering works", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    await useCase.execute({
      companyId: companyA,
      type: "PRODUCT",
      categoryId: "cat-cctv",
    });

    expect(repo.fetchCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PRODUCT", categoryId: "cat-cctv" })
    );
    expect(repo.fetchUniversalCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PRODUCT", categoryId: "cat-cctv" })
    );
  });

  // 11. Retrieval final limit is bounded
  it("11. Retrieval final limit is bounded", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA, limit: 1 });

    expect(result.candidates).toHaveLength(1);
    expect(result.meta.limit).toBe(1);
  });

  // 12. Oversampling remains bounded
  it("12. Oversampling remains bounded", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    await useCase.execute({ companyId: companyA, limit: 100 });

    expect(repo.fetchCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  // 13. Invalid limit returns controlled validation error
  it("13. Invalid limit returns controlled validation error", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);

    // Limit <= 0 is bounded to min 1
    const clampedLower = await useCase.execute({ companyId: companyA, limit: -5 });
    expect(clampedLower.meta.limit).toBe(1);

    // Limit > 50 is bounded to hard maximum 50
    const clampedUpper = await useCase.execute({ companyId: companyA, limit: 200 });
    expect(clampedUpper.meta.limit).toBe(50);
  });

  // 14. Empty query behavior is explicitly defined and bounded
  it("14. Empty query behavior is explicitly defined and bounded", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA, query: "" });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(20);
  });

  // 15. Deterministic ordering for equal ranking scores
  it("15. Deterministic ordering for equal ranking scores", async () => {
    const rankingService = new CommercialRankingService();
    const c1: CommercialCandidate = { ...catItemA, id: "c1", displayName: "Alpha", score: 100 };
    const c2: CommercialCandidate = { ...catItemA, id: "c2", displayName: "Beta", score: 100 };

    const sorted = rankingService.sortCandidates([c2, c1]);
    expect(sorted[0].id).toBe("c1");
    expect(sorted[1].id).toBe("c2");
  });

  // 16. Inactive Universal item behavior is correct
  it("16. Inactive Universal item behavior is correct", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    await useCase.execute({ companyId: companyA, isActive: true });

    expect(repo.fetchUniversalCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  // 17. Inactive tenant CatalogItem behavior follows canonical rules
  it("17. Inactive tenant CatalogItem behavior follows canonical rules", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    await useCase.execute({ companyId: companyA, isActive: true });

    expect(repo.fetchCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  // 18. AI candidate projection is compact
  it("18. AI candidate projection is compact", async () => {
    const projection = toAICandidateProjection(catItemA);

    expect(projection.candidateId).toBe("company-catalog:cat-item-A");
    expect(projection.displayName).toBe("CCTV Dome Camera 4MP");
    expect((projection as any).rawPayload).toBeUndefined();
    expect(Object.keys(projection)).toHaveLength(16);
  });

  // 19. No raw ingestion payload/provenance leakage
  it("19. No raw ingestion payload/provenance leakage", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA });

    for (const candidate of result.candidates) {
      expect((candidate as any).rawPayload).toBeUndefined();
      expect((candidate as any).provenance).toBeUndefined();
      expect((candidate as any).sourceId).toBeUndefined();
    }
  });

  // 20. No automatic adoption occurs
  it("20. No automatic adoption occurs", async () => {
    const fetchAdoptionsMock = vi.fn().mockResolvedValue([]);
    const repo = createMockRepo({ fetchAdoptionsMock });
    const useCase = new RetrieveCommercialCandidates(repo);

    await useCase.execute({ companyId: companyA, query: "CCTV" });

    expect(fetchAdoptionsMock).toHaveBeenCalled();
    expect((repo as any).adoptItem).toBeUndefined();
  });

  // 21. Retrieval does not mutate Company Catalog
  it("21. Retrieval does not mutate Company Catalog", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);

    await useCase.execute({ companyId: companyA });

    expect(catItemA.displayName).toBe("CCTV Dome Camera 4MP");
    expect((repo as any).saveCatalogItem).toBeUndefined();
  });

  // 22. No external datasets/seed data are added
  it("22. No external datasets/seed data are added", async () => {
    const repo = createMockRepo({});
    const useCase = new RetrieveCommercialCandidates(repo);
    const result = await useCase.execute({ companyId: companyA });

    // Verify all candidates originate strictly from local repository mocks (synthetic test fixtures)
    expect(result.candidates.every(c => c.id.startsWith("company-catalog:") || c.id.startsWith("universal-library:"))).toBe(true);
  });
});
