import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ customer: vi.fn(), invoiceAggregate: vi.fn(), paymentAggregate: vi.fn(), invoices: vi.fn(), payments: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  customer: { findFirst: mocks.customer }, invoice: { aggregate: mocks.invoiceAggregate, findMany: mocks.invoices }, payment: { aggregate: mocks.paymentAggregate, findMany: mocks.payments },
} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError"); const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => { try { return await handler(request, {}, { companyId: "company-1", role: "VIEWER" }); } catch (error) { return responses.handleApiError(error); } } };
});
import { GET } from "../route";

describe("customer statement", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.customer.mockResolvedValue({ id: "customer-1", code: "CUS-1", name: "Customer", nameAr: null, nameEn: "Customer" });
    mocks.invoiceAggregate.mockResolvedValueOnce({ _sum: { totalAmount: "100.000" } }).mockResolvedValueOnce({ _sum: { outstandingAmount: "90.000" } });
    mocks.paymentAggregate.mockResolvedValue({ _sum: { amount: "25.000" } });
    mocks.invoices.mockResolvedValue([{ id: "i-1", number: "INV-1", invoiceDate: new Date("2026-02-01T00:00:00Z"), totalAmount: "50.125" }]);
    mocks.payments.mockResolvedValue([{ id: "p-1", amount: "10.125", receivedAt: new Date("2026-02-02T00:00:00Z"), reference: null, invoice: { number: "INV-1" } }]);
  });
  it("builds exact debit/credit running balances from tenant-owned issued invoices", async () => {
    const response = await GET(new Request("http://localhost/api/customers/customer-1/statement?currencyCode=KWD&from=2026-01-01&to=2026-12-31"));
    expect(response.status).toBe(200); const data = (await response.json()).data;
    expect(data.openingBalance).toBe("75.000"); expect(data.entries).toEqual([
      expect.objectContaining({ kind: "INVOICE", debit: "50.125", credit: "0.000", runningBalance: "125.125" }),
      expect.objectContaining({ kind: "PAYMENT", debit: "0.000", credit: "10.125", runningBalance: "115.000", reference: "INV-1" }),
    ]); expect(data.outstandingBalance).toBe("90.000");
    expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-1", companyId: "company-1", isDeleted: false } }));
    expect(mocks.invoices).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company-1", customerId: "customer-1", currencyCode: "KWD", status: "ISSUED" }), take: 501 }));
  });
  it("rejects ambiguous currency and oversized periods before database reads", async () => {
    for (const query of ["", "?currencyCode=KWD&from=2020-01-01&to=2026-01-01", "?currencyCode=KWD&from=2026-02-31&to=2026-03-10"]) {
      const response = await GET(new Request(`http://localhost/api/customers/customer-1/statement${query}`)); expect(response.status).toBe(400);
    }
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it("does not reveal a customer from another tenant", async () => {
    mocks.customer.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/customers/customer-1/statement?currencyCode=KWD&from=2026-01-01&to=2026-12-31"));
    expect(response.status).toBe(404); expect(mocks.invoices).not.toHaveBeenCalled();
  });
});
