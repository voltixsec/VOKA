import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), verify: vi.fn(), roles: [] as readonly string[] }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/src/infrastructure/ai/createCommercialHandoffQuotationService", () => ({ createCommercialHandoffQuotationService: () => ({ execute: mocks.execute }) }));
vi.mock("@/src/infrastructure/ai/CommercialHandoffToken", () => ({ verifyCommercialHandoff: mocks.verify }));
vi.mock("@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner", () => ({ QuotationLocalizationJobRunner: class { run = vi.fn(); } }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({ PrismaQuotationRepository: class {} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (roles: readonly string[], handler: Function) => { mocks.roles = roles; return async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } }; } };
});
import { POST } from "../route";

const handoff = { runtimeId: "runtime-1", confirmedFacts: {}, commercialLines: [], toolEvidence: [], createdAt: "2026-08-31T00:00:00.000Z" };
function request(body: unknown) { return new Request("http://localhost/api/ai/conversation-runtime/quotation-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("POST /api/ai/conversation-runtime/quotation-draft", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockResolvedValue(handoff); mocks.execute.mockResolvedValue({ status: "CREATED", quotationId: "quotation-1", navigationTarget: "/dashboard/quotations/quotation-1/edit", localizationPending: false }); });
  it("verifies the company-bound handoff and creates a draft in the current tenant", async () => {
    const response = await POST(request({ handoffToken: "signed-token", locale: "en" }));
    expect(response.status).toBe(201);
    expect(mocks.roles).toEqual(["OWNER", "ADMIN", "SALES"]);
    expect(mocks.verify).toHaveBeenCalledWith("signed-token", "tenant-1");
    expect(mocks.execute).toHaveBeenCalledWith({ companyId: "tenant-1", handoff, locale: "en" });
    expect(await response.json()).toMatchObject({ data: { status: "CREATED", quotationId: "quotation-1" } });
  });
  it("returns an ambiguous-customer selection blocker without creating or approving anything", async () => {
    mocks.execute.mockResolvedValue({ status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.selection", candidates: [{ id: "c1", name: "North Co" }] }] });
    const response = await POST(request({ handoffToken: "signed-token", locale: "ar" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.selection" }] } });
  });
  it("rejects an invalid or cross-tenant token before the quotation service runs", async () => {
    mocks.verify.mockRejectedValue(new Error("COMMERCIAL_HANDOFF_INVALID"));
    const response = await POST(request({ handoffToken: "other-tenant-token", locale: "en" }));
    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects malformed requests before verification", async () => {
    const response = await POST(request({ handoffToken: "", locale: "fr" }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
