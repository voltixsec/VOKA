import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesOrder } from "@/src/domain/sales-order";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository",
  () => ({
    PrismaSalesOrderRepository: class {
      cancel = mocks.cancel;
    },
  }),
);

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: Function) => {
      mocks.roles.push([...roles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            { user: { id: "user-1", email: "user@example.com", name: "User" } },
            { companyId: "company-1", role: "ADMIN" },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { POST } from "../route";

function cancelledOrder() {
  const so = SalesOrder.restore({
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
  so.cancel({ name: "User", role: "ADMIN" }, "Client request", new Date("2026-08-15T11:00:00.000Z"));
  return so;
}

describe("POST /api/sales-orders/[salesOrderId]/cancel", () => {
  beforeEach(() => mocks.cancel.mockReset());

  it("cancels a sales order with expectedStatus and reason", async () => {
    mocks.cancel.mockResolvedValue({
      kind: "CANCELLED",
      salesOrder: cancelledOrder(),
    });

    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT", reason: "Client request" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("CANCELLED");
    expect(body.data.cancellation).toMatchObject({
      cancelledByName: "User",
      reason: "Client request",
    });
  });

  it("returns HTTP 400 when cancellation reason is missing or whitespace", async () => {
    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT", reason: "   " }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("CANCELLATION_REASON_REQUIRED");
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("returns HTTP 409 when state conflict occurs", async () => {
    mocks.cancel.mockResolvedValue({
      kind: "STALE_STATE",
      currentStatus: "CANCELLED",
    });

    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT", reason: "Client request" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.code).toBe("STALE_STATE");
  });
});
