import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesOrder } from "@/src/domain/sales-order";

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository",
  () => ({
    PrismaSalesOrderRepository: class {
      findAll = mocks.findAll;
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
          return await handler(request, {}, { companyId: "company-1" });
        } catch (error) {
          return responses.handleApiError(error);
        }
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
    customer: { name: "Fallback", nameAr: "عميل", nameEn: "Customer" },
    discountValue: 0, discountAmount: 0, subtotal: 1, taxAmount: 0, totalAmount: 1,
    sourceApprovedAt: new Date("2026-08-14T10:00:00.000Z"),
    sourceApprovedByName: "Approver", sourceApprovedByRole: "ADMIN",
    createdByUserId: "user-1", createdByName: "Actor", createdByRole: "SALES",
    lines: [{ sourceQuotationLineId: "line-1", position: 1, type: "CUSTOM",
      itemName: "Item", quantity: 1, unitPrice: 1, discountValue: 0,
      discountAmount: 0, taxPercentage: 0, taxAmount: 0, subtotal: 1,
      totalAmount: 1 }],
  });
}

describe("GET /api/sales-orders", () => {
  beforeEach(() => mocks.findAll.mockReset());

  it("lists tenant orders for all read roles with locale and no-store", async () => {
    mocks.findAll.mockResolvedValue({ salesOrders: [order()], total: 1 });
    const response = await GET(new Request(
      "http://localhost/api/sales-orders?page=1&pageSize=20&locale=ar&search=SO",
    ));
    const body = await response.json();

    expect(mocks.roles).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.findAll).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      search: "SO",
      skip: 0,
      take: 20,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.data.salesOrders[0].customer.name).toBe("عميل");
  });

  it("rejects invalid pagination and status", async () => {
    const pagination = await GET(new Request("http://localhost/api/sales-orders?page=0"));
    const status = await GET(new Request("http://localhost/api/sales-orders?status=CONFIRMED"));
    expect(pagination.status).toBe(400);
    expect(status.status).toBe(400);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });
});
