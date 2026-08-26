import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customer: { findFirst: vi.fn() }, quotation: { groupBy: vi.fn(), findMany: vi.fn() }, salesOrder: { groupBy: vi.fn(), findMany: vi.fn() }, contract: { groupBy: vi.fn(), findMany: vi.fn() }, invoice: { groupBy: vi.fn(), findMany: vi.fn() }, payment: { groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError"); const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: unknown, handler: Function) => async (request: Request) => { try { return await handler(request, { user: { id: "user-1" } }, { companyId: "tenant-trusted", role: "SALES" }); } catch (error) { return responses.handleApiError(error); } } };
});
import { GET } from "../route";

describe("customer commercial summary tenant boundary", () => {
  it("scopes every aggregate and record lookup to the trusted company", async () => {
    mocks.customer.findFirst.mockResolvedValue({ id: "customer-1" });
    for (const model of [mocks.quotation, mocks.salesOrder, mocks.contract, mocks.invoice, mocks.payment]) { model.groupBy.mockResolvedValue([]); model.findMany.mockResolvedValue([]); }
    const response = await GET(new Request("http://localhost/api/customers/customer-1/commercial-summary"));
    expect(response.status).toBe(200);
    expect(mocks.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "customer-1", companyId: "tenant-trusted" }) }));
    for (const model of [mocks.quotation, mocks.salesOrder, mocks.contract, mocks.invoice]) expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: "customer-1", companyId: "tenant-trusted" }) }));
    expect(mocks.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "tenant-trusted", invoice: { customerId: "customer-1" } }) }));
  });
});
