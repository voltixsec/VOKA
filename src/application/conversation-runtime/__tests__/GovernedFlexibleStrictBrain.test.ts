import { describe, expect, it, vi } from "vitest";
import {
  ConversationRuntime,
  applyWorkspacePatches,
  buildSystemConfigurationGraph,
  emptySystemConfigurationGraph,
  renderGovernedResponse,
  resolveProductSelection,
  synchronizeWorkspace,
  type CandidateProduct,
  type FlexibleTurnProposal,
  type ConversationBrainPort,
  type ConversationRuntimeState,
  type ConversationToolPort,
  type WorkspaceDefaultsPort,
} from "../index";

const now = "2026-09-01T12:00:00.000Z";
const ids = () => { let value = 0; return () => "turn-" + ++value; };
const tools: ConversationToolPort = { execute: vi.fn(async ({ request }: Parameters<ConversationToolPort["execute"]>[0]) => ({ kind: request.kind, status: "COMPLETED" as const, summary: "governed evidence", evidence: [], createdAt: now })) };
const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({
  responseMode: "ACK", intent: "UPDATE_SOLUTION", patches: [], researchRequests: [], recommendations: [], assumptions: [],
  blockingQuestion: null, responseContent: "Updated.", unresolvedImportantQuestions: [],
  solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [], ...overrides,
});
const run = (brain: ConversationBrainPort, message: string, state: ConversationRuntimeState | null = null, defaults?: WorkspaceDefaultsPort, action: "TURN" | "RECONCILE" = "TURN") =>
  new ConversationRuntime(brain, tools, () => now, ids(), defaults).execute({ state, message, locale: "en", source: "TEXT", companyId: "company-1", action });

describe("Flexible Brain plus Strict Brain architecture", () => {
  it("starts conversationally and creates the governed workspace", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ responseContent: "I can build that CCTV solution.", patches: [{ operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" }] }) };
    const state = await run(brain, "CCTV");
    expect(state.messages.at(-1)?.text).toContain("I can build that CCTV solution.");
    expect(state.messages.at(-1)?.text).toContain("What is the customer name, and who should the quotation be addressed to?");
    expect(state.workspace?.engineering.system?.key).toBe("CCTV");
  });

  it("answers contextually without inventing a question", () => {
    expect(renderGovernedResponse(proposal({ responseMode: "RESULT", responseContent: "A mid-tier IP system is the practical fit." }), "en")).toBe("A mid-tier IP system is the practical fit.");
  });

  it("replaces a corrected value instead of retaining both values", async () => {
    const firstBrain: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.system.cameraCount", value: 6, evidence: "6 cameras", provenance: "USER_EXPLICIT" }] }) };
    const first = await run(firstBrain, "6 cameras");
    const secondBrain: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "REPLACE", path: "facts.system.cameraCount", value: 8, evidence: "8 cameras", provenance: "USER_CORRECTION" }] }) };
    const second = await run(secondBrain, "Correction: 8 cameras", first);
    expect(second.confirmedFacts["system.cameraCount"].value).toBe(8);
    expect(JSON.stringify(second.workspace)).not.toContain('"system.cameraCount":6');
  });

  it("decomposes an unfamiliar system into provisional components", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ patches: [
      { operation: "SET", path: "facts.system.identity", value: "Water treatment skid", evidence: "Water treatment skid", provenance: "USER_EXPLICIT" },
      { operation: "PROPOSE", path: "engineering.components", value: ["Feed pump", "Filter vessel", "Control panel"], evidence: "engineering proposal", provenance: "AI_INFERRED" },
    ] }) };
    const state = await run(brain, "Water treatment skid");
    expect(state.workspace?.engineering.bom.map((line) => line.itemName)).toEqual(["Feed pump", "Filter vessel", "Control panel"]);
    expect(state.workspace?.engineering.bom.every((line) => line.quantity === null && line.unitPrice === null)).toBe(true);
  });

  it("never confirms an AI-inferred BOM quantity merely because it is positive", () => {
    const workspace = synchronizeWorkspace(undefined, {}, emptySystemConfigurationGraph(), now);
    const proposed = applyWorkspacePatches(workspace, [{
      operation: "PROPOSE", path: "engineering.bom", provenance: "AI_INFERRED", evidence: "proposal",
      value: { id: "CAMERAS", componentKeys: ["CAMERAS"], category: "PRODUCT", itemName: "Cameras", itemNameAr: "Cameras", itemNameEn: "Cameras", unitName: "unit", quantity: 8, quantityState: "CONFIRMED", unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "AI_INFERRED" },
    }], "proposal", now);
    expect(proposed.engineering.bom[0]).toMatchObject({ quantity: null, quantityState: "PENDING", provenance: "AI_INFERRED" });
  });

  it("keeps recommendations separate from approval", () => {
    const candidate: CandidateProduct = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Camera X", nameAr: null, nameEn: "Camera X", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" };
    const result = resolveProductSelection({ graph: { ...emptySystemConfigurationGraph(), candidateProducts: [candidate] }, confirmed: {}, message: "recommend the best fit", locale: "en", now });
    expect(result.reply).toContain("not approved");
    expect(result.confirmed).toEqual({});
  });

  it("promotes a specifically named product only after explicit approval", () => {
    const marketPrice = { priceAmount: 42, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "unit", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://supplier.example/x1", priceSourceTitle: "Supplier X1", priceObservedAt: now };
    const candidate: CandidateProduct = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Camera X", nameAr: null, nameEn: "Camera X", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED", marketPrice };
    const baseFacts = {
      "system.identity": { key: "system.identity", value: "CCTV", provenance: "USER_EXPLICIT" as const, evidence: "CCTV", updatedAt: now },
      "system.cameraCount": { key: "system.cameraCount", value: 1, provenance: "USER_EXPLICIT" as const, evidence: "1 camera", updatedAt: now },
    };
    const result = resolveProductSelection({ graph: { ...emptySystemConfigurationGraph(), candidateProducts: [candidate] }, confirmed: baseFacts, message: "Approve Acme X1", locale: "en", now });
    expect(result.confirmed["product.selection.CCTV_CAMERAS.name"].provenance).toBe("USER_APPROVED");
    const graph = { ...buildSystemConfigurationGraph(result.confirmed), candidateProducts: [candidate] };
    const workspace = synchronizeWorkspace(undefined, result.confirmed, graph, now);
    expect(workspace.products.approvedCandidateIds).toEqual(["p1"]);
    expect(workspace.commercialSolution.bom.find((line) => line.id === "CCTV_CAMERAS")).toMatchObject({ brand: "Acme", model: "X1", unitPrice: null, priceState: "PENDING", marketPrice });
  });

  it("cannot claim approval when the governed Workspace leaves the visible candidate unapproved", async () => {
    const facts = {
      "system.identity": { key: "system.identity", value: "CCTV", provenance: "USER_EXPLICIT" as const, evidence: "CCTV", updatedAt: now },
      "system.cameraCount": { key: "system.cameraCount", value: 1, provenance: "USER_EXPLICIT" as const, evidence: "1 camera", updatedAt: now },
    };
    const candidate: CandidateProduct = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Camera X", nameAr: null, nameEn: "Camera X", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" };
    const graph = { ...buildSystemConfigurationGraph(facts), candidateProducts: [candidate] };
    const workspace = synchronizeWorkspace(undefined, facts, graph, now);
    const state: ConversationRuntimeState = {
      runtimeId: "runtime-approval", version: 1, locale: "en", messages: [], confirmedFacts: facts, candidateFacts: [],
      unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "MATURE", transitionState: "EXPLORING",
      compactMemory: "", suggestedReplies: [], handoff: null, solutionGraph: graph, workspace,
    };
    const brain: ConversationBrainPort = { decide: async () => proposal({ responseContent: "The product selection is approved", patches: [{ operation: "APPROVE", path: "products.candidates.p1", value: "p1", evidence: "inferred approval", provenance: "AI_INFERRED" }] }) };
    const result = await run(brain, "Review Acme X1", state);
    expect(result.workspace?.products.candidates.map((item) => item.id)).toContain("p1");
    expect(result.workspace?.products.approvedCandidateIds).not.toContain("p1");
    expect(result.messages.at(-1)?.text).toContain("No product is approved");
    expect(result.messages.at(-1)?.text).not.toContain("The product selection is approved");
  });

  it("auto-syncs the workspace on every normal turn", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.project.name", value: "North Hub", evidence: "North Hub", provenance: "USER_EXPLICIT" }] }) };
    const state = await run(brain, "Project North Hub");
    expect(state.workspace?.commercialContext.project).toBe("North Hub");
  });

  it("reconciles without fabricating a new user turn", async () => {
    const initial: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" }] }) };
    const first = await run(initial, "CCTV");
    const before = first.messages.filter((message) => message.role === "USER").length;
    const reconciler: ConversationBrainPort = { decide: async () => proposal({ responseContent: "Workspace reconciled." }) };
    const result = await run(reconciler, "Reconcile the full conversation", first, undefined, "RECONCILE");
    expect(result.messages.filter((message) => message.role === "USER")).toHaveLength(before);
  });

  it("reloads company defaults when scope enters the workspace", async () => {
    const defaults: WorkspaceDefaultsPort = { loadDefaults: vi.fn(async (_companyId, scope) => ({ currencyCode: "KWD", termsAr: scope + " AR", termsEn: scope + " EN", payment: null, delivery: null, warranty: null, validity: null })) };
    const brain: ConversationBrainPort = { decide: async ({ currentMessage }) => proposal({ patches: [{ operation: currentMessage.includes("change") ? "REPLACE" : "SET", path: "facts.scope.type", value: currentMessage.includes("change") ? "SUPPLY_ONLY" : "SUPPLY_AND_INSTALLATION", evidence: currentMessage, provenance: currentMessage.includes("change") ? "USER_CORRECTION" : "USER_EXPLICIT" }] }) };
    const initial = await run(brain, "Supply and installation", null, defaults);
    const state = await run(brain, "change to supply only", initial, defaults);
    expect(defaults.loadDefaults).toHaveBeenNthCalledWith(1, "company-1", "SUPPLY_AND_INSTALLATION", "en");
    expect(defaults.loadDefaults).toHaveBeenCalledWith("company-1", "SUPPLY_ONLY", "en");
    expect(state.workspace?.terms).toMatchObject({ currencyCode: "KWD", companyTermsEn: "SUPPLY_ONLY EN", defaultsScope: "SUPPLY_ONLY" });
    expect(state.workspace?.terms.companyTermsEn).not.toContain("SUPPLY_AND_INSTALLATION");
  });

  it("stores site requirements and responsibilities as structured lists", () => {
    const workspace = synchronizeWorkspace(undefined, {}, emptySystemConfigurationGraph(), now);
    const updated = applyWorkspacePatches(workspace, [
      { operation: "SET", path: "siteAndResponsibilities.siteRequirements", value: ["Clear access"], evidence: "Clear access", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "siteAndResponsibilities.customerResponsibilities", value: ["Provide power"], evidence: "Provide power", provenance: "USER_EXPLICIT" },
    ], "Clear access and Provide power", now);
    expect(updated.siteAndResponsibilities).toMatchObject({ siteRequirements: ["Clear access"], customerResponsibilities: ["Provide power"] });
  });

  it("does not promote AI-inferred exploratory product chatter into customer-facing Notes", () => {
    const workspace = synchronizeWorkspace(undefined, {}, emptySystemConfigurationGraph(), now);
    const updated = applyWorkspacePatches(workspace, [
      { operation: "SET", path: "siteAndResponsibilities.notes", value: ["Compare NVR models and their prices"], evidence: "exploratory discussion", provenance: "AI_INFERRED" },
    ], "Compare NVR models and their prices", now);
    expect(updated.siteAndResponsibilities.notes).toEqual([]);
  });

  it("allows an early Draft while quantities and prices remain pending", () => {
    const facts = { "system.identity": { key: "system.identity", value: "CCTV", provenance: "USER_EXPLICIT" as const, evidence: "CCTV", updatedAt: now }, "customer.name": { key: "customer.name", value: "Proposed Customer", provenance: "USER_EXPLICIT" as const, evidence: "Proposed Customer", updatedAt: now } };
    const graph = buildSystemConfigurationGraph(facts);
    expect(graph.readiness).toMatchObject({ draftReady: true, pendingBeforeDraftOpen: [] });
    expect(graph.readiness.pendingBeforeFinalIssue).not.toContain("Customer");
    expect(graph.salesBom.every((line) => line.unitPrice === null)).toBe(true);
  });

  it("renders no more than one blocking question", () => {
    const rendered = renderGovernedResponse(proposal({ responseMode: "QUESTION", responseContent: "Ready? I prepared the base solution.", blockingQuestion: "Indoor or outdoor?" }), "en");
    expect(rendered.match(/\?/g)).toHaveLength(1);
  });

  it("uses localized deterministic fallbacks without exposing enums", () => {
    expect(renderGovernedResponse(proposal({ responseContent: "" }), "ar")).toBe("\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062d\u0644.");
    expect(renderGovernedResponse(proposal({ responseContent: "" }), "en")).toBe("The solution is updated.");
    expect(renderGovernedResponse(proposal({ responseContent: "" }), "en")).not.toMatch(/ACK|RESULT|RESEARCH_RESULT/);
  });

  it("terminates a repeated tool request instead of looping indefinitely", async () => {
    let decisions = 0;
    const executeTool = vi.fn(tools.execute);
    const base = await new ConversationRuntime({ decide: async () => proposal({ patches: [
      { operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "facts.system.jurisdiction", value: "Kuwait", evidence: "Kuwait", provenance: "USER_EXPLICIT" },
    ] }) }, { execute: executeTool }, () => now, ids()).execute({ state: null, message: "CCTV Kuwait", locale: "en", source: "TEXT", companyId: "company-1" });
    executeTool.mockClear();
    const runtime = new ConversationRuntime({ decide: async () => { decisions++; return proposal({ researchRequests: [{ kind: "RESEARCH", query: "same query", attachmentId: null }] }); } }, { execute: executeTool }, () => now, ids());
    await runtime.execute({ state: base, message: "Find options", locale: "en", source: "TEXT", companyId: "company-1" });
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool.mock.calls.map(([input]) => input.request.kind)).toEqual(["CATALOG_LOOKUP", "RESEARCH"]);
    expect(decisions).toBe(3);
  });

  it("removes stale structured values explicitly", () => {
    const workspace = synchronizeWorkspace(undefined, {}, emptySystemConfigurationGraph(), now);
    const withNote = applyWorkspacePatches(workspace, [{ operation: "SET", path: "siteAndResponsibilities.notes", value: ["Old note"], evidence: "Old note", provenance: "USER_EXPLICIT" }], "Old note", now);
    const clean = applyWorkspacePatches(withNote, [{ operation: "REMOVE", path: "siteAndResponsibilities.notes", value: null, evidence: "remove", provenance: "AI_INFERRED" }], "remove", now);
    expect(clean.siteAndResponsibilities.notes).toEqual([]);
  });

  it("clears an old provisional decomposition when the system changes", () => {
    const oldGraph = { ...emptySystemConfigurationGraph(), system: { key: "OLD", nameAr: "Old", nameEn: "Old" } };
    const oldWorkspace = applyWorkspacePatches(synchronizeWorkspace(undefined, {}, oldGraph, now), [{ operation: "PROPOSE", path: "engineering.components", value: ["Old component"], evidence: "proposal", provenance: "AI_INFERRED" }], "proposal", now);
    const nextGraph = { ...emptySystemConfigurationGraph(), system: { key: "NEW", nameAr: "New", nameEn: "New" } };
    expect(synchronizeWorkspace(oldWorkspace, {}, nextGraph, now).engineering.bom).toEqual([]);
  });

  it("preserves site context for normal corrections but resets it for a genuinely new system", () => {
    const oldGraph = { ...emptySystemConfigurationGraph(), system: { key: "CCTV", nameAr: "CCTV", nameEn: "CCTV" } };
    const withSite = applyWorkspacePatches(synchronizeWorkspace(undefined, {}, oldGraph, now), [{ operation: "SET", path: "siteAndResponsibilities.siteRequirements", value: ["Lift access"], evidence: "Lift access", provenance: "USER_EXPLICIT" }], "Lift access", now);
    expect(synchronizeWorkspace(withSite, {}, oldGraph, now).siteAndResponsibilities.siteRequirements).toEqual(["Lift access"]);
    const newGraph = { ...emptySystemConfigurationGraph(), system: { key: "CERAMIC", nameAr: "Ceramic", nameEn: "Ceramic" } };
    expect(synchronizeWorkspace(withSite, {}, newGraph, now).siteAndResponsibilities.siteRequirements).toEqual([]);
  });

  it("rejects an incomplete production structured proposal instead of silently falling back", async () => {
    const brain: ConversationBrainPort = { decide: async () => ({ responseMode: "ACK" } as never) };
    await expect(run(brain, "CCTV")).rejects.toThrow("FLEXIBLE_TURN_PROPOSAL_INVALID");
  });

  it("passes the sequential acceptance scenario without stale counts, fake prices, or implicit approval", async () => {
    const candidate: CandidateProduct = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Acme Camera X1", nameAr: null, nameEn: "Acme Camera X1", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED", sourceUrl: "https://acme.example/x1" };
    const candidateTools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "COMPLETED" as const, summary: "catalog then web", evidence: [], candidateProducts: [candidate], catalogResolution: "RESEARCHED_SUGGESTIONS" as const, createdAt: now })) };
    const brain: ConversationBrainPort = { decide: async ({ currentMessage }) => {
      if (currentMessage === "CCTV 6 cameras") return proposal({ patches: [
        { operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" },
        { operation: "SET", path: "facts.system.cameraCount", value: 6, evidence: "6 cameras", provenance: "USER_EXPLICIT" },
      ] });
      if (currentMessage.includes("8 cameras")) return proposal({ patches: [{ operation: "REPLACE", path: "facts.system.cameraCount", value: 8, evidence: "8 cameras", provenance: "USER_CORRECTION" }] });
      if (currentMessage.includes("options")) return proposal({ responseMode: "RESULT", responseContent: "Product options are ready.", researchRequests: [{ kind: "CATALOG_LOOKUP", query: "Top 3 CCTV cameras", attachmentId: null }] });
      if (currentMessage.includes("recommend")) return proposal({ recommendations: [{ id: "r1", title: "Acme X1", rationale: "Suitable provisional fit", candidateId: "p1" }] });
      if (currentMessage.includes("Approve")) return proposal({ responseContent: "Selection recorded." });
      return proposal();
    } };
    const runtime = new ConversationRuntime(brain, candidateTools, () => now, ids());
    const input = (state: ConversationRuntimeState | null, message: string) => runtime.execute({ state, message, locale: "en", source: "TEXT", companyId: "company-1" });
    const first = await input(null, "CCTV 6 cameras");
    const corrected = await input(first, "Correction: 8 cameras");
    const options = await input(corrected, "Show product options");
    const recommended = await input(options, "recommend the best fit");
    const approved = await input(recommended, "Approve Acme X1");
    expect(corrected.confirmedFacts["system.cameraCount"].value).toBe(8);
    expect(options.workspace?.products.candidates).toHaveLength(1);
    expect(candidateTools.execute).toHaveBeenCalledOnce();
    expect(recommended.confirmedFacts["product.selection.CCTV_CAMERAS.name"]).toBeUndefined();
    expect(approved.confirmedFacts["product.selection.CCTV_CAMERAS.name"].provenance).toBe("USER_APPROVED");
    expect(approved.solutionGraph?.salesBom.find((line) => line.id === "CCTV_CAMERAS")).toMatchObject({ model: "X1", unitPrice: null, priceState: "PENDING" });
  });
});
