import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesOrder } from "@/src/domain/sales-order";

const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
  roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository",
  () => ({
    PrismaSalesOrderRepository: class {
      convertApprovedQuotation = mocks.convert;
    },
  }),
);

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>(
    "@/lib/api/ApiError",
  );
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>(
    "@/lib/api/ApiResponse",
  );
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      roles: readonly string[],
      handler: Function,
    ) => {
      mocks.roles.push([...roles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            { user: { id: "user-1", name: "Actor", email: "actor@example.com" } },
            { companyId: "company-1", role: "SALES" },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { POST } from "../route";

function order() {
  return SalesOrder.restore({
    id: "sales-order-1",
    companyId: "company-1",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "QT-1001",
    number: "SO-QT-1001",
    status: "DRAFT",
    customerId: "customer-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-14T12:00:00.000Z"),
    customer: { name: "Snapshot Customer" },
    discountValue: 0,
    discountAmount: 0,
    subtotal: 10,
    taxAmount: 0,
    totalAmount: 10,
    sourceApprovedAt: new Date("2026-08-14T10:00:00.000Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "ADMIN",
    createdByUserId: "user-1",
    createdByName: "Actor",
    createdByRole: "SALES",
    createdAt: new Date("2026-08-14T12:00:00.000Z"),
    lines: [{
      id: "sales-order-line-1",
      sourceQuotationLineId: "quotation-line-1",
      position: 1,
      type: "PRODUCT",
      itemName: "Snapshot item",
      quantity: 1,
      unitPrice: 10,
      discountValue: 0,
      discountAmount: 0,
      taxPercentage: 0,
      taxAmount: 0,
      subtotal: 10,
      totalAmount: 10,
    }],
  });
}

describe("POST /api/quotations/[quotationId]/convert-to-sales-order", () => {
  beforeEach(() => mocks.convert.mockReset());

  it.each([
    ["CREATED", 201, true],
    ["EXISTING", 200, false],
  ] as const)("returns %s with the stable idempotency indicator", async (kind, status, created) => {
    mocks.convert.mockResolvedValue({ kind, salesOrder: order() });
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/convert-to-sales-order",
      {
        method: "POST",
        body: JSON.stringify({
          companyId: "spoofed-company",
          number: "SO-SPOOFED",
          customerName: "Spoofed",
          totalAmount: 0,
          createdByUserId: "spoofed-user",
        }),
      },
    ));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      success: true,
      data: {
        created,
        salesOrderId: "sales-order-1",
        salesOrder: { number: "SO-QT-1001" },
      },
    });
    expect(mocks.convert).toHaveBeenCalledWith({
      companyId: "company-1",
      quotationId: "quotation-1",
      createdByUserId: "user-1",
      createdByName: "Actor",
      createdByRole: "SALES",
    });
    expect(mocks.roles).toContainEqual(["OWNER", "ADMIN", "SALES"]);
    expect(mocks.roles.flat()).not.toContain("VIEWER");
  });

  it.each([
    [{ kind: "QUOTATION_NOT_FOUND" }, 404, "QUOTATION_NOT_FOUND"],
    [
      { kind: "INVALID_QUOTATION_STATUS", status: "DRAFT" },
      409,
      "QUOTATION_NOT_APPROVED",
    ],
    [
      { kind: "INVALID_SOURCE_SNAPSHOT", message: "Missing approval data." },
      409,
      "QUOTATION_CONVERSION_SOURCE_INVALID",
    ],
  ] as const)("maps conversion failure to a safe API error", async (result, status, code) => {
    mocks.convert.mockResolvedValue(result);
    const response = await POST(new Request(
      "http://localhost/api/quotations/quotation-1/convert-to-sales-order",
      { method: "POST" },
    ));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({ success: false, error: { code } });
  });
});
