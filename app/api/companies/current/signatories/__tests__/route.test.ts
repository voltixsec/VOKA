import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  authorizedSignatory: { findMany: mocks.findMany },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
    try { return await handler(request, {}, { companyId: "company-1", role: "OWNER" }); } catch (error) { return responses.handleApiError(error); }
  } };
});

import { GET, POST } from "../route";

describe("authorized signatories collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((work) => work({ authorizedSignatory: { create: mocks.create, updateMany: mocks.updateMany } }));
  });

  it("lists only the authenticated tenant signatories", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/companies/current/signatories"));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-1" } }));
  });

  it("creates a validated default signatory and clears the previous tenant default", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: "s-1", ...data }));
    const response = await POST(new Request("http://localhost/api/companies/current/signatories", { method: "POST", body: JSON.stringify({
      nameEn: "Ahmed", titleEn: "Director", signatureUrl: "data:image/png;base64,AAAA", isDefault: true, allowedDocumentTypes: ["QUOTATION", "INVOICE"],
    }) }));
    expect(response.status).toBe(201);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { companyId: "company-1", isDefault: true }, data: { isDefault: false } });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: "company-1", allowedDocumentTypes: ["QUOTATION", "INVOICE"] }) });
  });

  it("rejects unsupported document types and malformed signature data", async () => {
    for (const body of [
      { nameEn: "Ahmed", titleEn: "Director", allowedDocumentTypes: ["PURCHASE_ORDER"] },
      { nameEn: "Ahmed", titleEn: "Director", allowedDocumentTypes: ["QUOTATION"], signatureUrl: "https://unsafe.example/signature.png" },
    ]) {
      const response = await POST(new Request("http://localhost/api/companies/current/signatories", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
