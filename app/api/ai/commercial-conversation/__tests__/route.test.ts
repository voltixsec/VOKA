import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateDraftProposal: vi.fn() }));
vi.mock("@/src/infrastructure/ai/createAISalesAssistantService", () => ({ createAISalesAssistantService: () => ({ generateDraftProposal: mocks.generateDraftProposal }) }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } } };
});

import { POST } from "../route";

const proposal = {
  customer: { status: "MISSING", id: null, mention: null, name: null, email: null, phone: null, candidates: [], reviewRequired: true },
  proposal: { subject: "نظام كاميرات", subjectAr: "نظام كاميرات", subjectEn: null, brief: null, briefAr: null, briefEn: null, projectName: null, attentionName: null, scopeType: "SUPPLY_AND_INSTALLATION", currencyCode: "KWD", priceListId: null },
  lines: [{ resolutionStatus: "MISSING", type: "PRODUCT", catalogItemId: null, catalogCandidates: [], itemName: "كاميرات مراقبة", itemNameAr: "كاميرات مراقبة", itemNameEn: "CCTV cameras", description: null, descriptionAr: null, descriptionEn: null, quantity: 8, requestedUnitText: "PCS", unitName: "PCS", unitNameAr: "قطعة", unitNameEn: "PCS", requestedPrice: null, unitPrice: null, subtotal: null, taxRateId: null, taxPercentage: 0, reviewRequired: true, provenance: "USER_PROVIDED", componentKey: "CCTV_CAMERAS" }],
  financials: null, notes: null, notesAr: null, notesEn: null, termsAndConditions: null, termsAndConditionsAr: null, termsAndConditionsEn: null, reviewRequired: true,
  smartSystem: { systemType: "CCTV", templateVersion: "1", systemNameAr: "نظام كاميرات مراقبة", systemNameEn: "CCTV System", status: "COMPLETE", inputs: [], missingInputs: [], warnings: [] },
  metadata: { sourceLocale: "ar", extractionMode: "heuristic", confidenceSummary: "review", warnings: [] },
};

describe("POST /api/ai/commercial-conversation intelligence fusion", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generateDraftProposal.mockResolvedValue(proposal); });

  it("uses canonical Sales Assistant lines before reporting missing requirements", async () => {
    const request = new Request("http://localhost/api/ai/commercial-conversation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reply: "عايز عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا", replySource: "VOICE", locale: "ar", documentMode: "QUOTATION", buildMode: "AUTO" }) });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.generateDraftProposal).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-1", buildMode: "AUTO" }));
    expect(body.data.canonicalProposal.smartSystem.systemType).toBe("CCTV");
    expect(body.data.missingRequired.map((field: { key: string }) => field.key)).toEqual(["customer"]);
    expect(body.data.requiresHumanReview).toBe(true);
    expect(body.data.executed).toBe(false);
  });
});
