import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findMany: mocks.findMany } } }));
vi.mock("@/lib/api", async () => { const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError"); const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse"); return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, {}, { companyId: "company-1" }); } catch (error) { return responses.handleApiError(error); } } }; });
import { GET } from "../route";
const customer = { id: "c-1", code: "CUS-1", name: "Customer", nameAr: null, nameEn: "Customer" };
describe("receivables aging", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("uses trusted tenant and assigns exact aging buckets", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "future", number: "I-1", invoiceDate: new Date("2026-08-01Z"), dueDate: new Date("2026-09-10Z"), outstandingAmount: "10.000", customer },
      { id: "30", number: "I-2", invoiceDate: new Date("2026-07-01Z"), dueDate: new Date("2026-08-01Z"), outstandingAmount: "20.125", customer },
      { id: "60", number: "I-3", invoiceDate: new Date("2026-06-01Z"), dueDate: new Date("2026-07-01Z"), outstandingAmount: "30.250", customer },
      { id: "90", number: "I-4", invoiceDate: new Date("2026-05-01Z"), dueDate: new Date("2026-06-01Z"), outstandingAmount: "40.375", customer },
      { id: "old", number: "I-5", invoiceDate: new Date("2026-01-01Z"), dueDate: new Date("2026-02-01Z"), outstandingAmount: "50.500", customer },
    ]);
    const response = await GET(new Request("http://localhost/api/reports/receivables-aging?currencyCode=KWD&asOf=2026-08-15")); const data = (await response.json()).data;
    expect(data.totalOutstanding).toBe("151.250"); expect(data.buckets).toEqual({ CURRENT: "10.000", DAYS_0_30: "20.125", DAYS_31_60: "30.250", DAYS_61_90: "40.375", DAYS_90_PLUS: "50.500" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-1", currencyCode: "KWD", status: "ISSUED", outstandingAmount: { gt: 0 } }, take: 1001 }));
  });
  it("rejects invalid currency and impossible dates", async () => { for (const query of ["?currencyCode=", "?currencyCode=KWD&asOf=2026-02-31"]) expect((await GET(new Request(`http://localhost/api/reports/receivables-aging${query}`))).status).toBe(400); expect(mocks.findMany).not.toHaveBeenCalled(); });
});
