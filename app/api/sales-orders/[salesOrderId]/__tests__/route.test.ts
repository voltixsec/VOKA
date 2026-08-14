import { describe, expect, it, vi } from "vitest";
import { SalesOrder } from "@/src/domain/sales-order";

const mocks = vi.hoisted(() => ({ findById: vi.fn(), roles: [] as string[][] }));

vi.mock(
  "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository",
  () => ({ PrismaSalesOrderRepository: class { findById = mocks.findById; } }),
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

import { GET } from "../route";

function order() {
  return SalesOrder.restore({
    id: "sales-order-1", companyId: "company-1",
    sourceQuotationId: "quotation-1", sourceQuotationNumber: "QT-1001",
    number: "SO-QT-1001", status: "DRAFT", customerId: "customer-1",
    currencyCode: "KWD", orderDate: new Date("2026-08-14T12:00:00.000Z"),
    customer: { name: "Customer" }, discountValue: 0, discountAmount: 0,
    subtotal: 1, taxAmount: 0, totalAmount: 1,
    sourceApprovedAt: new Date("2026-08-14T10:00:00.000Z"),
    sourceApprovedByName: "Approver", sourceApprovedByRole: "ADMIN",
    createdByUserId: "user-1", createdByName: "Actor", createdByRole: "SALES",
    lines: [{ sourceQuotationLineId: "line-1", position: 1, type: "CUSTOM",
      itemName: "Item", quantity: 1, unitPrice: 1, discountValue: 0,
      discountAmount: 0, taxPercentage: 0, taxAmount: 0, subtotal: 1,
      totalAmount: 1 }],
  });
}

describe("GET /api/sales-orders/[salesOrderId]", () => {
  it("returns a tenant-scoped full snapshot to all read roles", async () => {
    mocks.findById.mockResolvedValue(order());
    const response = await GET(new Request(
      "http://localhost/api/sales-orders/sales-order-1?locale=en",
    ));
    const body = await response.json();
    expect(mocks.roles).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "sales-order-1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({ success: true, data: {
      id: "sales-order-1", sourceQuotationId: "quotation-1",
      creator: { name: "Actor" }, sourceApproval: { approvedByName: "Approver" },
    } });
  });

  it("returns the same 404 for missing or cross-tenant IDs", async () => {
    mocks.findById.mockResolvedValue(null);
    const response = await GET(new Request(
      "http://localhost/api/sales-orders/other-company-order",
    ));
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SALES_ORDER_NOT_FOUND");
  });
});
