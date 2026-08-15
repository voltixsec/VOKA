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

  describe("Lifecycle state transitions and audit", () => {
    it("confirms a DRAFT sales order with actor snapshot and timestamp", () => {
      const salesOrder = SalesOrder.restore(props());
      const now = new Date("2026-08-15T10:00:00.000Z");

      salesOrder.confirm(
        { userId: "actor-1", name: "Confirmer", role: "ADMIN" },
        now,
      );

      expect(salesOrder.status).toBe("CONFIRMED");
      expect(salesOrder.confirmedAt).toEqual(now);
      expect(salesOrder.confirmedByUserId).toBe("actor-1");
      expect(salesOrder.confirmedByName).toBe("Confirmer");
      expect(salesOrder.confirmedByRole).toBe("ADMIN");
    });

    it("prevents confirming a CONFIRMED or CANCELLED sales order", () => {
      const salesOrder = SalesOrder.restore(props());
      salesOrder.confirm({ name: "A", role: "ADMIN" });

      expect(() => salesOrder.confirm({ name: "B", role: "ADMIN" })).toThrow(
        "Sales Order cannot transition from CONFIRMED to CONFIRMED.",
      );
    });

    it("cancels a DRAFT sales order with required reason", () => {
      const salesOrder = SalesOrder.restore(props());
      const now = new Date("2026-08-15T11:00:00.000Z");

      salesOrder.cancel(
        { userId: "actor-2", name: "Canceller", role: "OWNER" },
        "Customer request",
        now,
      );

      expect(salesOrder.status).toBe("CANCELLED");
      expect(salesOrder.cancelledAt).toEqual(now);
      expect(salesOrder.cancelledByUserId).toBe("actor-2");
      expect(salesOrder.cancelledByName).toBe("Canceller");
      expect(salesOrder.cancelledByRole).toBe("OWNER");
      expect(salesOrder.cancellationReason).toBe("Customer request");
    });

    it("cancels a CONFIRMED sales order", () => {
      const salesOrder = SalesOrder.restore(props());
      salesOrder.confirm({ name: "Confirmer", role: "ADMIN" });
      salesOrder.cancel(
        { name: "Canceller", role: "OWNER" },
        "Project scope changed",
      );

      expect(salesOrder.status).toBe("CANCELLED");
      expect(salesOrder.cancellationReason).toBe("Project scope changed");
    });

    it("requires a non-empty cancellation reason", () => {
      const salesOrder = SalesOrder.restore(props());

      expect(() =>
        salesOrder.cancel({ name: "A", role: "ADMIN" }, "   ")
      ).toThrow("Cancellation reason is required.");
    });

    it("treats CANCELLED as terminal and blocks transition back to CONFIRMED or CANCELLED", () => {
      const salesOrder = SalesOrder.restore(props());
      salesOrder.cancel({ name: "A", role: "ADMIN" }, "Reason");

      expect(() => salesOrder.confirm({ name: "B", role: "ADMIN" })).toThrow(
        "Sales Order cannot transition from CANCELLED to CONFIRMED.",
      );
      expect(() =>
        salesOrder.cancel({ name: "B", role: "ADMIN" }, "Another reason")
      ).toThrow("Sales Order is already cancelled.");
    });

    it("restores CONFIRMED and CANCELLED states with complete audit fields", () => {
      const confirmed = SalesOrder.restore({
        ...props(),
        status: "CONFIRMED",
        confirmedAt: new Date("2026-08-15T12:00:00.000Z"),
        confirmedByName: "Manager",
        confirmedByRole: "ADMIN",
      });
      expect(confirmed.status).toBe("CONFIRMED");
      expect(confirmed.confirmedByName).toBe("Manager");

      const cancelled = SalesOrder.restore({
        ...props(),
        status: "CANCELLED",
        cancelledAt: new Date("2026-08-15T13:00:00.000Z"),
        cancelledByName: "Director",
        cancelledByRole: "OWNER",
        cancellationReason: "Duplicated order",
      });
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.cancellationReason).toBe("Duplicated order");
    });
  });
});
