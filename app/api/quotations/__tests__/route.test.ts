import { beforeEach, describe, expect, it, vi } from "vitest";
import { Quotation } from "@/src/domain/quotation";

const mocks = vi.hoisted(() => ({
  existsByNumber: vi.fn(), save: vi.fn(), findInvalidReference: vi.fn(), getCustomerSnapshot: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>, claimLocalization: vi.fn(), findById: vi.fn(),
  completeLocalization: vi.fn(), failLocalization: vi.fn(), translationPort: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (callback: () => unknown) => mocks.afterCallbacks.push(callback) };
});
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({
  PrismaQuotationRepository: class {
    existsByNumber = mocks.existsByNumber; save = mocks.save; findById = mocks.findById;
    findAll = vi.fn(); update = vi.fn(); delete = vi.fn(); claimLocalization = mocks.claimLocalization;
    completeLocalization = mocks.completeLocalization; failLocalization = mocks.failLocalization;
  },
}));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator", () => ({
  PrismaQuotationReferenceValidator: class {
    findInvalidReference = mocks.findInvalidReference; getCustomerSnapshot = mocks.getCustomerSnapshot;
  },
}));
vi.mock("@/src/infrastructure/translation/createTranslationPort", () => ({ createTranslationPort: mocks.translationPort }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError, apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
      try { return await handler(request, {}, { companyId: "company-1" }); }
      catch (error) { return responses.handleApiError(error); }
    },
  };
});

import { POST } from "../route";

let savedQuotation: Quotation | null = null;

const requestBody = {
  customerId: "customer-1", quotationNumber: "Q-CREATE-1", customer: { name: "Ignored" },
  subjectEn: "English proposal", lines: [{ position: 1, type: "PRODUCT", itemName: "Camera", quantity: 1, unitPrice: 10 }],
};

describe("POST /api/quotations localization resilience", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) if (typeof mock === "function" && "mockReset" in mock) (mock as ReturnType<typeof vi.fn>).mockReset();
    mocks.afterCallbacks.length = 0;
    mocks.existsByNumber.mockResolvedValue(false);
    mocks.findInvalidReference.mockResolvedValue(null);
    mocks.getCustomerSnapshot.mockResolvedValue({ name: "Persisted Customer" });
    savedQuotation = null;
    mocks.save.mockImplementation(async (quotation: Quotation) => {
      savedQuotation = Quotation.restore({
      id: "saved-quotation-1", companyId: quotation.companyId, customerId: quotation.customerId,
      number: quotation.number.toString(), status: quotation.status, issueDate: quotation.issueDate,
      expiryDate: quotation.expiryDate, currencyCode: quotation.currencyCode, customer: quotation.customer.toJSON(),
      lines: [...quotation.lines], subjectAr: quotation.subjectAr, subjectEn: quotation.subjectEn,
      localizationStatus: quotation.localizationStatus, localizationRequestedAt: quotation.localizationRequestedAt,
        localizationSourceLocale: quotation.localizationSourceLocale, localizationSourceSignature: quotation.localizationSourceSignature,
      });
      return savedQuotation;
    });
  });

  it("persists exactly once and returns before provider localization runs", async () => {
    mocks.translationPort.mockImplementation(() => { throw new Error("CUDA shared object initialization failed"); });
    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.translationPort).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(JSON.stringify(await response.json())).not.toContain("CUDA");
  });

  it.each([
    ["provider 500", () => Promise.reject(Object.assign(new Error("raw Ollama 500 CUDA failure"), { code: "TRANSLATION_PROVIDER_ERROR" })), "TRANSLATION_PROVIDER_ERROR"],
    ["timeout", () => Promise.reject(Object.assign(new Error("raw timeout"), { code: "TRANSLATION_TIMEOUT" })), "TRANSLATION_TIMEOUT"],
    ["missing line key", () => Promise.resolve({}), "TRANSLATION_INVALID_RESPONSE"],
  ] as const)("returns success before %s and persists the safe background failure", async (_case, translateMany, safeCode) => {
    mocks.translationPort.mockReturnValue({ translateMany });
    mocks.claimLocalization.mockImplementation(async () => ({
      claimToken: "claim-1", sourceSignature: savedQuotation!.localizationSourceSignature!, attemptCount: 1,
    }));
    mocks.findById.mockImplementation(async () => savedQuotation);
    mocks.failLocalization.mockResolvedValue(true);

    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(await mocks.afterCallbacks[0]()).toBe("FAILED");
    expect(mocks.failLocalization).toHaveBeenCalledWith(expect.objectContaining({ errorCode: safeCode }));
    expect(JSON.stringify(await response.json())).not.toMatch(/Ollama|CUDA|raw timeout/);
  });
});
