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
});
