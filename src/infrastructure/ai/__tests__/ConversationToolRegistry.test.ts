import { describe, expect, it, vi } from "vitest";
import { buildSystemConfigurationGraph, type ConfirmedFact, type SolutionCandidateResolverPort } from "@/src/application/conversation-runtime";
import { ConversationToolRegistry } from "../ConversationToolRegistry";

const now = "2026-09-01T00:00:00.000Z";
const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: now });

describe("ConversationToolRegistry staged product retrieval", () => {
  it("keeps catalog lookup separate from the web fallback", async () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 8) });
    const candidate = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Acme X1", nameAr: null, nameEn: "Acme X1", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" as const };
    const resolve = vi.fn(async ({ graph: inputGraph, mode }: Parameters<SolutionCandidateResolverPort["resolve"]>[0]) => mode === "CATALOG_ONLY"
      ? { graph: { ...inputGraph, candidateProducts: [], catalogResolution: "CATALOG_INSUFFICIENT" as const } }
      : { graph: { ...inputGraph, candidateProducts: [candidate], catalogResolution: "RESEARCHED_SUGGESTIONS" as const }, researchObservation: { kind: "RESEARCH" as const, status: "COMPLETED" as const, summary: "web completed", evidence: [{ title: "Official X1", url: "https://acme.example/x1", publisher: "acme.example" }], createdAt: now } });
    const resolver: SolutionCandidateResolverPort = { resolve };
    const directResearch = { researchSystem: vi.fn() };
    const registry = new ConversationToolRegistry(directResearch as never, resolver, () => now);
    const catalog = await registry.execute({ request: { kind: "CATALOG_LOOKUP", query: "Top 3 CCTV cameras", attachmentId: null }, companyId: "tenant-1", locale: "en", graph });
    const result = await registry.execute({ request: { kind: "RESEARCH", query: "Top 3 CCTV cameras", attachmentId: null }, companyId: "tenant-1", locale: "en", graph: { ...graph, candidateProducts: catalog.candidateProducts ?? [], catalogResolution: catalog.catalogResolution ?? graph.catalogResolution } });
    expect(resolve).toHaveBeenNthCalledWith(1, expect.objectContaining({ mode: "CATALOG_ONLY", requestedCount: 3 }));
    expect(resolve).toHaveBeenNthCalledWith(2, expect.objectContaining({ mode: "WEB_FALLBACK", requestedCount: 3 }));
    expect(directResearch.researchSystem).not.toHaveBeenCalled();
    expect(catalog).toMatchObject({ kind: "CATALOG_LOOKUP", status: "UNAVAILABLE", catalogResolution: "CATALOG_INSUFFICIENT", candidateProducts: [] });
    expect(result).toMatchObject({ kind: "RESEARCH", status: "COMPLETED", catalogResolution: "RESEARCHED_SUGGESTIONS", candidateProducts: [{ brand: "Acme", model: "X1" }] });
  });

  it("keeps non-product technical research on the evidence adapter", async () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "FM-200"), "system.jurisdiction": fact("system.jurisdiction", "Kuwait") });
    const resolver: SolutionCandidateResolverPort = { resolve: vi.fn() };
    const directResearch = { researchSystem: vi.fn().mockResolvedValue({ systemName: "FM-200", aliases: [], purpose: "Technical guidance", componentCategories: [], inputs: [], limitations: [], confidence: .7, jurisdiction: "Kuwait", evidence: [{ title: "Authority", url: "https://authority.gov.kw/fm200", publisher: "authority.gov.kw", provenance: "RESEARCHED" }], productAlternatives: [], provenance: "RESEARCHED", requiresEngineeringVerification: true }) };
    const result = await new ConversationToolRegistry(directResearch as never, resolver, () => now).execute({ request: { kind: "RESEARCH", query: "Kuwait FM-200 requirements", attachmentId: null }, companyId: "tenant-1", locale: "en", graph });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(directResearch.researchSystem).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ kind: "RESEARCH", status: "COMPLETED", evidence: [{ url: "https://authority.gov.kw/fm200" }] });
  });

  it("accepts jurisdiction rules only when the governed evidence source has matching authority classification", async () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 8), "system.jurisdiction": fact("system.jurisdiction", "Kuwait") });
    const rule = { systemType: "CCTV", jurisdiction: "Kuwait", profileId: "kw-rule", profileVersion: "2026", authoritySourceUrl: "https://authority.gov.kw/rule", authoritySourceTitle: "Authority rule", sourceType: "GOVERNMENT_AUTHORITY" as const, values: { retentionDays: 90 } };
    const model = (sourceType: "GOVERNMENT_AUTHORITY" | "LOCAL_DISTRIBUTOR") => ({ systemName: "CCTV", aliases: [], purpose: "Rule research", componentCategories: [], inputs: [], limitations: [], confidence: .8, jurisdiction: "Kuwait", evidence: [{ title: "Authority rule", url: rule.authoritySourceUrl, publisher: "authority.gov.kw", sourceType, provenance: "RESEARCHED" as const }], productAlternatives: [], engineeringRules: [rule], provenance: "RESEARCHED" as const, requiresEngineeringVerification: true as const });
    const request = { request: { kind: "RESEARCH" as const, purpose: "JURISDICTION_RULE" as const, query: "Kuwait CCTV retention", attachmentId: null }, companyId: "tenant-1", locale: "en" as const, graph };
    const valid = await new ConversationToolRegistry({ researchSystem: vi.fn().mockResolvedValue(model("GOVERNMENT_AUTHORITY")) } as never, null, () => now).execute(request);
    const rejected = await new ConversationToolRegistry({ researchSystem: vi.fn().mockResolvedValue(model("LOCAL_DISTRIBUTOR")) } as never, null, () => now).execute(request);
    expect(valid).toMatchObject({ status: "COMPLETED", engineeringRules: [{ profileId: "kw-rule", values: { retentionDays: 90 } }] });
    expect(rejected).toMatchObject({ status: "UNAVAILABLE", engineeringRules: [] });
  });
});
