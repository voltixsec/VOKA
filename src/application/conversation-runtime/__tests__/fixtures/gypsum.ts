import { vi } from "vitest";
import { ConversationRuntime, type CandidateProduct, type ConfirmedFact, type ConversationRuntimeState, type FlexibleTurnProposal } from "../../index";

export const now = "2026-09-02T12:00:00.000Z";
export const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: now });
export const facts = { "system.identity": fact("system.identity", "Gypsum board"), "system.areaM2": fact("system.areaM2", 2000), "system.layersCount": fact("system.layersCount", 1), "customer.name": fact("customer.name", "Proposed Customer") };
export const gypsumCandidates: CandidateProduct[] = [
  { id: "board", componentKey: "GYPSUM_BOARDS", name: "Sheetrock Standard 12.5mm", nameAr: null, nameEn: null, brand: "Sheetrock", model: "Standard 12.5mm", sku: null, price: null, source: "RESEARCHED" },
  { id: "compound", componentKey: "JOINT_COMPOUND", name: "Sheetrock All Purpose Joint Compound", nameAr: null, nameEn: null, brand: "Sheetrock", model: "All Purpose", sku: null, price: null, source: "RESEARCHED" },
];
export const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({ responseMode: "ACK", intent: "UPDATE", patches: [], researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null, responseContent: "Updated.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [], ...overrides });

// Real runtime/reducers, with offline provider observations only. No database or network.
export async function gypsumScenario() {
  let state: ConversationRuntimeState | null = null;
  let sequence = 0;
  const tools = { execute: vi.fn(async () => ({ kind: "CATALOG_LOOKUP" as const, status: "COMPLETED" as const, summary: "Fixture research candidates", candidateProducts: gypsumCandidates, catalogResolution: "RESEARCHED_SUGGESTIONS" as const, evidence: [], createdAt: now })) };
  const turn = async (message: string, decision = proposal()) => {
    state = await new ConversationRuntime({ decide: async () => decision }, tools, () => now, () => `gypsum-${++sequence}`).execute({ state, message, locale: "en", source: "TEXT", companyId: "tenant-1" });
    return state;
  };
  const message = "Gypsum board 2000 m2 single layer supply and installation for Proposed Customer";
  const initial = await turn(message, proposal({ patches: Object.values(facts).map((value) => ({ path: `facts.${value.key}`, operation: "SET", value: value.value, provenance: "USER_EXPLICIT", evidence: message })) }));
  await turn("Get product alternatives", proposal({ researchRequests: [{ kind: "CATALOG_LOOKUP", query: "product alternatives", attachmentId: null }] }));
  // Reproduce the provider assigning an explicitly named board approval to the wrong slot.
  const board = await turn("Approve Sheetrock Standard 12.5mm", proposal({ patches: [{ operation: "APPROVE", path: "products.candidates.compound", value: "compound", evidence: "Approve Sheetrock Standard 12.5mm", provenance: "USER_EXPLICIT" }] }));
  const compound = await turn("Approve Sheetrock All Purpose Joint Compound");
  const final = await turn("Continue");
  return { initial, board, compound, final };
}
