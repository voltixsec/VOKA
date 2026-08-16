import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesOrder } from "@/src/domain/sales-order";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository",
  () => ({
    PrismaSalesOrderRepository: class {
      confirm = mocks.confirm;
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

function confirmedOrder() {
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
  so.confirm({ name: "User", role: "ADMIN" }, new Date("2026-08-15T10:00:00.000Z"));
  return so;
}

describe("POST /api/sales-orders/[salesOrderId]/confirm", () => {
  beforeEach(() => mocks.confirm.mockReset());

  it("confirms a draft sales order when expectedStatus is DRAFT", async () => {
    mocks.confirm.mockResolvedValue({
      kind: "CONFIRMED",
      salesOrder: confirmedOrder(),
    });

    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("CONFIRMED");
    expect(body.data.confirmation).toMatchObject({
      confirmedByName: "User",
      confirmedByRole: "ADMIN",
    });
  });

  it("returns HTTP 409 when state conflict occurs", async () => {
    mocks.confirm.mockResolvedValue({
      kind: "STALE_STATE",
      currentStatus: "CANCELLED",
    });

    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.code).toBe("STALE_STATE");
  });

  it("returns HTTP 404 when order is not found or cross-tenant", async () => {
    mocks.confirm.mockResolvedValue({
      kind: "SALES_ORDER_NOT_FOUND",
    });

    const response = await POST(
      new Request("http://localhost/api/sales-orders/other-order/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: "DRAFT" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SALES_ORDER_NOT_FOUND");
  });

  it.each([undefined, "CONFIRMED", "CANCELLED", 1])(
    "returns HTTP 400 for invalid expectedStatus %s",
    async (expectedStatus) => {
      const response = await POST(
        new Request("http://localhost/api/sales-orders/sales-order-1/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedStatus }),
        }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("EXPECTED_STATUS_REQUIRED");
      expect(mocks.confirm).not.toHaveBeenCalled();
    },
  );

  it("returns HTTP 400 for malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/sales-orders/sales-order-1/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
