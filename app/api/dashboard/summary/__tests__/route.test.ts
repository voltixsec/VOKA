import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ customer: vi.fn(), catalogItem: vi.fn(), quotation: vi.fn(), salesOrder: vi.fn(), contract: vi.fn(), invoice: vi.fn(), payment: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  customer: { count: mocks.customer }, catalogItem: { count: mocks.catalogItem }, quotation: { count: mocks.quotation },
  salesOrder: { count: mocks.salesOrder }, contract: { count: mocks.contract }, invoice: { count: mocks.invoice }, payment: { count: mocks.payment },
} }));
vi.mock("@/lib/api", () => ({ withCompanyAuth: (_roles: readonly string[], handler: Function) => (request: Request) => handler(request, {}, { companyId: "company-trusted", role: "VIEWER" }) }));
import { GET } from "../route";

describe("dashboard tenant summary", () => {
  beforeEach(() => { vi.clearAllMocks(); Object.values(mocks).forEach((mock, index) => mock.mockResolvedValue(index + 1)); });
  it("returns real module counts with trusted tenant filters", async () => {
    const response = await GET(new Request("http://localhost/api/dashboard/summary?companyId=attacker"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ customers: 1, catalogItems: 2, quotations: 3, salesOrders: 4, contracts: 5, invoices: 6, payments: 7 });
    for (const mock of Object.values(mocks)) expect(mock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company-trusted" }) }));
    expect(mocks.quotation).toHaveBeenCalledWith({ where: expect.objectContaining({ isCurrentRevision: true, status: { in: ["DRAFT", "SENT"] } }) });
    expect(mocks.invoice).toHaveBeenCalledWith({ where: expect.objectContaining({ status: "ISSUED", settlementStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } }) });
  });
});
