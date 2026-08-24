import { describe, expect, it, vi } from "vitest";
import { InvoiceDomainError } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "../PrismaInvoiceRepository";

const actor = { userId: "user-1", name: "Recorder", role: "SALES" };
const request = (overrides: Record<string, unknown> = {}) => ({
  companyId: "tenant-a", invoiceId: "invoice-1", requestKey: "payment:req:1",
  amount: 10, method: "CASH" as const,
  receivedAt: new Date("2026-08-25T00:00:00.000Z"),
  reference: "RCPT-1", notes: "Counter payment", actor, ...overrides,
});

function makeRepository(tx: Record<string, any>) {
  tx.$executeRaw = vi.fn().mockResolvedValue(1);
  const db = { $transaction: vi.fn(async (operation: (client: unknown) => unknown) => operation(tx)) };
  return new PrismaInvoiceRepository(db as never);
}

describe("PrismaInvoiceRepository payment integrity", () => {
  it("rejects overpayment before mutation and scopes the lookup to the trusted tenant", async () => {
    const tx = {
      payment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      invoice: { findFirst: vi.fn().mockResolvedValue({ status: "ISSUED", outstandingAmount: 5 }), update: vi.fn() },
      invoiceEvent: { create: vi.fn() },
    };
    const repository = makeRepository(tx);

    await expect(repository.recordPayment(request())).rejects.toThrow("cannot exceed outstanding");
    expect(tx.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invoice-1", companyId: "tenant-a" } }));
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.invoiceEvent.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a payment key when a consequential field changes", async () => {
    const tx = {
      payment: { findFirst: vi.fn().mockResolvedValue({
        invoiceId: "invoice-1", amount: 10, method: "CASH",
        receivedAt: new Date("2026-08-25T00:00:00.000Z"),
        reference: "RCPT-1", notes: "Counter payment",
      }) },
      invoice: { findFirst: vi.fn() },
    };
    const repository = makeRepository(tx);

    await expect(repository.recordPayment(request({ method: "CARD" }))).rejects.toBeInstanceOf(InvoiceDomainError);
    expect(tx.invoice.findFirst).not.toHaveBeenCalled();
  });
});
