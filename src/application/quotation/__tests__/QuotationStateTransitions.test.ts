import { describe, expect, it, vi } from "vitest";

import { Quotation } from "../../../domain/quotation";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import { ApproveQuotationUseCase } from "../use-cases/ApproveQuotationUseCase";
import { CancelQuotationUseCase } from "../use-cases/CancelQuotationUseCase";
import { RejectQuotationUseCase } from "../use-cases/RejectQuotationUseCase";
import { SendQuotationUseCase } from "../use-cases/SendQuotationUseCase";
import { createCompanyDocumentBrandSnapshot } from "../../../domain/document/CompanyDocumentBrandSnapshot";

const brand = createCompanyDocumentBrandSnapshot({ nameAr: null, nameEn: "VOKA", addressAr: null, addressEn: null, poBox: null, phone: null, mobile: null, whatsapp: null, logoUrl: null, brandTheme: "NAVY_GOLD" });

function quotation(status: "DRAFT" | "SENT"): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    status,
    customer: { name: "Customer" },
    lines: [{
      position: 1,
      type: "PRODUCT",
      itemName: "Product",
      quantity: 1,
      unitPrice: 10,
    }],
  });
}

function repository(value: Quotation): IQuotationRepository {
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(value),
    findAll: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    claimLocalization: vi.fn().mockResolvedValue(null),
    completeLocalization: vi.fn(),
    failLocalization: vi.fn(),
  };
}

describe("quotation state transition use cases", () => {
  it("updates and clears a valid draft expiry date", () => {
    const value = quotation("DRAFT");
    const expiry = new Date("2026-09-01T23:59:59.999Z");

    value.updateExpiryDate(expiry);
    expect(value.expiryDate).toEqual(expiry);

    value.updateExpiryDate(null);
    expect(value.expiryDate).toBeNull();
  });

  it("rejects an expiry date before the issue date", () => {
    const value = Quotation.restore({
      id: "quotation-1",
      companyId: "company-1",
      customerId: "customer-1",
      number: "Q-001",
      issueDate: new Date("2026-08-14T12:00:00.000Z"),
      customer: { name: "Customer" },
      lines: [{
        position: 1,
        type: "PRODUCT",
        itemName: "Product",
        quantity: 1,
        unitPrice: 10,
      }],
    });

    expect(() => value.updateExpiryDate(
      new Date("2026-08-13T23:59:59.999Z"),
    )).toThrow("Quotation expiry date cannot be before issue date.");
  });

  it("does not allow non-draft quotations to modify expiry", () => {
    const value = quotation("SENT");

    expect(() => value.updateExpiryDate(
      new Date("2026-09-01T23:59:59.999Z"),
    )).toThrow("Only draft quotations can be modified.");
  });

  it("sends a tenant-scoped draft", async () => {
    const value = quotation("DRAFT");
    const repo = repository(value);
    const result = await new SendQuotationUseCase(repo).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });

    expect(result.success).toBe(true);
    expect(value.status).toBe("SENT");
    expect(repo.update).toHaveBeenCalledWith("company-1", value);
  });

  it.each([
    ["approve", ApproveQuotationUseCase, "APPROVED"],
    ["reject", RejectQuotationUseCase, "REJECTED"],
  ] as const)("%s transitions SENT inside the tenant", async (_name, UseCase, status) => {
    const value = quotation("SENT");
    const repo = repository(value);
    const useCase = _name === "approve"
      ? new ApproveQuotationUseCase(repo, { generate: () => "verification-token-0000000000000000" })
      : new UseCase(repo);
    const result = await useCase.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      ...(_name === "approve" ? { documentBrandSnapshot: brand } : {}),
    } as never);

    expect(result.success).toBe(true);
    expect(value.status).toBe(status);
    expect(repo.update).toHaveBeenCalledWith("company-1", value);
  });

  it("cancels a tenant-scoped draft", async () => {
    const value = quotation("DRAFT");
    const repo = repository(value);
    const guard = { existsBySourceQuotation: vi.fn().mockResolvedValue(false) };
    const result = await new CancelQuotationUseCase(repo, guard).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });

    expect(result.success).toBe(true);
    expect(value.status).toBe("CANCELLED");
    expect(repo.update).toHaveBeenCalledWith("company-1", value);
  });

  it("blocks cancellation when the tenant quotation has a Sales Order", async () => {
    const value = quotation("DRAFT");
    const repo = repository(value);
    const guard = { existsBySourceQuotation: vi.fn().mockResolvedValue(true) };

    const result = await new CancelQuotationUseCase(repo, guard).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: "QUOTATION_HAS_SALES_ORDER",
        message: "A quotation with a Sales Order cannot be cancelled.",
      },
    });
    expect(guard.existsBySourceQuotation).toHaveBeenCalledWith(
      "company-1",
      "quotation-1",
    );
    expect(value.status).toBe("DRAFT");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("does not persist an invalid transition", async () => {
    const value = quotation("DRAFT");
    const repo = repository(value);
    const result = await new ApproveQuotationUseCase(repo, { generate: () => "verification-token-0000000000000000" }).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      documentBrandSnapshot: brand,
    });

    expect(result).toMatchObject({ success: false, error: { code: "DOMAIN_ERROR" } });
    expect(repo.update).not.toHaveBeenCalled();
  });
});
