import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { payment: { findMany: mocks.findMany, count: mocks.count }, $transaction: mocks.transaction } }));
vi.mock("@/lib/api", async () => { const actual = await vi.importActual<any>("@/lib/api"); return { ...actual, withCompanyAuth: (_roles: string[], handler: any) => (request: Request) => handler(request, { user: { id: "u" } }, { companyId: "trusted-company", role: "ADMIN" }) }; });
import { GET } from "../route";
describe("payments workspace API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockReturnValue("find-query"); mocks.count.mockReturnValue("count-query"); mocks.transaction.mockResolvedValue([[], 0]); });
  it("lists only the trusted active tenant", async () => { const response = await GET(new Request("http://localhost/api/payments?companyId=attacker")); expect(response.status).toBe(200); expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "trusted-company" }, take: 20 })); expect(mocks.count).toHaveBeenCalledWith({ where: { companyId: "trusted-company" } }); });
  it("rejects unbounded pagination", async () => { await expect(GET(new Request("http://localhost/api/payments?pageSize=101"))).rejects.toMatchObject({ statusCode: 400, code: "INVALID_PAGINATION" }); expect(mocks.transaction).not.toHaveBeenCalled(); });
});
