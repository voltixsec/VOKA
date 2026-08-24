import { describe, expect, it } from "vitest";
import { Invoice, InvoiceDomainError } from "..";

function invoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}) {
  return new Invoice({
    companyId: "company-1", number: "INV-1", customerId: "customer-1",
    customer: { name: "Customer" }, currencyCode: "KWD",
    lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 2, unitPrice: 10, taxPercentage: 5 }],
    createdBy: { userId: "user-1", name: "Creator", role: "SALES" },
    ...overrides,
  });
}

describe("Invoice", () => {
  it("calculates authoritative three-decimal totals and balance", () => {
    const value = invoice();
    expect(value.totals).toEqual({ subtotal: 20, discountAmount: 0, taxAmount: 1, totalAmount: 21 });
    expect(value.settlementStatus).toBe("UNPAID");
    expect(value.outstandingAmount).toBe(21);
  });

  it("derives partial and full settlement from authoritative amounts", () => {
    expect(invoice({ paidAmount: 5 }).settlementStatus).toBe("PARTIALLY_PAID");
    expect(invoice({ paidAmount: 21 }).settlementStatus).toBe("PAID");
    expect(() => invoice({ paidAmount: 22 })).toThrow(InvoiceDomainError);
    expect(() => invoice({ paidAmount: 5, settlementStatus: "PAID" })).toThrow("Stored settlement state");
  });

  it("enforces issue and void lifecycle without hiding paid history", () => {
    const value = invoice();
    value.issue({ name: "Issuer", role: "ADMIN" });
    expect(value.status).toBe("ISSUED");
    value.void({ name: "Owner", role: "OWNER" }, "Entered in error");
    expect(value.status).toBe("VOID");
    expect(value.voidReason).toBe("Entered in error");
    expect(() => value.issue({ name: "Issuer", role: "ADMIN" })).toThrow(InvoiceDomainError);
  });

  it("rejects voiding an invoice with payments", () => {
    const value = invoice({ status: "ISSUED", paidAmount: 1 });
    expect(() => value.void({ name: "Owner", role: "OWNER" }, "No"))
      .toThrow("reconciliation is required");
  });

  it("requires exact upstream provenance", () => {
    expect(() => invoice({ origin: "QUOTATION", sourceKind: "QUOTATION", sourceId: null }))
      .toThrow("provenance is incomplete");
    const value = invoice({
      origin: "QUOTATION", sourceKind: "QUOTATION", sourceId: "q-rev-2",
      sourceQuotationFamilyId: "q-family", sourceQuotationRevisionNumber: 2,
    });
    expect(value.sourceQuotationRevisionNumber).toBe(2);
  });

  it("rejects invalid dates and due dates before the invoice date", () => {
    expect(() => invoice({ invoiceDate: new Date("invalid") })).toThrow("dates are invalid");
    expect(() => invoice({
      invoiceDate: new Date("2026-08-25T00:00:00.000Z"),
      dueDate: new Date("2026-08-24T00:00:00.000Z"),
    })).toThrow("cannot precede");
  });
});
