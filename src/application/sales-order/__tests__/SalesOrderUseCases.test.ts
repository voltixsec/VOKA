import { describe, expect, it, vi } from "vitest";
import { SalesOrder } from "../../../domain/sales-order";
import type {
  ISalesOrderRepository,
  SalesOrderConversionPersistenceResult,
} from "../repositories/ISalesOrderRepository";
import { ConvertApprovedQuotationToSalesOrderUseCase } from "../use-cases/ConvertApprovedQuotationToSalesOrderUseCase";
import { GetSalesOrderUseCase } from "../use-cases/GetSalesOrderUseCase";
import { ListSalesOrdersUseCase } from "../use-cases/ListSalesOrdersUseCase";
import { buildApprovedQuotationSalesOrderDraft } from "../services/buildApprovedQuotationSalesOrderDraft";

function order() {
  return SalesOrder.restore({
    id: "sales-order-1",
    companyId: "company-1",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "QT-1001",
    number: "SO-QT-1001",
    status: "DRAFT",
    customerId: "customer-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-14T12:00:00.000Z"),
    customer: { name: "Acme" },
    discountValue: 0,
    discountAmount: 0,
    subtotal: 10,
    taxAmount: 0,
    totalAmount: 10,
    sourceApprovedAt: new Date("2026-08-14T10:00:00.000Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "ADMIN",
    createdByUserId: "user-1",
    createdByName: "Creator",
    createdByRole: "SALES",
    lines: [{
      id: "sales-order-line-1",
      sourceQuotationLineId: "quotation-line-1",
      position: 1,
      type: "PRODUCT",
      itemName: "Camera",
      quantity: 1,
      unitPrice: 10,
      discountValue: 0,
      discountAmount: 0,
      taxPercentage: 0,
      taxAmount: 0,
      subtotal: 10,
      totalAmount: 10,
    }],
  });
}

function repository(
  conversion: SalesOrderConversionPersistenceResult,
): ISalesOrderRepository {
  return {
    convertApprovedQuotation: vi.fn().mockResolvedValue(conversion),
    findById: vi.fn(),
    findBySourceQuotation: vi.fn(),
    existsBySourceQuotation: vi.fn(),
    findAll: vi.fn(),
  };
}

const input = {
  companyId: "company-1",
  quotationId: "quotation-1",
  createdByUserId: "user-1",
  createdByName: "Creator",
  createdByRole: "SALES",
};

describe("Sales Order use cases", () => {
  it.each([
    ["CREATED", true],
    ["EXISTING", false],
  ] as const)("returns %s conversion idempotently", async (kind, created) => {
    const repo = repository({ kind, salesOrder: order() });
    const result = await new ConvertApprovedQuotationToSalesOrderUseCase(repo)
      .execute(input);

    expect(result).toMatchObject({
      success: true,
      data: { created, salesOrder: { id: "sales-order-1" } },
    });
    expect(repo.convertApprovedQuotation).toHaveBeenCalledWith(input);
  });

  it.each([
    ["DRAFT", "QUOTATION_NOT_APPROVED"],
    ["SENT", "QUOTATION_NOT_APPROVED"],
    ["REJECTED", "QUOTATION_NOT_APPROVED"],
    ["EXPIRED", "QUOTATION_NOT_APPROVED"],
    ["CANCELLED", "QUOTATION_NOT_APPROVED"],
  ] as const)("rejects %s source state", async (status, code) => {
    const repo = repository({ kind: "INVALID_QUOTATION_STATUS", status });
    const result = await new ConvertApprovedQuotationToSalesOrderUseCase(repo)
      .execute(input);

    expect(result).toMatchObject({ success: false, error: { code } });
  });

  it("returns not found without leaking tenant existence", async () => {
    const repo = repository({ kind: "QUOTATION_NOT_FOUND" });
    const result = await new ConvertApprovedQuotationToSalesOrderUseCase(repo)
      .execute(input);

    expect(result).toEqual({
      success: false,
      error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." },
    });
  });

  it("returns a stable invalid-source error", async () => {
    const repo = repository({
      kind: "INVALID_SOURCE_SNAPSHOT",
      message: "Missing approval data.",
    });
    const result = await new ConvertApprovedQuotationToSalesOrderUseCase(repo)
      .execute(input);

    expect(result).toEqual({
      success: false,
      error: {
        code: "QUOTATION_CONVERSION_SOURCE_INVALID",
        message: "Missing approval data.",
      },
    });
  });

  it("gets and lists only through tenant-scoped repository inputs", async () => {
    const value = order();
    const repo = repository({ kind: "EXISTING", salesOrder: value });
    vi.mocked(repo.findById).mockResolvedValue(value);
    vi.mocked(repo.findAll).mockResolvedValue({ salesOrders: [value], total: 1 });

    const get = await new GetSalesOrderUseCase(repo).execute({
      companyId: "company-1",
      salesOrderId: "sales-order-1",
    });
    const list = await new ListSalesOrdersUseCase(repo).execute({
      companyId: "company-1",
      page: 2,
      pageSize: 10,
    });

    expect(get.success).toBe(true);
    expect(repo.findById).toHaveBeenCalledWith("company-1", "sales-order-1");
    expect(repo.findAll).toHaveBeenCalledWith({
      companyId: "company-1",
      status: undefined,
      search: undefined,
      skip: 10,
      take: 10,
    });
    expect(list.pagination).toEqual({ total: 1, page: 2, pageSize: 10, totalPages: 1 });
  });
});

function approvedSnapshot() {
  return {
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    priceListId: "price-list-1",
    number: "QT-1001",
    status: "APPROVED" as const,
    currencyCode: "KWD",
    customerName: "Saved Customer",
    customerNameAr: "عميل محفوظ",
    customerNameEn: "Saved Customer EN",
    customerEmail: "saved@example.com",
    customerPhone: "+96590000000",
    customerTaxNo: "TAX-1",
    billingAddress: "Saved address",
    subjectAr: "موضوع",
    subjectEn: "Subject",
    briefAr: "ملخص",
    briefEn: "Brief",
    projectName: "Project",
    projectNameAr: "مشروع",
    projectNameEn: "Project EN",
    attentionName: "Attention",
    attentionNameAr: "عناية",
    attentionNameEn: "Attention EN",
    scopeType: "SUPPLY_ONLY" as const,
    discountType: "FIXED" as const,
    discountValue: 3.21,
    discountAmount: 3.21,
    subtotal: 123.456,
    taxAmount: 7.654,
    totalAmount: 127.9,
    notes: "Notes",
    notesAr: "ملاحظات",
    notesEn: "Notes EN",
    termsAndConditions: "Terms",
    termsAndConditionsAr: "شروط",
    termsAndConditionsEn: "Terms EN",
    approvedAt: new Date("2026-08-14T10:00:00.000Z"),
    approvedByName: "Approver Snapshot",
    approvedByRole: "ADMIN",
    lines: [
      {
        id: "quotation-line-1",
        catalogItemId: "catalog-1",
        taxRateId: "tax-1",
        position: 1,
        type: "PRODUCT" as const,
        itemCode: "ITEM-1",
        itemName: "Saved Item",
        itemNameAr: "بند محفوظ",
        itemNameEn: "Saved Item EN",
        description: "Saved description",
        descriptionAr: "وصف محفوظ",
        descriptionEn: "Saved description EN",
        unitName: "piece",
        unitNameAr: "قطعة",
        unitNameEn: "piece",
        quantity: 2,
        unitPrice: 50.123,
        discountType: "PERCENTAGE" as const,
        discountValue: 2.5,
        discountAmount: 2.506,
        taxPercentage: 7,
        taxAmount: 6.826,
        subtotal: 100.246,
        totalAmount: 104.566,
      },
      {
        id: "quotation-line-2",
        catalogItemId: null,
        taxRateId: null,
        position: 2,
        type: "CUSTOM" as const,
        itemCode: null,
        itemName: "Custom line",
        itemNameAr: null,
        itemNameEn: "Custom line",
        description: null,
        descriptionAr: null,
        descriptionEn: null,
        unitName: null,
        unitNameAr: null,
        unitNameEn: null,
        quantity: 1,
        unitPrice: 23.21,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 23.21,
        totalAmount: 23.21,
      },
    ],
  };
}

describe("approved quotation Sales Order draft builder", () => {
  it("builds deterministic complete snapshots without recalculating", () => {
    const result = buildApprovedQuotationSalesOrderDraft(
      approvedSnapshot(),
      { userId: "user-1", name: "Creator", role: "SALES" },
      new Date("2026-08-14T12:00:00.000Z"),
    );

    expect(result.kind).toBe("READY");
    if (result.kind !== "READY") return;
    expect(result.salesOrder.number).toBe("SO-QT-1001");
    expect(result.salesOrder.customer).toMatchObject({
      name: "Saved Customer",
      nameAr: "عميل محفوظ",
      email: "saved@example.com",
    });
    expect(result.salesOrder.lines.map((line) => line.position)).toEqual([1, 2]);
    expect(result.salesOrder.lines[0]).toMatchObject({
      sourceQuotationLineId: "quotation-line-1",
      itemNameAr: "بند محفوظ",
      descriptionEn: "Saved description EN",
      taxRateId: "tax-1",
      taxPercentage: 7,
      unitPrice: 50.123,
      totalAmount: 104.566,
    });
    expect(result.salesOrder.lines[1]).toMatchObject({
      catalogItemId: null,
      taxRateId: null,
      type: "CUSTOM",
    });
    expect(result.salesOrder).toMatchObject({
      subtotal: 123.456,
      discountValue: 3.21,
      discountAmount: 3.21,
      taxAmount: 7.654,
      totalAmount: 127.9,
      sourceApprovedByName: "Approver Snapshot",
      createdByUserId: "user-1",
      createdByName: "Creator",
      createdByRole: "SALES",
    });
  });

  it.each(["DRAFT", "SENT", "REJECTED", "EXPIRED", "CANCELLED"] as const)(
    "rejects %s before aggregate construction",
    (status) => {
      const result = buildApprovedQuotationSalesOrderDraft(
        { ...approvedSnapshot(), status },
        { userId: "user-1", name: "Creator", role: "SALES" },
        new Date(),
      );
      expect(result).toEqual({ kind: "INVALID_QUOTATION_STATUS", status });
    },
  );

  it("requires approval audit and valid source lines", () => {
    const actor = { userId: "user-1", name: "Creator", role: "SALES" };
    expect(buildApprovedQuotationSalesOrderDraft(
      { ...approvedSnapshot(), approvedAt: null },
      actor,
      new Date(),
    )).toMatchObject({ kind: "INVALID_SOURCE_SNAPSHOT" });
    expect(buildApprovedQuotationSalesOrderDraft(
      { ...approvedSnapshot(), lines: [] },
      actor,
      new Date(),
    )).toMatchObject({
      kind: "INVALID_SOURCE_SNAPSHOT",
      message: "A Sales Order requires at least one line.",
    });
  });
});
