import { describe, expect, it, vi } from "vitest";
import { buildSystemConfigurationGraph, type ConfirmedFact, type SolutionCandidateResolverPort } from "@/src/application/conversation-runtime";
import { ConversationToolRegistry } from "../ConversationToolRegistry";

const now = "2026-09-01T00:00:00.000Z";
const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: now });

describe("ConversationToolRegistry unified product retrieval", () => {
  it("executes one catalog-first resolver operation for a Top-3 request without a duplicate direct research call", async () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 8) });
    const candidate = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Acme X1", nameAr: null, nameEn: "Acme X1", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" as const };
    const resolver: SolutionCandidateResolverPort = { resolve: vi.fn(async ({ graph: inputGraph }: Parameters<SolutionCandidateResolverPort["resolve"]>[0]) => ({ graph: { ...inputGraph, candidateProducts: [candidate], catalogResolution: "RESEARCHED_SUGGESTIONS" as const }, researchObservation: { kind: "RESEARCH" as const, status: "COMPLETED" as const, summary: "catalog insufficient; web completed", evidence: [], createdAt: now } })) };
    const directResearch = { researchSystem: vi.fn() };
    const registry = new ConversationToolRegistry(directResearch as never, resolver, () => now);
    const result = await registry.execute({ request: { kind: "CATALOG_LOOKUP", query: "Top 3 CCTV cameras", attachmentId: null }, companyId: "tenant-1", locale: "en", graph });
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ allowResearchFallback: true }));
    expect(directResearch.researchSystem).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "CATALOG_LOOKUP", status: "COMPLETED", catalogResolution: "RESEARCHED_SUGGESTIONS", candidateProducts: [{ brand: "Acme", model: "X1" }] });
  });
});
