import { describe, expect, it, vi } from "vitest";

import { Quotation } from "@/src/domain/quotation";
import type { IQuotationRepository } from "@/src/application/quotation";

import type { IQuotationDocumentRenderer } from "../contracts/IQuotationDocumentRenderer";
import { GenerateQuotationDocumentUseCase } from "../use-cases/GenerateQuotationDocumentUseCase";

function createRepository(quotation: Quotation | null): IQuotationRepository {
  return {
    existsByNumber: vi.fn(), save: vi.fn(),
    findById: vi.fn().mockResolvedValue(quotation), findAll: vi.fn(),
    update: vi.fn(), delete: vi.fn(),
  };
}

function createQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1", companyId: "company-1", customerId: "customer-1",
    number: "Q/2026 001", status: "SENT", issueDate: new Date("2026-08-05T00:00:00Z"),
    currencyCode: "KWD", customer: { name: "شركة الاختبار", email: "customer@example.com" },
    lines: [{ position: 1, type: "SERVICE", itemName: "خدمة استشارية", unitName: "ساعة", quantity: 2, unitPrice: 100, taxPercentage: 5 }],
    notes: "مراجعة بشرية مطلوبة",
  });
}

describe("GenerateQuotationDocumentUseCase", () => {
  it("builds a tenant-scoped snapshot with persisted totals and a safe filename", async () => {
    const repository = createRepository(createQuotation());
    const renderer: IQuotationDocumentRenderer = { render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])) };
    const useCase = new GenerateQuotationDocumentUseCase(repository, renderer);

    const result = await useCase.execute({ companyId: "company-1", companyName: "VOKA Demo", quotationId: "quotation-1", locale: "ar" });

    expect(repository.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ locale: "ar", company: { name: "VOKA Demo" }, qrValue: "VOKA:Q/2026 001", quotation: expect.objectContaining({ number: "Q/2026 001", totals: { subtotal: 200, discountAmount: 0, taxAmount: 10, totalAmount: 210 } }) }));
    expect(result).toEqual({ success: true, data: { bytes: new Uint8Array([37, 80, 68, 70]), filename: "quotation-Q-2026-001.pdf" } });
  });

  it("does not render a missing or cross-company quotation", async () => {
    const repository = createRepository(null);
    const renderer: IQuotationDocumentRenderer = { render: vi.fn() };
    const useCase = new GenerateQuotationDocumentUseCase(repository, renderer);
    const result = await useCase.execute({ companyId: "company-1", companyName: "VOKA", quotationId: "other-company-quotation", locale: "en" });
    expect(result).toEqual({ success: false, error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." } });
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
