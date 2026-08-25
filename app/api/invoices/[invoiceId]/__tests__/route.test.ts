import { beforeEach, describe, expect, it, vi } from "vitest";
import { Invoice, InvoiceDomainError } from "@/src/domain/invoice";

const mocks = vi.hoisted(() => ({ findById: vi.fn(), updateDraft: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository", () => ({
  PrismaInvoiceRepository: class { findById = mocks.findById; updateDraft = mocks.updateDraft; },
}));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError, apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: unknown, handler: Function) => async (request: Request) => {
      try { return await handler(request, { user: { id: "user-1", name: "Trusted User" } }, { companyId: "tenant-trusted", role: "SALES" }); }
      catch (error) { return responses.handleApiError(error); }
    },
  };
});

import { PUT } from "../route";

const invoice = () => new Invoice({
  id: "invoice-1", companyId: "tenant-trusted", number: "INV-1", customerId: "customer-1",
  customer: { name: "Acme" }, lines: [{ position: 1, type: "CUSTOM", itemName: "Work", quantity: 1, unitPrice: 10 }],
  createdBy: { name: "Creator", role: "SALES" }, updatedAt: new Date("2026-08-25T00:00:00.000Z"),
});

describe("PUT /api/invoices/[invoiceId]", () => {
  beforeEach(() => { mocks.findById.mockReset(); mocks.updateDraft.mockReset(); });

  it("uses the trusted tenant and never client companyId", async () => {
    mocks.updateDraft.mockResolvedValue(invoice());
    const response = await PUT(new Request("http://localhost/api/invoices/invoice-1", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "attacker", expectedUpdatedAt: "2026-08-25T00:00:00.000Z", invoiceDate: "2026-08-25", customerId: "customer-1", lines: [{ position: 1, type: "CUSTOM", itemName: "Work", quantity: 1, unitPrice: 10 }] }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateDraft).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-trusted", invoiceId: "invoice-1", actor: expect.objectContaining({ userId: "user-1" }) }));
  });

  it("requires optimistic concurrency", async () => {
    const response = await PUT(new Request("http://localhost/api/invoices/invoice-1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceDate: "2026-08-25" }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVOICE_VERSION_REQUIRED" } });
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("returns conflict when the draft changed after opening", async () => {
    mocks.updateDraft.mockRejectedValue(new InvoiceDomainError("Invoice changed since it was opened. Reload before saving."));
    const response = await PUT(new Request("http://localhost/api/invoices/invoice-1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-08-25T00:00:00.000Z", invoiceDate: "2026-08-25" }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVOICE_EDIT_CONFLICT" } });
  });
});
