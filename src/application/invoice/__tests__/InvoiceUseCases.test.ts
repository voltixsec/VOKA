import { describe, expect, it, vi } from "vitest";
import type { IInvoiceRepository } from "../repositories/IInvoiceRepository";
import { RecordPaymentUseCase } from "../use-cases/InvoiceUseCases";

describe("Invoice use cases", () => {
  it("passes trusted tenant and idempotency identity unchanged", async () => {
    const repository = { recordPayment: vi.fn().mockResolvedValue({ created: true }) } as unknown as IInvoiceRepository;
    const request = {
      companyId: "company-trusted", invoiceId: "invoice-1", requestKey: "payment:req:1",
      amount: 4.5, method: "BANK_TRANSFER" as const, receivedAt: new Date(),
      actor: { userId: "user-1", name: "Actor", role: "SALES" },
    };
    await new RecordPaymentUseCase(repository).execute(request);
    expect(repository.recordPayment).toHaveBeenCalledWith(request);
  });
});
