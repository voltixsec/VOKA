import { describe, expect, it, vi } from "vitest";
import { Quotation } from "@/src/domain/quotation";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(), update: vi.fn(), exists: vi.fn(), roles: [] as string[][],
}));

vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({
  PrismaQuotationRepository: class { findById = mocks.findById; update = mocks.update; },
}));
vi.mock("@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository", () => ({
  PrismaSalesOrderRepository: class { existsBySourceQuotation = mocks.exists; },
}));
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

function approvedQuotation() {
  return Quotation.restore({
    id: "quotation-1", companyId: "company-1", customerId: "customer-1",
    number: "QT-1001", status: "APPROVED", customer: { name: "Customer" },
    lines: [{ position: 1, type: "CUSTOM", itemName: "Item", quantity: 1, unitPrice: 1 }],
  });
}

describe("POST quotation cancel Sales Order guard", () => {
  it("returns 409 without mutating quotation when a tenant order exists", async () => {
    const quotation = approvedQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.exists.mockResolvedValue(true);
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/cancel",
      { method: "POST" },
    ));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.code).toBe("QUOTATION_HAS_SALES_ORDER");
    expect(mocks.exists).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(quotation.status).toBe("APPROVED");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves existing approved cancellation when no order exists", async () => {
    const quotation = approvedQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.exists.mockResolvedValue(false);
    mocks.update.mockResolvedValue(undefined);
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/cancel",
      { method: "POST" },
    ));
    expect(response.status).toBe(200);
    expect(quotation.status).toBe("CANCELLED");
    expect(mocks.update).toHaveBeenCalledWith("company-1", quotation);
    expect(mocks.roles).toContainEqual(["OWNER", "ADMIN", "SALES"]);
  });
});
