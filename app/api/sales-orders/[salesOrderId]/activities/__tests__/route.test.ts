import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  activitySave: vi.fn(),
  activityList: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock("@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository", () => ({
  PrismaSalesOrderRepository: class {
    findById = mocks.findById;
  },
}));

vi.mock("@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderActivityRepository", () => ({
  PrismaSalesOrderActivityRepository: class {
    save = mocks.activitySave;
    listBySalesOrderId = mocks.activityList;
  },
}));

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      allowedRoles: readonly string[],
      handler: (
        request: Request,
        auth: { user: { id: string; name?: string; email?: string } },
        company: { companyId: string; role: string },
      ) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...allowedRoles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            { user: { id: "user-1", name: "Authorized User", email: "user@example.com" } },
            { companyId: "company-1", role: "SALES" },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { SalesOrder, SalesOrderActivity } from "@/src/domain/sales-order";
import { GET, POST } from "../route";

function sampleSalesOrder(): SalesOrder {
  return SalesOrder.restore({
    id: "so-1",
    companyId: "company-1",
    sourceQuotationId: "q-1",
    sourceQuotationNumber: "Q-001",
    number: "SO-001",
    status: "CONFIRMED",
    customerId: "c-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-05T00:00:00Z"),
    customer: { name: "Demo Customer" },
    lines: [
      {
        sourceQuotationLineId: "ql-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Product 1",
        quantity: 1,
        unitPrice: 10,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 10,
        totalAmount: 10,
      },
    ],
    subtotal: 10,
    discountValue: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 10,
    sourceApprovedAt: new Date("2026-08-04T00:00:00Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "OWNER",
    createdByUserId: "u-1",
    createdByName: "Creator",
    createdByRole: "SALES",
    confirmedAt: new Date("2026-08-06T00:00:00Z"),
    confirmedByUserId: "u-2",
    confirmedByName: "Confirmer",
    confirmedByRole: "ADMIN",
  });
}

describe("Sales Order Activities API Routes", () => {
  beforeEach(() => {
    mocks.findById.mockReset();
    mocks.activitySave.mockReset();
    mocks.activityList.mockReset();
  });

  describe("GET /api/sales-orders/[salesOrderId]/activities", () => {
    it("returns list of activities", async () => {
      mocks.findById.mockResolvedValue(sampleSalesOrder());
      mocks.activityList.mockResolvedValue([
        SalesOrderActivity.restore({
          id: "act-1",
          companyId: "company-1",
          salesOrderId: "so-1",
          body: "Note 1",
          actorUserId: "user-1",
          actorName: "John",
          actorRole: "SALES",
          createdAt: new Date("2026-08-06T00:00:00Z"),
        }),
      ]);

      const response = await GET(new Request("http://localhost/api/sales-orders/so-1/activities"));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.activities).toHaveLength(1);
      expect(body.data.activities[0]).toMatchObject({
        id: "act-1",
        body: "Note 1",
        actor: { name: "John", role: "SALES" },
      });
    });

    it("returns 404 for missing sales order", async () => {
      mocks.findById.mockResolvedValue(null);

      const response = await GET(new Request("http://localhost/api/sales-orders/missing-so/activities"));

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/sales-orders/[salesOrderId]/activities", () => {
    it("creates an activity note successfully", async () => {
      mocks.findById.mockResolvedValue(sampleSalesOrder());
      mocks.activitySave.mockImplementation(async (act: SalesOrderActivity) => {
        return SalesOrderActivity.restore({
          id: "act-new",
          companyId: act.companyId,
          salesOrderId: act.salesOrderId,
          body: act.body,
          actorUserId: act.actorUserId,
          actorName: act.actorName,
          actorRole: act.actorRole,
          createdAt: new Date(),
        });
      });

      const response = await POST(
        new Request("http://localhost/api/sales-orders/so-1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "New note added" }),
        }),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: "act-new",
        body: "New note added",
        actor: { name: "Authorized User", role: "SALES" },
      });
    });

    it("rejects blank body", async () => {
      mocks.findById.mockResolvedValue(sampleSalesOrder());

      const response = await POST(
        new Request("http://localhost/api/sales-orders/so-1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "   " }),
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("NOTE_BODY_REQUIRED");
    });

    it("rejects body exceeding 2000 characters", async () => {
      mocks.findById.mockResolvedValue(sampleSalesOrder());

      const longBody = "a".repeat(2001);
      const response = await POST(
        new Request("http://localhost/api/sales-orders/so-1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: longBody }),
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("NOTE_BODY_TOO_LONG");
    });

    it("rejects malformed JSON", async () => {
      const response = await POST(
        new Request("http://localhost/api/sales-orders/so-1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ malformed: ",
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("INVALID_JSON");
    });

    it("ignores body attempts to spoof actor, companyId, or timestamp", async () => {
      mocks.findById.mockResolvedValue(sampleSalesOrder());
      mocks.activitySave.mockImplementation(async (act: SalesOrderActivity) => {
        return SalesOrderActivity.restore({
          id: "act-spoof",
          companyId: act.companyId,
          salesOrderId: act.salesOrderId,
          body: act.body,
          actorUserId: act.actorUserId,
          actorName: act.actorName,
          actorRole: act.actorRole,
          createdAt: new Date(),
        });
      });

      const response = await POST(
        new Request("http://localhost/api/sales-orders/so-1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Legitimate note",
            companyId: "spoofed-company",
            actor: { name: "Hacker", role: "OWNER" },
            createdAt: "1990-01-01",
          }),
        }),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.actor).toEqual({
        userId: "user-1",
        name: "Authorized User",
        role: "SALES",
      });
    });

    it("returns 404 for cross-tenant or missing order and does NOT call activitySave", async () => {
      mocks.findById.mockResolvedValue(null);

      const response = await POST(
        new Request("http://localhost/api/sales-orders/other-tenant-so/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "Test note" }),
        }),
      );

      expect(response.status).toBe(404);
      expect(mocks.activitySave).not.toHaveBeenCalled();
    });
  });

  describe("Role Configurations", () => {
    it("configures GET with OWNER, ADMIN, SALES, VIEWER and POST with OWNER, ADMIN, SALES (no VIEWER)", () => {
      expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
      expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES"]);
    });
  });
});
