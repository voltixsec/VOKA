import { describe, expect, it, vi } from "vitest";
import { RetrieveCommercialCandidates } from "../RetrieveCommercialCandidates";
import {
  IHybridRetrievalRepository,
  UniversalAdoptionLink,
} from "../../../domain/repositories/HybridRetrievalRepository";
import { CommercialCandidate } from "../../../domain/retrieval";

describe("RetrieveCommercialCandidates Use Case", () => {
  const companyId = "company-100";

  const catalogItem1: CommercialCandidate = {
    id: "company-catalog:cat-1",
    origin: "COMPANY_CATALOG",
    type: "PRODUCT",
    displayName: "Security Camera 4K",
    code: "CAM-4K",
    sku: "SKU-4K",
    barcode: "11111111",
    identifiers: [{ type: "BARCODE", value: "11111111" }],
    categoryId: "cat-sec",
    isActive: true,
    isAdopted: false,
    linkedCatalogItemId: "cat-1",
    salePrice: 150,
    score: 0,
    matchReasons: [],
  };

  const universalItem1: CommercialCandidate = {
    id: "universal-library:ucl-1",
    origin: "UNIVERSAL_LIBRARY",
    type: "PRODUCT",
    displayName: "Security Camera 4K",
    code: null,
    modelNumber: "DS-4K",
    identifiers: [{ type: "GTIN_13", value: "6941218201234" }],
    aliases: ["4K Hikvision Camera"],
    categoryId: "cat-sec",
    isActive: true,
    isAdopted: false,
    linkedUniversalItemId: "ucl-1",
    score: 0,
    matchReasons: [],
  };

  const universalItem2: CommercialCandidate = {
    id: "universal-library:ucl-2",
    origin: "UNIVERSAL_LIBRARY",
    type: "PRODUCT",
    displayName: "Thermal Camera Industrial",
    code: null,
    modelNumber: "DS-THERM",
    identifiers: [{ type: "MPN", value: "MPN-THERM" }],
    categoryId: "cat-sec",
    isActive: true,
    isAdopted: false,
    linkedUniversalItemId: "ucl-2",
    score: 0,
    matchReasons: [],
  };

  it("requires companyId", async () => {
    const repository = {} as unknown as IHybridRetrievalRepository;
    const useCase = new RetrieveCommercialCandidates(repository);

    await expect(useCase.execute({ companyId: "" })).rejects.toThrow(
      "companyId is required"
    );
  });

  it("retrieves and ranks candidates from both Company Catalog and Universal Library", async () => {
    const fetchCatalogCandidates = vi.fn().mockResolvedValue([catalogItem1]);
    const fetchUniversalCandidates = vi
      .fn()
      .mockResolvedValue([universalItem1, universalItem2]);
    const fetchAdoptions = vi.fn().mockResolvedValue([]);
    const fetchCatalogCandidatesByIds = vi.fn().mockResolvedValue([]);

    const repository: IHybridRetrievalRepository = {
      fetchCatalogCandidates,
      fetchUniversalCandidates,
      fetchAdoptions,
      fetchCatalogCandidatesByIds,
    };

    const useCase = new RetrieveCommercialCandidates(repository);
    const result = await useCase.execute({
      companyId,
      query: "Security Camera",
    });

    expect(result.candidates).toHaveLength(3);
    // Company Catalog item outranks Universal item with identical name match due to COMPANY_CATALOG_PRIORITY
    expect(result.candidates[0].origin).toBe("COMPANY_CATALOG");
    expect(result.candidates[0].id).toBe("company-catalog:cat-1");
  });

  it("collapses adopted Universal items into the Company Catalog candidate", async () => {
    const fetchCatalogCandidates = vi.fn().mockResolvedValue([catalogItem1]);
    const fetchUniversalCandidates = vi
      .fn()
      .mockResolvedValue([universalItem1, universalItem2]);
    const adoptions: UniversalAdoptionLink[] = [
      {
        id: "adopt-1",
        companyId,
        universalItemId: "ucl-1",
        catalogItemId: "cat-1",
      },
    ];
    const fetchAdoptions = vi.fn().mockResolvedValue(adoptions);
    const fetchCatalogCandidatesByIds = vi.fn().mockResolvedValue([]);

    const repository: IHybridRetrievalRepository = {
      fetchCatalogCandidates,
      fetchUniversalCandidates,
      fetchAdoptions,
      fetchCatalogCandidatesByIds,
    };

    const useCase = new RetrieveCommercialCandidates(repository);
    const result = await useCase.execute({
      companyId,
      query: "Security Camera",
    });

    // universalItem1 collapsed into catalogItem1
    // Total candidates in pool = 2 (collapsed cat-1, and unadopted ucl-2)
    expect(result.candidates).toHaveLength(2);
    const adoptedCatCandidate = result.candidates.find(
      (c) => c.id === "company-catalog:cat-1"
    );
    expect(adoptedCatCandidate).toBeDefined();
    expect(adoptedCatCandidate?.isAdopted).toBe(true);
    expect(adoptedCatCandidate?.linkedUniversalItemId).toBe("ucl-1");

    // ucl-1 should NOT appear independently
    const unadoptedUcl1 = result.candidates.find(
      (c) => c.id === "universal-library:ucl-1"
    );
    expect(unadoptedUcl1).toBeUndefined();
  });

  it("bounds oversampling and output limit to hard maximum", async () => {
    const fetchCatalogCandidates = vi.fn().mockResolvedValue([]);
    const fetchUniversalCandidates = vi.fn().mockResolvedValue([]);
    const fetchAdoptions = vi.fn().mockResolvedValue([]);
    const fetchCatalogCandidatesByIds = vi.fn().mockResolvedValue([]);

    const repository: IHybridRetrievalRepository = {
      fetchCatalogCandidates,
      fetchUniversalCandidates,
      fetchAdoptions,
      fetchCatalogCandidatesByIds,
    };

    const useCase = new RetrieveCommercialCandidates(repository);
    await useCase.execute({ companyId, limit: 100 });

    expect(fetchCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }) // oversample limit capped at 100
    );
  });
});
