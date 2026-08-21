import { describe, expect, it } from "vitest";
import { CommercialRankingService } from "../CommercialRankingService";
import { CommercialCandidate, toAICandidateProjection } from "../CommercialCandidate";

describe("CommercialRankingService & Candidate Projections", () => {
  const rankingService = new CommercialRankingService();

  const companyCandidate: CommercialCandidate = {
    id: "company-catalog:cat-1",
    origin: "COMPANY_CATALOG",
    type: "PRODUCT",
    displayName: "Standard Security Camera",
    code: "CAM-01",
    sku: "SKU-CAM-01",
    barcode: "12345678",
    modelNumber: "MOD-100",
    identifiers: [{ type: "BARCODE", value: "12345678" }],
    isActive: true,
    isAdopted: false,
    salePrice: 100,
    score: 0,
    matchReasons: [],
  };

  const universalCandidate: CommercialCandidate = {
    id: "universal-library:ucl-1",
    origin: "UNIVERSAL_LIBRARY",
    type: "PRODUCT",
    displayName: "Global CCTV Camera X",
    code: null,
    modelNumber: "MOD-100",
    identifiers: [{ type: "GTIN_13", value: "6941218201234" }],
    aliases: ["Hikvision Camera 4MP"],
    isActive: true,
    isAdopted: false,
    score: 0,
    matchReasons: [],
  };

  it("scores Company Catalog code match higher than Universal name match", () => {
    const scoredCompany = rankingService.calculateScore(companyCandidate, { query: "CAM-01" });
    const scoredUniversal = rankingService.calculateScore(universalCandidate, { query: "CAM-01" });

    expect(scoredCompany.matchReasons).toContain("EXACT_CODE");
    expect(scoredCompany.matchReasons).toContain("COMPANY_CATALOG_PRIORITY");
    expect(scoredCompany.score).toBeGreaterThan(scoredUniversal.score);
  });

  it("allows exact Universal identifier match to outrank partial Company Catalog name match", () => {
    const scoredCompany = rankingService.calculateScore(companyCandidate, { query: "6941218201234" });
    const scoredUniversal = rankingService.calculateScore(universalCandidate, { query: "6941218201234" });

    expect(scoredUniversal.matchReasons).toContain("EXACT_IDENTIFIER");
    expect(scoredUniversal.score).toBe(9000); // Exact identifier tier
    expect(scoredCompany.score).toBe(100); // Only company priority base
    expect(scoredUniversal.score).toBeGreaterThan(scoredCompany.score);
  });

  it("scores alias matches correctly", () => {
    const scoredUniversal = rankingService.calculateScore(universalCandidate, { query: "Hikvision Camera 4MP" });
    expect(scoredUniversal.matchReasons).toContain("ALIAS_MATCH");
    expect(scoredUniversal.score).toBeGreaterThanOrEqual(500);
  });

  it("sorts candidates deterministically by score, origin, displayName, and id", () => {
    const candidateA: CommercialCandidate = { ...companyCandidate, id: "a", score: 500, displayName: "A" };
    const candidateB: CommercialCandidate = { ...universalCandidate, id: "b", score: 500, displayName: "A" };
    const candidateC: CommercialCandidate = { ...companyCandidate, id: "c", score: 800, displayName: "Z" };

    const sorted = rankingService.sortCandidates([candidateA, candidateB, candidateC]);

    expect(sorted[0].id).toBe("c"); // Highest score (800)
    expect(sorted[1].id).toBe("a"); // Equal score (500), but COMPANY_CATALOG before UNIVERSAL_LIBRARY
    expect(sorted[2].id).toBe("b");
  });

  it("never lets stacked Universal signals outrank an exact Company code", () => {
    const query = "CAM-01";
    const stackedUniversal = {
      ...universalCandidate,
      displayName: query,
      modelNumber: query,
      aliases: [query],
      identifiers: [{ type: "MPN", value: query, normalizedValue: query }],
    };
    expect(rankingService.calculateScore(companyCandidate, { query }).score)
      .toBeGreaterThan(rankingService.calculateScore(stackedUniversal, { query }).score);
  });

  it("matches normalized numeric identifiers", () => {
    const scored = rankingService.calculateScore({
      ...universalCandidate,
      identifiers: [{ type: "GTIN_13", value: "6941218201234", normalizedValue: "6941218201234" }],
    }, { query: "694-1218-201234" });
    expect(scored.matchReasons).toContain("EXACT_IDENTIFIER");
  });

  it("creates compact AI projections without raw payload leakage", () => {
    const projection = toAICandidateProjection(companyCandidate);

    expect(projection).toEqual({
      candidateId: "company-catalog:cat-1",
      origin: "COMPANY_CATALOG",
      type: "PRODUCT",
      displayName: "Standard Security Camera",
      nameAr: null,
      nameEn: null,
      code: "CAM-01",
      modelNumber: "MOD-100",
      manufacturer: null,
      brand: null,
      category: null,
      salePrice: 100,
      unitSymbol: null,
      isAdopted: false,
      linkedCatalogItemId: null,
      linkedUniversalItemId: null,
    });
    expect((projection as any).rawPayload).toBeUndefined();
    expect((projection as any).provenance).toBeUndefined();
  });
});
