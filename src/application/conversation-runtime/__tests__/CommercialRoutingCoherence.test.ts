import { describe, expect, it, vi } from "vitest";
import {
  ConversationRuntime, adaptCommercialHandoffToQuotationDraft, applyWorkspaceDefaults, applyWorkspacePatches,
  buildSystemConfigurationGraph, parseCommercialDefaultsProfile, quotationScopeLabel, renderGovernedResponse,
  synchronizeWorkspace, type CommercialSolutionHandoff, type ConfirmedFact, type ConversationBrainPort,
  type ConversationRuntimeState, type FlexibleTurnProposal, type SolutionBomLine, type WorkspaceDefaultsPort,
} from "../index";

const now = "2026-09-01T10:00:00.000Z";
const fact = (key: string, value: string | number, provenance: ConfirmedFact["provenance"] = "USER_EXPLICIT"): ConfirmedFact => ({ key, value, provenance, evidence: String(value), updatedAt: now });
const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({ responseMode: "ACK", intent: "UPDATE", patches: [], researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null, responseContent: "تم تحديث الحل.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [], ...overrides });
const tools = { execute: vi.fn() };
let sequence = 0;
const ids = () => `id-${++sequence}`;

function workspace(facts: Record<string, ConfirmedFact>) {
  const graph = buildSystemConfigurationGraph(facts);
  return synchronizeWorkspace(undefined, facts, graph, now);
}

function bomLine(id: string, name: string, quantity: number): SolutionBomLine {
  return { id, componentKeys: [id], category: "PRODUCT", itemName: name, itemNameAr: name, itemNameEn: name, description: null, unitName: "pcs", quantity, quantityState: "CONFIRMED", unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "USER_EXPLICIT" };
}

describe("commercial routing and state coherence", () => {
  it("parses and reloads the complete scope profile while preserving explicit quote overrides", () => {
    const install = parseCommercialDefaultsProfile({ currencyCode: "kwd", locale: "en", termsAr: null, termsEn: "Payment: 50% advance\nDelivery: 14 days\nWarranty: 1 year\nValidity: 30 days\nLegal clause" });
    const supply = parseCommercialDefaultsProfile({ currencyCode: "KWD", locale: "en", termsAr: null, termsEn: "Payment: cash\nDelivery: 7 days\nWarranty: 6 months\nValidity: 15 days\nSupply legal clause" });
    let value = workspace({ "system.identity": fact("system.identity", "CCTV"), "scope.type": fact("scope.type", "SUPPLY_AND_INSTALLATION") });
    value = applyWorkspaceDefaults(value, install, "SUPPLY_AND_INSTALLATION");
    expect(value.terms).toMatchObject({ payment: "50% advance", delivery: "14 days", warranty: "1 year", validity: "30 days" });
    value = { ...value, terms: { ...value.terms, payment: "25% advance", sources: { ...value.terms.sources, payment: "EXPLICIT" } } };
    value = applyWorkspaceDefaults(value, supply, "SUPPLY_ONLY");
    expect(value.terms).toMatchObject({ payment: "25% advance", delivery: "7 days", warranty: "6 months", validity: "15 days", defaultsScope: "SUPPLY_ONLY" });
    expect(value.terms.companyTermsEn).not.toContain("Legal clause");
  });

  it("routes site conditions to clean Notes and keeps Terms scope-only with overrides", () => {
    const facts = { "system.identity": fact("system.identity", "Ceramic"), "scope.type": fact("scope.type", "SUPPLY_ONLY"), "commercial.payment": fact("commercial.payment", "25% advance") };
    let value = workspace(facts);
    value = applyWorkspacePatches(value, [
      { operation: "SET", path: "siteAndResponsibilities.customerResponsibilities", value: ["العميل يوفر الكهرباء / power"], evidence: "", provenance: "AI_INFERRED" },
      { operation: "SET", path: "siteAndResponsibilities.exclusions", value: ["Civil works by customer"], evidence: "", provenance: "AI_INFERRED" },
    ], "", now);
    const defaults = parseCommercialDefaultsProfile({ currencyCode: "KWD", locale: "en", termsAr: null, termsEn: "Payment: cash\nWarranty: 1 year\nCeramic legal terms" });
    value = applyWorkspaceDefaults(value, defaults, "SUPPLY_ONLY");
    const handoff: CommercialSolutionHandoff = { runtimeId: "r1", confirmedFacts: facts, commercialLines: [], toolEvidence: [], createdAt: now, workspace: value };
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "c1", handoff, customer: null, defaults, locale: "en" });
    expect(draft?.notesEn).toContain("Customer responsibilities: العميل يوفر الكهرباء / power");
    expect(draft?.notesEn).toContain("Exclusions: Civil works by customer");
    expect(draft?.termsAndConditionsEn).toContain("Payment terms: 25% advance");
    expect(draft?.termsAndConditionsEn).not.toMatch(/power|Civil works/);
    expect(draft?.notesEn).not.toMatch(/E\*7D|```|\{\s*"/);
  });

  it("preserves explicit component specifications such as IP 4MP in the BOM", () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 4), "system.cameraType": fact("system.cameraType", "IP"), "system.resolutionMp": fact("system.resolutionMp", 4) });
    const cameras = graph.salesBom.find((line) => line.id === "CCTV_CAMERAS");
    expect(`${cameras?.itemNameEn} ${cameras?.description}`).toMatch(/IP/i);
    expect(cameras?.description).toMatch(/4 MP/i);
  });

  it("replaces an aggregate BOM parent with governed detailed quantities during reconciliation", async () => {
    const firstBrain: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.system.identity", value: "Ceramic", evidence: "Ceramic", provenance: "USER_EXPLICIT" }] }) };
    let state = await new ConversationRuntime(firstBrain, tools, () => now, ids).execute({ state: null, message: "Ceramic", locale: "en", source: "TEXT", companyId: "c1" });
    state = await new ConversationRuntime({ decide: async () => proposal() }, tools, () => now, ids).execute({ state, message: "Split accessories: 20 spacers and 5 trims", locale: "en", source: "TEXT", companyId: "c1" });
    const children = [bomLine("CERAMIC_SPACERS", "Spacers", 20), bomLine("CERAMIC_TRIMS", "Trims", 5)];
    const reconcileBrain: ConversationBrainPort = { decide: async () => proposal({ responseContent: "Workspace reconciled.", patches: [{ operation: "REPLACE", path: "engineering.bom.CERAMIC_ACCESSORIES", value: children, evidence: "Split accessories: 20 spacers and 5 trims", provenance: "USER_EXPLICIT" }] }) };
    state = await new ConversationRuntime(reconcileBrain, tools, () => now, ids).execute({ state, message: "Reconcile full conversation", locale: "en", source: "CHIP", companyId: "c1", action: "RECONCILE" });
    expect(state.workspace?.commercialSolution.bom.some((line) => line.id === "CERAMIC_ACCESSORIES")).toBe(false);
    expect(state.workspace?.commercialSolution.bom.map((line) => [line.id, line.quantity])).toEqual(expect.arrayContaining([["CERAMIC_SPACERS", 20], ["CERAMIC_TRIMS", 5]]));
    state = await new ConversationRuntime({ decide: async () => proposal() }, tools, () => now, ids).execute({ state, message: "Continue", locale: "en", source: "TEXT", companyId: "c1" });
    expect(state.workspace?.commercialSolution.bom.some((line) => line.id === "CERAMIC_ACCESSORIES")).toBe(false);
    expect(state.workspace?.commercialSolution.bom.map((line) => [line.id, line.quantity])).toEqual(expect.arrayContaining([["CERAMIC_SPACERS", 20], ["CERAMIC_TRIMS", 5]]));
  });

  it("collects customer and attention together after acting on the solution", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" }], responseContent: "جهزت التكوين المبدئي." }) };
    const state = await new ConversationRuntime(brain, tools, () => now, ids).execute({ state: null, message: "CCTV", locale: "ar", source: "TEXT", companyId: "c1" });
    expect(state.messages.at(-1)?.text).toBe("جهزت التكوين المبدئي.\n\nاسم العميل والعرض لعناية مين؟");
    expect(state.solutionGraph?.readiness.pendingBeforeFinalIssue).toEqual(expect.arrayContaining(["Customer", "Attention"]));
  });

  it("clears system-specific workspace state and company profile on a genuine system change", () => {
    const cctvFacts = { "system.identity": fact("system.identity", "CCTV"), "scope.type": fact("scope.type", "SUPPLY_ONLY") };
    let prior = workspace(cctvFacts);
    prior = applyWorkspaceDefaults(prior, parseCommercialDefaultsProfile({ currencyCode: "KWD", termsAr: null, termsEn: "CCTV NVR warranty", locale: "en" }), "SUPPLY_ONLY");
    prior.siteAndResponsibilities.notes = ["NVR rack note"];
    prior.products.candidates = [{ id: "camera", componentKey: "CCTV_CAMERAS", name: "Camera", nameAr: null, nameEn: "Camera", brand: "A", model: "NVR-1", sku: null, price: null, source: "RESEARCHED" }];
    prior.products.approvedCandidateIds = ["camera"];
    const ceramicFacts = { "system.identity": fact("system.identity", "Ceramic"), "scope.type": fact("scope.type", "SUPPLY_ONLY") };
    const next = synchronizeWorkspace(prior, ceramicFacts, buildSystemConfigurationGraph(ceramicFacts), now);
    expect(next.siteAndResponsibilities.notes).toEqual([]);
    expect(next.products).toEqual({ candidates: [], approvedCandidateIds: [] });
    expect(next.terms.companyTermsEn).toBeNull();
    expect(JSON.stringify(next)).not.toMatch(/NVR-1|NVR rack|CCTV NVR warranty/);
    const ceramicDefaults = parseCommercialDefaultsProfile({ currencyCode: "KWD", termsAr: null, termsEn: "Payment: cash\nCeramic scope legal terms", locale: "en" });
    const refreshed = applyWorkspaceDefaults(next, ceramicDefaults, "SUPPLY_ONLY");
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "c1", customer: null, defaults: ceramicDefaults, locale: "en", handoff: { runtimeId: "r2", confirmedFacts: ceramicFacts, commercialLines: [], toolEvidence: [], createdAt: now, workspace: refreshed } });
    expect(draft?.termsAndConditionsEn).toContain("Ceramic scope legal terms");
    expect(draft?.termsAndConditionsEn).not.toMatch(/CCTV|NVR|DVR/);
  });

  it("localizes every scope without leaking raw enums and bounds non-research chat detail", () => {
    for (const scope of ["SUPPLY_ONLY", "SUPPLY_AND_INSTALLATION", "INSTALLATION_ONLY", "SERVICE", "MAINTENANCE", "CONSULTATION", "CUSTOM"]) {
      expect(quotationScopeLabel(scope, "en")).not.toContain("_");
      expect(quotationScopeLabel(scope, "ar")).not.toContain(scope);
    }
    expect(renderGovernedResponse(proposal({ responseContent: "x".repeat(900) }), "en").length).toBeLessThanOrEqual(360);
  });

  it("loads a new complete default profile when scope changes in the runtime", async () => {
    const defaults: WorkspaceDefaultsPort = { loadDefaults: vi.fn(async (_company, scope) => parseCommercialDefaultsProfile({ currencyCode: "KWD", locale: "en", termsAr: null, termsEn: scope === "SUPPLY_ONLY" ? "Payment: cash\nDelivery: 7 days" : "Payment: 50% advance\nDelivery: 21 days" })) };
    const brain: ConversationBrainPort = { decide: async ({ currentMessage }) => proposal({ patches: [
      { operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" },
      { operation: currentMessage.includes("supply only") ? "REPLACE" : "SET", path: "facts.scope.type", value: currentMessage.includes("supply only") ? "SUPPLY_ONLY" : "SUPPLY_AND_INSTALLATION", evidence: currentMessage.includes("supply only") ? "supply only" : "install", provenance: currentMessage.includes("supply only") ? "USER_CORRECTION" : "USER_EXPLICIT" },
    ] }) };
    const runtime = new ConversationRuntime(brain, tools, () => now, ids, defaults);
    let state: ConversationRuntimeState | null = await runtime.execute({ state: null, message: "CCTV install", locale: "en", source: "TEXT", companyId: "c1" });
    expect(state.workspace?.terms).toMatchObject({ payment: "50% advance", delivery: "21 days" });
    state = await runtime.execute({ state, message: "change to supply only CCTV", locale: "en", source: "TEXT", companyId: "c1" });
    expect(state.workspace?.terms).toMatchObject({ payment: "cash", delivery: "7 days", defaultsScope: "SUPPLY_ONLY" });
  });

  it("drops installation-only prerequisites and replaces installation terms when scope changes to supply only", () => {
    const installFacts = { "system.identity": fact("system.identity", "CCTV"), "scope.type": fact("scope.type", "SUPPLY_AND_INSTALLATION") };
    let prior = workspace(installFacts);
    prior = applyWorkspaceDefaults(prior, parseCommercialDefaultsProfile({ currencyCode: "KWD", locale: "en", termsAr: null, termsEn: "Installation legal terms" }), "SUPPLY_AND_INSTALLATION");
    prior.siteAndResponsibilities.siteRequirements = ["Scaffold and drilling access"];
    prior.siteAndResponsibilities.customerResponsibilities = ["Civil openings"];
    prior.siteAndResponsibilities.exclusions = ["Builder works"];
    const supplyFacts = { ...installFacts, "scope.type": fact("scope.type", "SUPPLY_ONLY", "USER_CORRECTION") };
    let next = synchronizeWorkspace(prior, supplyFacts, buildSystemConfigurationGraph(supplyFacts), now);
    next = applyWorkspaceDefaults(next, parseCommercialDefaultsProfile({ currencyCode: "KWD", locale: "en", termsAr: null, termsEn: "Supply only legal terms" }), "SUPPLY_ONLY");

    expect(next.siteAndResponsibilities.siteRequirements).toEqual([]);
    expect(next.siteAndResponsibilities.customerResponsibilities).toEqual([]);
    expect(next.siteAndResponsibilities.exclusions).toEqual(["Builder works"]);
    expect(next.terms.companyTermsEn).toBe("Supply only legal terms");
    expect(next.terms.companyTermsEn).not.toContain("Installation legal terms");
  });
});
