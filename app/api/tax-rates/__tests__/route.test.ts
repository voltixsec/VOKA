import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAvailableTaxRates: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator",
  () => ({
    PrismaQuotationReferenceValidator: class {
      listAvailableTaxRates = mocks.listAvailableTaxRates;
    },
  }),
);

vi.mock("@/lib/api", async () => {
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>(
    "@/lib/api/ApiResponse",
  );
  return {
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      roles: readonly string[],
      handler: (request: Request, auth: never, company: { companyId: string }) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...roles]);
      return (request: Request) => handler(request, {} as never, { companyId: "company-1" });
    },
  };
});

import { GET } from "../route";

describe("GET /api/tax-rates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAvailableTaxRates.mockResolvedValue([
      { id: "company-tax", name: "Company VAT", percentage: 5, isSystem: false },
      { id: "system-tax", name: "System VAT", percentage: 10, isSystem: true },
    ]);
  });

  it("allows authenticated company roles and returns only safe fields", async () => {
    const response = await GET(new Request("http://localhost/api/tax-rates"));
    const body = await response.json();

    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.listAvailableTaxRates).toHaveBeenCalledWith("company-1");
    expect(body.data).toEqual([
      { id: "company-tax", name: "Company VAT", percentage: 5, isSystem: false },
      { id: "system-tax", name: "System VAT", percentage: 10, isSystem: true },
    ]);
    expect(JSON.stringify(body)).not.toContain("companyId");
    expect(JSON.stringify(body)).not.toContain("isActive");
    expect(JSON.stringify(body)).not.toContain("createdAt");
    expect(JSON.stringify(body)).not.toContain("updatedAt");
  });
});
