import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), verify: vi.fn() }));
vi.mock("@/src/infrastructure/ai/createConversationRuntime", () => ({ createConversationRuntime: () => ({ execute: mocks.execute }) }));
vi.mock("@/src/infrastructure/ai/ConversationStateToken", () => ({ signConversationState: vi.fn().mockResolvedValue("signed-state"), verifyConversationState: mocks.verify }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } } };
});
import { POST } from "../route";

describe("POST /api/ai/conversation-runtime", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({ runtimeId: "r1", version: 1, messages: [] }); mocks.verify.mockResolvedValue({ runtimeId: "r1", version: 1, messages: [], confirmedFacts: {}, candidateFacts: [] }); });
  it("sends text and voice through the same clean runtime with tenant scope", async () => {
    for (const source of ["TEXT", "VOICE"] as const) {
      const request = new Request("http://localhost/api/ai/conversation-runtime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: null, message: "مصعد سيارات", locale: "ar", source }) });
      expect((await POST(request)).status).toBe(200);
      expect(mocks.execute).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: "tenant-1", message: "مصعد سيارات", source }));
    }
  });
  it("rejects invalid input before invoking the brain", async () => {
    const request = new Request("http://localhost/api/ai/conversation-runtime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "", locale: "ar", source: "TEXT" }) });
    expect((await POST(request)).status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("runs full-conversation reconciliation without requiring a synthetic user message", async () => {
    const request = new Request("http://localhost/api/ai/conversation-runtime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed" }, action: "RECONCILE", locale: "en", source: "CHIP" }) });
    expect((await POST(request)).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ action: "RECONCILE", source: "CHIP" }));
  });
});
