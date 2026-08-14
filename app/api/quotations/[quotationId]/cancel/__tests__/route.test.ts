import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(), roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationCancellationRepository",
  () => ({
    PrismaQuotationCancellationRepository: class {
      cancel = mocks.cancel;
    },
  }),
);
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError, apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: Function) => {
      mocks.roles.push([...roles]);
      return async (request: Request) => {
        try { return await handler(request, {}, { companyId: "company-1" }); }
        catch (error) { return responses.handleApiError(error); }
      };
    },
  };
});

import { POST } from "../route";

describe("POST quotation cancel Sales Order guard", () => {
  beforeEach(() => mocks.cancel.mockReset());

  it("returns 409 when atomic cancellation observes a tenant Sales Order", async () => {
    mocks.cancel.mockResolvedValue({ kind: "QUOTATION_HAS_SALES_ORDER" });
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/cancel",
      { method: "POST" },
    ));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.code).toBe("QUOTATION_HAS_SALES_ORDER");
    expect(mocks.cancel).toHaveBeenCalledWith({
      companyId: "company-1",
      quotationId: "quotation-1",
    });
  });

  it("preserves the existing successful cancellation response and roles", async () => {
    mocks.cancel.mockResolvedValue({ kind: "CANCELLED" });
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/cancel",
      { method: "POST" },
    ));
    expect(response.status).toBe(200);
    expect(mocks.roles).toContainEqual(["OWNER", "ADMIN", "SALES"]);
  });

  it("preserves tenant-safe not-found behavior", async () => {
    mocks.cancel.mockResolvedValue({ kind: "QUOTATION_NOT_FOUND" });
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/cancel",
      { method: "POST" },
    ));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("QUOTATION_NOT_FOUND");
  });
});
