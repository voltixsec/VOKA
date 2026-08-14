import { describe, expect, it } from "vitest";
import { SalesOrder } from "../entities/SalesOrder";

function props() {
  return {
    id: "sales-order-1",
    companyId: "company-1",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "QT-1001",
    number: "SO-QT-1001",
    status: "DRAFT" as const,
    customerId: "customer-1",
    priceListId: null,
    currencyCode: "KWD",
    orderDate: new Date("2026-08-14T12:00:00.000Z"),
    customer: { name: "Acme" },
    discountType: "FIXED" as const,
    discountValue: 1,
    discountAmount: 1,
    subtotal: 10,
    taxAmount: 0.45,
    totalAmount: 9.45,
    sourceApprovedAt: new Date("2026-08-14T10:00:00.000Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "ADMIN",
    createdByUserId: "user-1",
    createdByName: "Creator",
    createdByRole: "SALES",
    lines: [
      {
        id: "sales-order-line-1",
        sourceQuotationLineId: "quotation-line-1",
        position: 1,
        type: "CUSTOM" as const,
        itemName: "Custom service",
        quantity: 1,
        unitPrice: 10,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 5,
        taxAmount: 0.45,
        subtotal: 10,
        totalAmount: 10.45,
      },
    ],
  };
}

describe("SalesOrder snapshot aggregate", () => {
  it("restores a DRAFT commercial snapshot without recalculating totals", () => {
    const salesOrder = SalesOrder.restore(props());

    expect(salesOrder.number).toBe("SO-QT-1001");
    expect(salesOrder.status).toBe("DRAFT");
    expect(salesOrder.subtotal).toBe(10);
    expect(salesOrder.discountAmount).toBe(1);
    expect(salesOrder.taxAmount).toBe(0.45);
    expect(salesOrder.totalAmount).toBe(9.45);
    expect(salesOrder.lines[0].totalAmount).toBe(10.45);
  });

  it("requires at least one line", () => {
    expect(() => SalesOrder.restore({ ...props(), lines: [] })).toThrow(
      "A Sales Order requires at least one line.",
    );
  });

  it("requires contiguous deterministic positions", () => {
    expect(() => SalesOrder.restore({
      ...props(),
      lines: [{ ...props().lines[0], position: 2 }],
    })).toThrow("Sales Order line positions must be contiguous from 1.");
  });

  it("requires source, customer, currency, creator, and approval snapshots", () => {
    expect(() => SalesOrder.restore({
      ...props(),
      sourceApprovedByName: " ",
    })).toThrow("Source approver name is required.");
    expect(() => SalesOrder.restore({
      ...props(),
      createdByName: " ",
    })).toThrow("Creator name is required.");
    expect(() => SalesOrder.restore({
      ...props(),
      currencyCode: "invalid",
    })).toThrow("Currency code must be a valid three-letter ISO-style code.");
  });

  it("retains creator snapshot when the optional user reference is gone", () => {
    const salesOrder = SalesOrder.restore({
      ...props(),
      createdByUserId: null,
    });

    expect(salesOrder.createdByUserId).toBeNull();
    expect(salesOrder.createdByName).toBe("Creator");
  });
});
