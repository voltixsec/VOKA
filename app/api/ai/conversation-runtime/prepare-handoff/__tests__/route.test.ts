import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), sign: vi.fn(), roles: [] as readonly string[] }));
vi.mock("@/src/infrastructure/ai/ConversationStateToken", () => ({ verifyConversationState: mocks.verify }));
vi.mock("@/src/infrastructure/ai/CommercialHandoffToken", () => ({ signCommercialHandoff: mocks.sign }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (roles: readonly string[], handler: Function) => { mocks.roles = roles; return async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } }; } };
});
import { POST } from "../route";

describe("POST /api/ai/conversation-runtime/prepare-handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sign.mockResolvedValue("signed-handoff");
    mocks.verify.mockResolvedValue({
      runtimeId: "runtime-1", version: 1, locale: "en",
      messages: [{ id: "u1", role: "USER", text: "CCTV supply only", source: "TEXT", createdAt: "2026-09-01T00:00:00.000Z" }],
      confirmedFacts: {
        "system.identity": { key: "system.identity", value: "CCTV", provenance: "USER_EXPLICIT", evidence: "CCTV", updatedAt: "2026-09-01T00:00:00.000Z" },
        "scope.type": { key: "scope.type", value: "SUPPLY_ONLY", provenance: "USER_EXPLICIT", evidence: "supply only", updatedAt: "2026-09-01T00:00:00.000Z" },
      },
      candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], suggestedReplies: [], compactMemory: "",
      solutionReadiness: "MATURE", transitionState: "EXPLORING", handoff: null,
    });
  });

  it("prepares a signed handoff with customer, project, and attention absent", async () => {
    const request = new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed-state" } }) });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.roles).toEqual(["OWNER", "ADMIN", "SALES"]);
    const handoff = mocks.sign.mock.calls[0][0];
    expect(handoff.confirmedFacts["customer.name"]).toBeUndefined();
    expect(handoff.confirmedFacts["project.name"]).toBeUndefined();
    expect(handoff.confirmedFacts["attention.name"]).toBeUndefined();
    expect(await response.json()).toMatchObject({ data: { handoffToken: "signed-handoff" } });
  });

  it("projects the exact final governed workspace BOM without aggregating component lines", async () => {
    const base = await mocks.verify();
    const line = (id: string, name: string, quantity: number) => ({ id, componentKeys: [id], category: "PRODUCT", itemName: name, itemNameAr: name, itemNameEn: name, description: `${name} specification`, unitName: "pcs", quantity, quantityState: "CONFIRMED", unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "USER_EXPLICIT" });
    const outdoor = line("CCTV_OUTDOOR_CAMERA", "Outdoor IP Camera", 200);
    const indoor = line("CCTV_INDOOR_CAMERA", "Indoor IP Camera", 140);
    mocks.verify.mockResolvedValue({ ...base, workspace: {
      commercialContext: { customer: null, project: null, attention: null, scope: "SUPPLY_ONLY", jurisdiction: "Kuwait" },
      requirements: {}, engineering: { system: { key: "CCTV", nameAr: "CCTV", nameEn: "CCTV" }, calculations: [], bom: [outdoor, indoor], assumptions: [] },
      commercialSolution: { bom: [outdoor, indoor] }, products: { candidates: [], approvedCandidateIds: [] },
      siteAndResponsibilities: { siteRequirements: [], supplierResponsibilities: [], customerResponsibilities: [], exclusions: [], notes: [] },
      terms: { payment: null, delivery: null, warranty: null, validity: null, sources: { payment: null, delivery: null, warranty: null, validity: null }, currencyCode: "KWD", companyTermsAr: null, companyTermsEn: null, defaultsScope: "SUPPLY_ONLY", defaultsLoaded: true },
      readiness: { draftReady: true, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: ["Pricing"] }, updatedAt: "2026-09-01T00:00:00.000Z",
    } });

    await POST(new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed-state" } }) }));

    expect(mocks.sign.mock.calls[0][0].commercialLines.map((item: { itemName: string; quantity: number }) => [item.itemName, item.quantity])).toEqual([
      ["Outdoor IP Camera", 200],
      ["Indoor IP Camera", 140],
    ]);
  });
});
