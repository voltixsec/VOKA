import { describe, expect, it, vi } from "vitest";
import { SalesOrder, SalesOrderActivity } from "@/src/domain/sales-order";
import { AddSalesOrderActivityUseCase } from "../use-cases/AddSalesOrderActivityUseCase";
import { ListSalesOrderActivitiesUseCase } from "../use-cases/ListSalesOrderActivitiesUseCase";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";
import type { ISalesOrderActivityRepository } from "../repositories/ISalesOrderActivityRepository";

function createSalesOrder(): SalesOrder {
  return SalesOrder.restore({
    id: "so-1",
    companyId: "company-1",
    sourceQuotationId: "q-1",
    sourceQuotationNumber: "Q-001",
    number: "SO-001",
    status: "DRAFT",
    customerId: "c-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-05T00:00:00Z"),
    customer: { name: "Test Customer" },
    lines: [
      {
        sourceQuotationLineId: "ql-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Item 1",
        quantity: 1,
        unitPrice: 100,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 100,
        totalAmount: 100,
      },
    ],
    subtotal: 100,
    discountValue: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 100,
    sourceApprovedAt: new Date("2026-08-04T00:00:00Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "OWNER",
    createdByUserId: "u-1",
    createdByName: "Creator",
    createdByRole: "SALES",
  });
}

describe("SalesOrderActivity Use Cases", () => {
  it("adds an activity note for an existing Sales Order", async () => {
    const salesOrderRepo: ISalesOrderRepository = {
      findById: vi.fn().mockResolvedValue(createSalesOrder()),
      findBySourceQuotation: vi.fn(),
      existsBySourceQuotation: vi.fn(),
      findAll: vi.fn(),
      convertApprovedQuotation: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };

    const savedActivity = new SalesOrderActivity({
      id: "act-1",
      companyId: "company-1",
      salesOrderId: "so-1",
      body: "Internal operational note.",
      actorUserId: "u-1",
      actorName: "John Doe",
      actorRole: "SALES",
    });

    const activityRepo: ISalesOrderActivityRepository = {
      save: vi.fn().mockResolvedValue(savedActivity),
      listBySalesOrderId: vi.fn(),
    };

    const addUseCase = new AddSalesOrderActivityUseCase(salesOrderRepo, activityRepo);
    const result = await addUseCase.execute({
      companyId: "company-1",
      salesOrderId: "so-1",
      body: "Internal operational note.",
      actor: { userId: "u-1", name: "John Doe", role: "SALES" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("act-1");
      expect(result.data.body).toBe("Internal operational note.");
    }
  });

  it("returns not found when adding activity for missing order", async () => {
    const salesOrderRepo: ISalesOrderRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findBySourceQuotation: vi.fn(),
      existsBySourceQuotation: vi.fn(),
      findAll: vi.fn(),
      convertApprovedQuotation: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };

    const activityRepo: ISalesOrderActivityRepository = {
      save: vi.fn(),
      listBySalesOrderId: vi.fn(),
    };

    const addUseCase = new AddSalesOrderActivityUseCase(salesOrderRepo, activityRepo);
    const result = await addUseCase.execute({
      companyId: "company-1",
      salesOrderId: "invalid-so",
      body: "Internal note",
      actor: { userId: "u-1", name: "John", role: "SALES" },
    });

    expect(result).toEqual({
      success: false,
      error: { code: "SALES_ORDER_NOT_FOUND", message: "Sales Order not found." },
    });
  });

  it("lists activities for an existing Sales Order", async () => {
    const salesOrderRepo: ISalesOrderRepository = {
      findById: vi.fn().mockResolvedValue(createSalesOrder()),
      findBySourceQuotation: vi.fn(),
      existsBySourceQuotation: vi.fn(),
      findAll: vi.fn(),
      convertApprovedQuotation: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };

    const mockActivities = [
      new SalesOrderActivity({
        id: "act-1",
        companyId: "company-1",
        salesOrderId: "so-1",
        body: "First note.",
        actorUserId: "u-1",
        actorName: "John",
        actorRole: "SALES",
      }),
    ];

    const activityRepo: ISalesOrderActivityRepository = {
      save: vi.fn(),
      listBySalesOrderId: vi.fn().mockResolvedValue(mockActivities),
    };

    const listUseCase = new ListSalesOrderActivitiesUseCase(salesOrderRepo, activityRepo);
    const result = await listUseCase.execute({
      companyId: "company-1",
      salesOrderId: "so-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].body).toBe("First note.");
    }
  });
});
