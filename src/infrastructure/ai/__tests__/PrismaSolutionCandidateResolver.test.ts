import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { CommercialSystemResearchPort, ProvisionalSystemModel } from "@/src/application/agentic-commercial-intelligence";
import { buildSystemConfigurationGraph, type ConfirmedFact, type SystemConfigurationGraph } from "@/src/application/conversation-runtime";
import { PrismaSolutionCandidateResolver } from "../PrismaSolutionCandidateResolver";

const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });
const ceramic = () => buildSystemConfigurationGraph({
  "system.identity": fact("system.identity", "Ceramic flooring"), "system.jurisdiction": fact("system.jurisdiction", "Kuwait"),
  "system.areaM2": fact("system.areaM2", 450), "system.tileSize": fact("system.tileSize", "60x60"), "system.qualityTier": fact("system.qualityTier", "MEDIUM"),
});
const catalogItem = (id: string) => ({ id: { toString: () => id }, name: `Catalog ${id}`, nameAr: null, nameEn: `Catalog ${id}`, sku: id, salePrice: 12 });
function research(products: ProvisionalSystemModel["productAlternatives"]): CommercialSystemResearchPort {
  return { researchSystem: vi.fn().mockResolvedValue({ systemName: "Ceramic flooring", aliases: [], purpose: "", componentCategories: [], inputs: [], limitations: [], confidence: .8, jurisdiction: "Kuwait", evidence: products!.map((item) => ({ title: item.sourceTitle, url: item.sourceUrl, publisher: "manufacturer.example", sourceType: "MANUFACTURER_PRODUCT", qualityScore: 75, provenance: "RESEARCHED" as const })), productAlternatives: products, provenance: "RESEARCHED", requiresEngineeringVerification: true }) };
}
const products = (componentKey: string, count: number) => Array.from({ length: count }, (_, index) => ({
  componentKey, productName: `Real Product ${index + 1}`, brand: `Brand ${index + 1}`, model: `MODEL-${index + 1}`,
  sourceUrl: `https://manufacturer.example/${componentKey}/${index + 1}`, sourceTitle: `Official product page ${index + 1}`,
  jurisdictionRelevance: "Distributed in Kuwait", confidence: .9 - index * .05, evidenceBasis: ["Official product identity"], evidenceRole: "TECHNICAL_AND_AVAILABILITY" as const,
}));

describe("PrismaSolutionCandidateResolver governed Top-3", () => {
  it("does not call external research when catalog already has 3 distinct options", async () => {
    const external = research(products("CERAMIC_TILES", 3));
    const catalog = { findAll: vi.fn().mockResolvedValue([catalogItem("1"), catalogItem("2"), catalogItem("3")]) };
    const result = await new PrismaSolutionCandidateResolver(external, undefined, catalog as never).resolve({ graph: ceramic(), companyId: "tenant", locale: "en", mode: "CATALOG_ONLY", query: "Top 3 tiles", requestedCount: 3 });
    expect(external.researchSystem).not.toHaveBeenCalled();
    expect(result.graph.candidateProducts).toHaveLength(3);
    expect(result.graph.candidateProducts.every((item) => item.source === "VERIFIED_CATALOG")).toBe(true);
  });

  it.each([[2, 1], [0, 3]])("with catalog %i fills the missing %i slots in one explicit web-fallback stage", async (catalogCount, expectedResearch) => {
    const external = research(products("CERAMIC_TILES", 3));
    const catalog = { findAll: vi.fn().mockResolvedValue(Array.from({ length: catalogCount }, (_, index) => catalogItem(String(index + 1)))) };
    const resolver = new PrismaSolutionCandidateResolver(external, undefined, catalog as never);
    const catalogResult = await resolver.resolve({ graph: ceramic(), companyId: "tenant", locale: "en", mode: "CATALOG_ONLY", query: "Top 3 tiles", requestedCount: 3 });
    expect(external.researchSystem).not.toHaveBeenCalled();
    const result = await resolver.resolve({ graph: catalogResult.graph, companyId: "tenant", locale: "en", mode: "WEB_FALLBACK", query: "Top 3 tiles", requestedCount: 3 });
    expect(external.researchSystem).toHaveBeenCalledOnce();
    expect(result.graph.candidateProducts).toHaveLength(3);
    expect(result.graph.candidateProducts.filter((item) => item.source === "RESEARCHED")).toHaveLength(expectedResearch);
  });

  it("researches all primary components in one provider call and caps the total at 3 structured identities", async () => {
    const graph: SystemConfigurationGraph = { ...ceramic(), salesBom: [
      { ...ceramic().salesBom[0], id: "CCTV_CAMERAS", componentKeys: ["CCTV_CAMERAS"] },
      { ...ceramic().salesBom[0], id: "NVR_RECORDER", componentKeys: ["NVR_RECORDER"] },
    ] };
    const nvrProducts = products("NVR_RECORDER", 2).map((item, index) => ({ ...item, productName: `Recorder ${index + 1}`, brand: `Recorder Brand ${index + 1}`, model: `NVR-${index + 1}` }));
    const external = research([...products("CCTV_CAMERAS", 2), ...nvrProducts]);
    const result = await new PrismaSolutionCandidateResolver(external, undefined, { findAll: vi.fn().mockResolvedValue([]) } as never).resolve({ graph, companyId: "tenant", locale: "en", mode: "WEB_FALLBACK", query: "Top 3 CCTV options", requestedCount: 3 });
    expect(external.researchSystem).toHaveBeenCalledOnce();
    expect(result.graph.candidateProducts).toHaveLength(3);
    expect(result.graph.candidateProducts[0]).toMatchObject({ name: "Real Product 1", brand: "Brand 1", model: "MODEL-1", sourceTitle: "Official product page 1" });
  });

  it("never converts generic evidence page titles or publisher domains into products", async () => {
    const external: CommercialSystemResearchPort = { researchSystem: vi.fn().mockResolvedValue({ systemName: "Ceramic", aliases: [], purpose: "", componentCategories: [], inputs: [], limitations: [], confidence: .6, jurisdiction: "Kuwait", evidence: [{ title: "Ceramic buying guide", url: "https://publisher.example/guide", publisher: "publisher.example", provenance: "RESEARCHED" }], productAlternatives: [], provenance: "RESEARCHED", requiresEngineeringVerification: true }) };
    const result = await new PrismaSolutionCandidateResolver(external, undefined, { findAll: vi.fn().mockResolvedValue([]) } as never).resolve({ graph: ceramic(), companyId: "tenant", locale: "en", mode: "WEB_FALLBACK", query: "Top 3 tiles", requestedCount: 3 });
    expect(result.graph.candidateProducts).toEqual([]);
  });

  it("builds a specification-rich jurisdiction query and ranks suitable local evidence first", async () => {
    const local = { ...products("CERAMIC_TILES", 1)[0], productName: "Kuwait Tile", jurisdictionRelevance: "Supplied in Kuwait", evidenceRole: "LOCAL_SUPPLIER_EVIDENCE" as const, marketPrice: { priceAmount: 4.25, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "m²", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://manufacturer.example/CERAMIC_TILES/1", priceSourceTitle: "listing", priceObservedAt: "2026-09-01T00:00:00.000Z" } };
    const global = { ...products("CERAMIC_TILES", 1)[0], productName: "Global Tile", brand: "Global", model: "G-60", sourceUrl: "https://global.example/g-60", jurisdictionRelevance: null, evidenceRole: "GLOBAL_PRODUCT_AUTHORITY" as const };
    const external = research([global, local]);
    const result = await new PrismaSolutionCandidateResolver(external, undefined, { findAll: vi.fn().mockResolvedValue([]) } as never).resolve({ graph: ceramic(), companyId: "tenant", locale: "ar", mode: "WEB_FALLBACK", query: "عايز بدائل", requestedCount: 3 });
    const sent = vi.mocked(external.researchSystem).mock.calls[0][0];
    expect(sent.query).toMatch(/60x60.*Kuwait.*supplier/is);
    expect(result.graph.candidateProducts[0].name).toBe("Kuwait Tile");
    expect(result.graph.candidateProducts[0]).toMatchObject({ price: null, marketPrice: { priceAmount: 4.25, priceCurrency: "KWD" } });

    const saudi = ceramic(); saudi.requirements = saudi.requirements.map((item) => item.key === "system.jurisdiction" ? { ...item, value: "Saudi Arabia" } : item);
    const second = research([{ ...local, productName: "Saudi Tile", jurisdictionRelevance: "Supplied in Saudi Arabia" }]);
    await new PrismaSolutionCandidateResolver(second, undefined, { findAll: vi.fn().mockResolvedValue([]) } as never).resolve({ graph: saudi, companyId: "tenant", locale: "en", mode: "WEB_FALLBACK", query: "tile options", requestedCount: 3 });
    expect(vi.mocked(second.researchSystem).mock.calls[0][0].query).toMatch(/Saudi Arabia.*supplier/is);
  });

  it("preserves a safe diagnostic when every normalized candidate is rejected", async () => {
    const bad = { ...products("WRONG_COMPONENT", 1)[0] };
    const external = research([bad]);
    const result = await new PrismaSolutionCandidateResolver(external, undefined, { findAll: vi.fn().mockResolvedValue([]) } as never).resolve({ graph: ceramic(), companyId: "tenant", locale: "en", mode: "WEB_FALLBACK", query: "tiles", requestedCount: 3 });
    expect(result.researchObservation).toMatchObject({ status: "UNAVAILABLE", summary: "WEB_SEARCH_ALL_CANDIDATES_REJECTED" });
  });
});
