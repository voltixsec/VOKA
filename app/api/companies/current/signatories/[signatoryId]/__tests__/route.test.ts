import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  authorizedSignatory: { findFirst: mocks.findFirst },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
    try { return await handler(request, {}, { companyId: "company-1", role: "OWNER" }); } catch (error) { return responses.handleApiError(error); }
  } };
});

import { PATCH } from "../route";

const current = { id: "s-1", companyId: "company-1", nameAr: null, nameEn: "Ahmed", titleAr: null, titleEn: "Director", signatureUrl: null, isActive: true, isDefault: false, allowedDocumentTypes: ["QUOTATION"] };

describe("authorized signatory update", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.findFirst.mockResolvedValue(current);
    mocks.transaction.mockImplementation((work) => work({ authorizedSignatory: { update: mocks.update, updateMany: mocks.updateMany } }));
    mocks.update.mockResolvedValue({ ...current, isDefault: true });
  });

  it("uses tenant ownership and atomically replaces the default", async () => {
    const response = await PATCH(new Request("http://localhost/api/companies/current/signatories/s-1", { method: "PATCH", body: JSON.stringify({ isDefault: true }) }));
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "s-1", companyId: "company-1" } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { companyId: "company-1", isDefault: true, id: { not: "s-1" } }, data: { isDefault: false } });
  });

  it("cannot deactivate the default signatory", async () => {
    mocks.findFirst.mockResolvedValue({ ...current, isDefault: true });
    const response = await PATCH(new Request("http://localhost/api/companies/current/signatories/s-1", { method: "PATCH", body: JSON.stringify({ isActive: false }) }));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
