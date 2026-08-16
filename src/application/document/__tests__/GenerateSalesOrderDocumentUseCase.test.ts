import { describe, expect, it, vi } from "vitest";

import { SalesOrder } from "@/src/domain/sales-order";
import type { ISalesOrderRepository } from "@/src/application/sales-order";
import { createCompanyDocumentBrandSnapshot } from "@/src/domain/document/CompanyDocumentBrandSnapshot";

import type { ISalesOrderDocumentRenderer } from "../contracts/ISalesOrderDocumentRenderer";
import { GenerateSalesOrderDocumentUseCase } from "../use-cases/GenerateSalesOrderDocumentUseCase";

function createSalesOrderRepository(salesOrder: SalesOrder | null): ISalesOrderRepository {
  return {
    findById: vi.fn().mockResolvedValue(salesOrder),
    findBySourceQuotation: vi.fn(),
    existsBySourceQuotation: vi.fn(),
    findAll: vi.fn(),
    convertApprovedQuotation: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  };
}

function createSalesOrder(
  status: "DRAFT" | "CONFIRMED" | "CANCELLED" = "DRAFT",
  documentBrandSnapshot: ReturnType<typeof createCompanyDocumentBrandSnapshot> | null = null,
): SalesOrder {
  return SalesOrder.restore({
    documentBrandSnapshot,
    id: "so-1",
    companyId: "company-1",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "Q/2026 001",
    number: "SO/2026 001",
    status,
    customerId: "customer-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-05T00:00:00Z"),
    createdAt: new Date("2026-08-05T10:30:00Z"),
    customer: { name: "شركة الاختبار", email: "customer@example.com" },
    lines: [
      {
        sourceQuotationLineId: "line-1",
        position: 1,
        type: "SERVICE",
        itemName: "خدمة استشارية",
        unitName: "ساعة",
        quantity: 2,
        unitPrice: 100,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 5,
        taxAmount: 10,
        subtotal: 200,
        totalAmount: 210,
      },
    ],
    subtotal: 200,
    discountValue: 0,
    discountAmount: 0,
    taxAmount: 10,
    totalAmount: 210,
    notes: "ملاحظات أمر البيع",
    sourceApprovedAt: new Date("2026-08-04T00:00:00Z"),
    sourceApprovedByName: "Approver User",
    sourceApprovedByRole: "OWNER",
    createdByUserId: "user-1",
    createdByName: "Creator User",
    createdByRole: "SALES",
    ...(status === "CONFIRMED"
      ? {
          confirmedAt: new Date("2026-08-06T00:00:00Z"),
          confirmedByUserId: "user-2",
          confirmedByName: "Confirming User",
          confirmedByRole: "ADMIN",
        }
      : {}),
    ...(status === "CANCELLED"
      ? {
          cancelledAt: new Date("2026-08-07T00:00:00Z"),
          cancelledByUserId: "user-3",
          cancelledByName: "Cancelling User",
          cancelledByRole: "ADMIN",
          cancellationReason: "طلب العميل إلغاء المشروع",
        }
      : {}),
  });
}

describe("GenerateSalesOrderDocumentUseCase", () => {
  it("builds a snapshot and generates PDF for DRAFT Sales Order", async () => {
    const repository = createSalesOrderRepository(createSalesOrder("DRAFT"));
    const renderer: ISalesOrderDocumentRenderer = {
      render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };
    const useCase = new GenerateSalesOrderDocumentUseCase(repository, renderer);

    const result = await useCase.execute({
      companyId: "company-1",
      companyName: "VOKA Demo",
      salesOrderId: "so-1",
      locale: "ar",
    });

    expect(repository.findById).toHaveBeenCalledWith("company-1", "so-1");
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "ar",
        qrValue: "VOKA:SO:SO/2026 001",
        salesOrder: expect.objectContaining({
          number: "SO/2026 001",
          status: "DRAFT",
          createdAt: new Date("2026-08-05T10:30:00Z"),
          totals: { subtotal: 200, discountAmount: 0, taxAmount: 10, totalAmount: 210 },
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        bytes: new Uint8Array([37, 80, 68, 70]),
        filename: "sales-order-SO-2026-001.pdf",
      },
    });
  });

  it("includes cancellation details when Sales Order is CANCELLED", async () => {
    const repository = createSalesOrderRepository(createSalesOrder("CANCELLED"));
    const renderer: ISalesOrderDocumentRenderer = {
      render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };
    const useCase = new GenerateSalesOrderDocumentUseCase(repository, renderer);

    await useCase.execute({
      companyId: "company-1",
      companyName: "VOKA Demo",
      salesOrderId: "so-1",
      locale: "en",
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        salesOrder: expect.objectContaining({
          status: "CANCELLED",
          confirmation: null,
          cancellation: expect.objectContaining({
            reason: "طلب العميل إلغاء المشروع",
            cancelledByName: "Cancelling User",
          }),
        }),
      }),
    );
  });

  it("returns not found for missing or cross-tenant sales order", async () => {
    const repository = createSalesOrderRepository(null);
    const renderer: ISalesOrderDocumentRenderer = { render: vi.fn() };
    const useCase = new GenerateSalesOrderDocumentUseCase(repository, renderer);

    const result = await useCase.execute({
      companyId: "company-1",
      companyName: "VOKA Demo",
      salesOrderId: "invalid-id",
      locale: "en",
    });

    expect(result).toEqual({
      success: false,
      error: { code: "SALES_ORDER_NOT_FOUND", message: "Sales Order not found." },
    });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("uses persisted SalesOrder documentBrandSnapshot when available over changed live company brand", async () => {
    const brand = createCompanyDocumentBrandSnapshot({
      nameAr: "الشركة المحفوظة",
      nameEn: "Persisted Company",
      addressAr: null,
      addressEn: "Persisted Address",
      poBox: null,
      phone: null,
      mobile: null,
      whatsapp: null,
      logoUrl: null,
      brandTheme: "NAVY_GOLD",
    });

    const salesOrder = createSalesOrder("DRAFT", brand);
    const repository = createSalesOrderRepository(salesOrder);
    const renderer: ISalesOrderDocumentRenderer = {
      render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };
    const useCase = new GenerateSalesOrderDocumentUseCase(repository, renderer);

    await useCase.execute({
      companyId: "company-1",
      companyName: "Changed Live Company Name",
      companyIdentity: { nameEn: "Changed Live Company Name" },
      salesOrderId: "so-1",
      locale: "en",
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        company: expect.objectContaining({
          name: "Persisted Company",
          address: "Persisted Address",
        }),
      }),
    );
  });

  it("uses live company branding for a legacy Sales Order without a persisted snapshot", async () => {
    const repository = createSalesOrderRepository(createSalesOrder("DRAFT", null));
    const renderer: ISalesOrderDocumentRenderer = {
      render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };
    const useCase = new GenerateSalesOrderDocumentUseCase(repository, renderer);

    await useCase.execute({
      companyId: "company-1",
      companyName: "Legacy Live Company",
      companyIdentity: {
        nameEn: "Legacy Live Company",
        addressEn: "Current Address",
      },
      salesOrderId: "so-1",
      locale: "en",
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        company: expect.objectContaining({
          name: "Legacy Live Company",
          address: "Current Address",
        }),
      }),
    );
  });
});
