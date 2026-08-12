import { describe, expect, it, vi } from "vitest";

import { Quotation } from "@/src/domain/quotation";
import type { IQuotationRepository } from "@/src/application/quotation";

import type { IQuotationDocumentRenderer } from "../contracts/IQuotationDocumentRenderer";
import { GenerateQuotationDocumentUseCase } from "../use-cases/GenerateQuotationDocumentUseCase";
import { createCompanyDocumentBrandSnapshot } from "@/src/domain/document/CompanyDocumentBrandSnapshot";

function createRepository(quotation: Quotation | null): IQuotationRepository {
  return {
    existsByNumber: vi.fn(), save: vi.fn(),
    findById: vi.fn().mockResolvedValue(quotation), findAll: vi.fn(),
    update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(),
    completeLocalization: vi.fn(), failLocalization: vi.fn(),
  };
}

function createQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1", companyId: "company-1", customerId: "customer-1",
    number: "Q/2026 001", status: "DRAFT", issueDate: new Date("2026-08-05T00:00:00Z"),
    currencyCode: "KWD", customer: { name: "شركة الاختبار", email: "customer@example.com" },
    lines: [{ position: 1, type: "SERVICE", itemName: "خدمة استشارية", unitName: "ساعة", quantity: 2, unitPrice: 100, taxPercentage: 5 }],
    notes: "مراجعة بشرية مطلوبة",
  });
}

function approvedQuotation(withSnapshot: boolean): Quotation {
  const base = createQuotation();
  return Quotation.restore({
    id: base.id, companyId: base.companyId, customerId: base.customerId,
    number: base.number.toString(), status: "APPROVED", issueDate: base.issueDate,
    currencyCode: base.currencyCode, customer: base.customer.toJSON(),
    lines: [...base.lines], notes: base.notes, approvedAt: new Date("2026-08-06T00:00:00Z"),
    approvedByName: "Approver", approvedByRole: "OWNER",
    documentBrandSnapshot: withSnapshot ? createCompanyDocumentBrandSnapshot({
      nameAr: "العلامة الأصلية", nameEn: "Original Brand",
      addressAr: "العنوان الأصلي", addressEn: "Original Address",
      poBox: "111", phone: "222", mobile: "333", whatsapp: "444",
      logoUrl: "data:image/png;base64,ORIGINAL", brandTheme: "EMERALD",
      letterheadUrl: "data:image/png;base64,LETTERHEAD",
      signatureUrl: "data:image/png;base64,SIGNATURE",
      stampUrl: "data:image/png;base64,STAMP",
    }) : null,
  });
}

describe("GenerateQuotationDocumentUseCase", () => {
  it("builds a tenant-scoped snapshot with persisted totals and a safe filename", async () => {
    const repository = createRepository(createQuotation());
    const renderer: IQuotationDocumentRenderer = { render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])) };
    const useCase = new GenerateQuotationDocumentUseCase(repository, renderer);

    const result = await useCase.execute({
      companyId: "company-1",
      companyName: "VOKA Demo",

      companyIdentity: {
        nameAr: "???? ????",
        nameEn: "VOKA Company",

        addressAr: "??????",
        addressEn: "Kuwait",

        poBox: "12345",
        phone: "+965 2222 2222",
        mobile: "+965 9999 9999",
        whatsapp: "+965 9999 9999",

        logoUrl:
          "data:image/png;base64,AAAA",
      },

      quotationId:
        "quotation-1",

      locale:
        "ar",
    });

    expect(repository.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ locale: "ar", company:
        expect.objectContaining({
          name:
            "???? ????",

          address:
            "??????",

          poBox:
            "12345",

          phone:
            "+965 2222 2222",

          mobile:
            "+965 9999 9999",

          whatsapp:
            "+965 9999 9999",

          logoUrl:
            "data:image/png;base64,AAAA",
        }), qrValue: "VOKA:Q/2026 001", quotation: expect.objectContaining({ number: "Q/2026 001", totals: { subtotal: 200, discountAmount: 0, taxAmount: 10, totalAmount: 210 } }) }));
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

  it("uses the immutable snapshot for an approved quotation", async () => {
    const renderer: IQuotationDocumentRenderer = { render: vi.fn().mockResolvedValue(new Uint8Array()) };
    const useCase = new GenerateQuotationDocumentUseCase(createRepository(approvedQuotation(true)), renderer);
    await useCase.execute({
      companyId: "company-1", quotationId: "quotation-1", locale: "en", companyName: "Changed Company",
      companyIdentity: { nameEn: "Changed Brand", addressEn: "Changed Address", logoUrl: "data:image/png;base64,CHANGED", letterheadUrl: "data:image/png;base64,CHANGED", signatureUrl: "data:image/png;base64,CHANGED", stampUrl: "data:image/png;base64,CHANGED", brandTheme: "BURGUNDY" },
    });
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({ name: "Original Brand", address: "Original Address", logoUrl: "data:image/png;base64,ORIGINAL", letterheadUrl: "data:image/png;base64,LETTERHEAD", signatureUrl: "data:image/png;base64,SIGNATURE", stampUrl: "data:image/png;base64,STAMP", brandTheme: "EMERALD" }),
    }));
  });

  it("uses live branding for legacy approved quotations without a snapshot", async () => {
    const renderer: IQuotationDocumentRenderer = { render: vi.fn().mockResolvedValue(new Uint8Array()) };
    const useCase = new GenerateQuotationDocumentUseCase(createRepository(approvedQuotation(false)), renderer);
    await useCase.execute({
      companyId: "company-1", quotationId: "quotation-1", locale: "en", companyName: "Live Company",
      companyIdentity: { nameEn: "Live Brand", brandTheme: "CHARCOAL" },
    });
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({ name: "Live Brand", brandTheme: "CHARCOAL" }),
    }));
  });
});
