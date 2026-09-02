import { describe, expect, it, vi } from "vitest";
import {
  ConversationRuntime,
  buildSystemConfigurationGraph,
  synchronizeWorkspace,
  type CandidateProduct,
  type ConfirmedFact,
  type ConversationBrainPort,
  type ConversationRuntimeState,
  type ConversationToolPort,
  type FlexibleTurnProposal,
} from "../index";

const now = "2026-09-01T12:00:00.000Z";
const ids = () => { let id = 0; return () => `research-${++id}`; };
const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: now });
const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({
  responseMode: "ACK", intent: "PRODUCT_RESEARCH", patches: [], researchRequests: [], recommendations: [], assumptions: [],
  blockingQuestion: null, responseContent: "تمام، هدورلك.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE",
  transition: "NONE", compactMemory: "CCTV in Kuwait", suggestedReplies: [], ...overrides,
});
const candidate = (id: number): CandidateProduct => ({
  id: `web-${id}`, componentKey: "CCTV_CAMERAS", name: `Camera ${id}`, nameAr: null, nameEn: `Camera ${id}`,
  brand: `Brand ${id}`, model: `MODEL-${id}`, sku: null, price: null, source: "RESEARCHED",
  sourceUrl: `https://manufacturer.example/camera-${id}`, sourceTitle: `Official Camera ${id}`,
  jurisdictionRelevance: "Kuwait market evidence", confidence: 0.85,
});

function state(): ConversationRuntimeState {
  const confirmedFacts = {
    "system.identity": fact("system.identity", "CCTV"),
    "system.jurisdiction": fact("system.jurisdiction", "Kuwait"),
    "system.cameraCount": fact("system.cameraCount", 6),
  };
  const graph = buildSystemConfigurationGraph(confirmedFacts);
  return {
    runtimeId: "runtime-1", version: 1, locale: "ar", messages: [], confirmedFacts, candidateFacts: [],
    unresolvedImportantQuestions: [], toolResults: [{ kind: "RESEARCH", purpose: "JURISDICTION_RULE", status: "UNAVAILABLE", summary: "No authoritative rule evidence found; engineering defaults remain estimated.", evidence: [], createdAt: now }], solutionReadiness: "MATURE", transitionState: "EXPLORING",
    compactMemory: "", suggestedReplies: [], handoff: null, solutionGraph: graph,
    workspace: synchronizeWorkspace(undefined, confirmedFacts, graph, now),
  };
}

function stagedBrain(): ConversationBrainPort {
  return { decide: vi.fn(async ({ toolResults }) => {
    if (!toolResults.length) return proposal({ researchRequests: [{ kind: "CATALOG_LOOKUP", query: "أفضل 3 كاميرات للكويت", attachmentId: null }] });
    if (toolResults.at(-1)?.kind === "CATALOG_LOOKUP") return proposal({ researchRequests: [{ kind: "RESEARCH", query: "أفضل 3 كاميرات للكويت", attachmentId: null }] });
    return proposal({ responseMode: "RESEARCH_RESULT", responseContent: "النتائج جاهزة." });
  }) };
}

describe("live-like catalog to web research path", () => {
  it("executes Arabic catalog-to-web research once and projects candidates into chat, state, and Workspace", async () => {
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request, graph }) => request.kind === "CATALOG_LOOKUP"
      ? { kind: request.kind, status: "UNAVAILABLE" as const, summary: "catalog insufficient", evidence: [], candidateProducts: [], catalogResolution: "CATALOG_INSUFFICIENT" as const, createdAt: now }
      : { kind: request.kind, status: "COMPLETED" as const, summary: "web complete", evidence: [{ title: "Official Camera 1", url: "https://manufacturer.example/camera-1", publisher: "manufacturer.example" }], candidateProducts: [candidate(1), candidate(2), candidate(3)], catalogResolution: "RESEARCHED_SUGGESTIONS" as const, createdAt: now }) };
    const runtime = new ConversationRuntime(stagedBrain(), tools, () => now, ids());
    const result = await runtime.execute({ state: state(), message: "شوفلي أفضل 3 اختيارات حقيقية مناسبة للكويت", locale: "ar", source: "TEXT", companyId: "tenant-1" });

    expect(tools.execute).toHaveBeenCalledTimes(2);
    expect(tools.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ request: expect.objectContaining({ kind: "CATALOG_LOOKUP" }) }));
    expect(tools.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ request: expect.objectContaining({ kind: "RESEARCH" }), graph: expect.objectContaining({ candidateProducts: [] }) }));
    expect(result.solutionGraph?.candidateProducts).toHaveLength(3);
    expect(result.workspace?.products.candidates).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(result)).workspace.products.candidates[0]).toMatchObject({ brand: "Brand 1", model: "MODEL-1", sourceUrl: "https://manufacturer.example/camera-1" });
    expect(result.messages.at(-1)?.text).toContain("Brand 1 - MODEL-1");
    expect(result.messages.at(-1)?.text).not.toContain("CCTV_CAMERAS");
  });

  it("does not invoke web research when the catalog is sufficient", async () => {
    const catalog = [candidate(1), candidate(2), candidate(3)].map((item) => ({ ...item, source: "VERIFIED_CATALOG" as const, sourceUrl: null, sourceTitle: null }));
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "COMPLETED" as const, summary: "catalog complete", evidence: [], candidateProducts: catalog, catalogResolution: "CATALOG_MATCHED" as const, createdAt: now })) };
    const result = await new ConversationRuntime(stagedBrain(), tools, () => now, ids()).execute({ state: state(), message: "دورلي على ماركات", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(result.workspace?.products.candidates).toHaveLength(3);
  });

  it("replaces a fake future-search acknowledgement with an explicit failure when no candidate evidence survives", async () => {
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "UNAVAILABLE" as const, summary: "no reliable result", evidence: [], candidateProducts: [], catalogResolution: "CATALOG_INSUFFICIENT" as const, createdAt: now })) };
    const result = await new ConversationRuntime(stagedBrain(), tools, () => now, ids()).execute({ state: state(), message: "دور على النت", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(result.messages.at(-1)?.text).toContain("لم أستطع تثبيت بدائل موثوقة");
    expect(result.messages.at(-1)?.text).not.toMatch(/هدور|سأبحث|لقيت/);
    expect(tools.execute).toHaveBeenCalledTimes(2);
  });

  it("does not retain future-search wording after successful technical research evidence", async () => {
    const brain: ConversationBrainPort = { decide: vi.fn(async () => proposal({ researchRequests: [{ kind: "RESEARCH", query: "Kuwait CCTV authority guidance", attachmentId: null }], responseContent: "سأبحث في المصادر." })) };
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "COMPLETED" as const, summary: "authority guidance", evidence: [{ title: "Authority guidance", url: "https://authority.gov.kw/guidance", publisher: "authority.gov.kw" }], createdAt: now })) };
    const result = await new ConversationRuntime(brain, tools, () => now, ids()).execute({ state: state(), message: "راجع متطلبات الكويت", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(result.messages.at(-1)?.text).toContain("راجعت المصادر المتاحة");
    expect(result.messages.at(-1)?.text).not.toContain("سأبحث");
    expect(tools.execute).toHaveBeenCalledOnce();
  });

  it("preserves a prior unfamiliar-system Workspace BOM when invoking catalog lookup", async () => {
    const base = state();
    const system = { key: "VEHICLE_ELEVATOR", nameAr: "مصعد سيارات", nameEn: "Vehicle elevator" };
    const line = { id: "VEHICLE_ELEVATOR_CONTROLLER", componentKeys: ["VEHICLE_ELEVATOR_CONTROLLER"], category: "PRODUCT", itemName: "Controller", itemNameAr: "لوحة تحكم", itemNameEn: "Controller", unitName: null, quantity: null, quantityState: "PENDING" as const, unitPrice: null, priceState: "PENDING" as const, type: "PRODUCT" as const, provenance: "AI_INFERRED" as const };
    base.confirmedFacts["system.identity"] = fact("system.identity", "Vehicle elevator");
    base.solutionGraph = { ...base.solutionGraph!, system, engineeringBom: [line], salesBom: [line] };
    base.workspace = { ...base.workspace!, engineering: { ...base.workspace!.engineering, system, bom: [line] }, commercialSolution: { bom: [line] } };
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request, graph }) => ({ kind: request.kind, status: "COMPLETED" as const, summary: "catalog", evidence: [], candidateProducts: [], catalogResolution: "CATALOG_MATCHED" as const, createdAt: now, inspectedBomCount: graph.salesBom.length } as never)) };
    await new ConversationRuntime({ decide: async () => proposal({ researchRequests: [{ kind: "CATALOG_LOOKUP", query: "brands", attachmentId: null }] }) }, tools, () => now, ids()).execute({ state: base, message: "شوفلي ماركات مناسبة", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(tools.execute).toHaveBeenCalledWith(expect.objectContaining({ graph: expect.objectContaining({ salesBom: [expect.objectContaining({ id: "VEHICLE_ELEVATOR_CONTROLLER" })] }) }));
  });

  it("asks once for the target market after catalog insufficiency and makes no premature paid web call", async () => {
    const base = state(); delete base.confirmedFacts["system.jurisdiction"];
    const graph = buildSystemConfigurationGraph(base.confirmedFacts); base.solutionGraph = graph; base.workspace = synchronizeWorkspace(undefined, base.confirmedFacts, graph, now);
    const tools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "UNAVAILABLE" as const, summary: "catalog insufficient", evidence: [], candidateProducts: [], catalogResolution: "CATALOG_INSUFFICIENT" as const, createdAt: now })) };
    const result = await new ConversationRuntime(stagedBrain(), tools, () => now, ids()).execute({ state: base, message: "دورلي على أفضل كاميرات", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(vi.mocked(tools.execute).mock.calls[0][0].request.kind).toBe("CATALOG_LOOKUP");
    expect(result.messages.at(-1)?.text).toContain("السوق أو البلد المستهدف إيه؟");
  });
});
