import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../../../../lib/generated/prisma/client";
import { PrismaSalesOrderRepository } from "../PrismaSalesOrderRepository";
import { PrismaSalesOrderMapper } from "../PrismaSalesOrderMapper";

vi.mock("../../../../../../lib/prisma", () => ({ prisma: {} }));

const decimal = (value: string) => new Prisma.Decimal(value);
const now = new Date("2026-08-14T12:00:00.000Z");

function sourceQuotation(status = "APPROVED") {
  return {
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    priceListId: "price-list-1",
    number: "QT-1001",
    status,
    currencyCode: "KWD",
    customerName: "Saved Customer",
    customerNameAr: "العميل المحفوظ",
    customerNameEn: "Saved Customer EN",
    customerEmail: "saved@example.com",
    customerPhone: "+96590000000",
    customerTaxNo: "TAX-1",
    billingAddress: "Saved address",
    subjectAr: "موضوع",
    subjectEn: "Subject",
    briefAr: "ملخص",
    briefEn: "Brief",
    projectName: "Saved project",
    projectNameAr: "المشروع",
    projectNameEn: "Project",
    attentionName: "Saved attention",
    attentionNameAr: "عناية",
    attentionNameEn: "Attention",
    scopeType: "SUPPLY_ONLY",
    subtotal: decimal("123.456"),
    discountType: "FIXED",
    discountValue: decimal("3.210"),
    discountAmount: decimal("3.210"),
    taxAmount: decimal("7.654"),
    totalAmount: decimal("127.900"),
    notes: "Saved notes",
    notesAr: "ملاحظات",
    notesEn: "Notes",
    termsAndConditions: "Saved terms",
    termsAndConditionsAr: "شروط",
    termsAndConditionsEn: "Terms",
    approvedAt: new Date("2026-08-14T10:00:00.000Z"),
    approvedByName: "Approver Snapshot",
    approvedByRole: "ADMIN",
    lines: [
      {
        id: "quotation-line-1",
        catalogItemId: "catalog-1",
        taxRateId: "tax-1",
        position: 1,
        type: "PRODUCT",
        itemCode: "CAM-1",
        itemName: "Saved Camera",
        itemNameAr: "كاميرا محفوظة",
        itemNameEn: "Saved Camera EN",
        description: "Saved description",
        descriptionAr: "وصف محفوظ",
        descriptionEn: "Saved description EN",
        unitName: "piece",
        unitNameAr: "قطعة",
        unitNameEn: "piece",
        quantity: decimal("2.000"),
        unitPrice: decimal("50.123"),
        discountType: "PERCENTAGE",
        discountValue: decimal("2.500"),
        discountAmount: decimal("2.506"),
        taxPercentage: decimal("7.00"),
        taxAmount: decimal("6.826"),
        subtotal: decimal("100.246"),
        totalAmount: decimal("104.566"),
      },
      {
        id: "quotation-line-2",
        catalogItemId: null,
        taxRateId: null,
        position: 2,
        type: "CUSTOM",
        itemCode: null,
        itemName: "Custom snapshot",
        itemNameAr: null,
        itemNameEn: "Custom snapshot",
        description: null,
        descriptionAr: null,
        descriptionEn: null,
        unitName: null,
        unitNameAr: null,
        unitNameEn: null,
        quantity: decimal("1.000"),
        unitPrice: decimal("23.210"),
        discountType: null,
        discountValue: decimal("0.000"),
        discountAmount: decimal("0.000"),
        taxPercentage: decimal("0.00"),
        taxAmount: decimal("0.000"),
        subtotal: decimal("23.210"),
        totalAmount: decimal("23.210"),
      },
    ],
  };
}

function salesOrderRecord(overrides: Record<string, unknown> = {}) {
  const source = sourceQuotation();
  return {
    id: "sales-order-1",
    companyId: source.companyId,
    sourceQuotationId: source.id,
    sourceQuotationNumber: source.number,
    number: `SO-${source.number}`,
    status: "DRAFT",
    customerId: source.customerId,
    priceListId: source.priceListId,
    currencyCode: source.currencyCode,
    orderDate: now,
    customerName: source.customerName,
    customerNameAr: source.customerNameAr,
    customerNameEn: source.customerNameEn,
    customerEmail: source.customerEmail,
    customerPhone: source.customerPhone,
    customerTaxNo: source.customerTaxNo,
    billingAddress: source.billingAddress,
    subjectAr: source.subjectAr,
    subjectEn: source.subjectEn,
    briefAr: source.briefAr,
    briefEn: source.briefEn,
    projectName: source.projectName,
    projectNameAr: source.projectNameAr,
    projectNameEn: source.projectNameEn,
    attentionName: source.attentionName,
    attentionNameAr: source.attentionNameAr,
    attentionNameEn: source.attentionNameEn,
    scopeType: source.scopeType,
    subtotal: source.subtotal,
    discountType: source.discountType,
    discountValue: source.discountValue,
    discountAmount: source.discountAmount,
    taxAmount: source.taxAmount,
    totalAmount: source.totalAmount,
    notes: source.notes,
    notesAr: source.notesAr,
    notesEn: source.notesEn,
    termsAndConditions: source.termsAndConditions,
    termsAndConditionsAr: source.termsAndConditionsAr,
    termsAndConditionsEn: source.termsAndConditionsEn,
    sourceApprovedAt: source.approvedAt,
    sourceApprovedByName: source.approvedByName,
    sourceApprovedByRole: source.approvedByRole,
    createdByUserId: "user-1",
    createdByName: "Creator Snapshot",
    createdByRole: "SALES",
    createdAt: now,
    updatedAt: now,
    lines: source.lines.map((line, index) => ({
      ...line,
      id: `sales-order-line-${index + 1}`,
      salesOrderId: "sales-order-1",
      sourceQuotationLineId: line.id,
      createdAt: now,
      updatedAt: now,
    })),
    ...overrides,
  };
}

function conversionDb(source = sourceQuotation()) {
  const findExisting = vi.fn().mockResolvedValue(null);
  const findQuotation = vi.fn().mockResolvedValue(source);
  const create = vi.fn().mockResolvedValue(salesOrderRecord());
  const tx = {
    salesOrder: { findFirst: findExisting, create },
    quotation: { findFirst: findQuotation },
  };
  return {
    db: {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
      salesOrder: { findFirst: vi.fn() },
    },
    tx,
  };
}

const command = {
  companyId: "company-1",
  quotationId: "quotation-1",
  createdByUserId: "user-1",
  createdByName: "Creator Snapshot",
  createdByRole: "SALES",
};

describe("PrismaSalesOrderRepository conversion", () => {
  it("copies the complete persisted approved snapshot atomically without live lookups", async () => {
    const { db, tx } = conversionDb();
    const repository = new PrismaSalesOrderRepository(db as never);

    const result = await repository.convertApprovedQuotation(command);

    expect(result.kind).toBe("CREATED");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.quotation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
        isDeleted: false,
      },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    const data = tx.salesOrder.create.mock.calls[0][0].data;
    expect(data.number).toBe("SO-QT-1001");
    expect(data.status).toBe("DRAFT");
    expect(data.customerName).toBe("Saved Customer");
    expect(data.customerNameAr).toBe("العميل المحفوظ");
    expect(data.subtotal.toString()).toBe("123.456");
    expect(data.discountAmount.toString()).toBe("3.21");
    expect(data.taxAmount.toString()).toBe("7.654");
    expect(data.totalAmount.toString()).toBe("127.9");
    expect(data.sourceApprovedByName).toBe("Approver Snapshot");
    expect(data.createdByUser).toEqual({ connect: { id: "user-1" } });
    expect(data.lines.create).toHaveLength(2);
    expect(data.lines.create[0]).toMatchObject({
      position: 1,
      itemName: "Saved Camera",
    });
    expect(data.lines.create[0].unitPrice.toString()).toBe("50.123");
    expect(data.lines.create[0].discountAmount.toString()).toBe("2.506");
    expect(data.lines.create[0].taxPercentage.toString()).toBe("7");
    expect(data.lines.create[0].taxAmount.toString()).toBe("6.826");
    expect(data.lines.create[0].totalAmount.toString()).toBe("104.566");
    expect(data.lines.create[1]).not.toHaveProperty("catalogItem");
    expect(data.lines.create[1]).not.toHaveProperty("taxRate");
    expect(Object.keys(tx)).toEqual(["salesOrder", "quotation"]);
  });

  it("returns the existing tenant order before loading mutable source data", async () => {
    const { db, tx } = conversionDb();
    tx.salesOrder.findFirst.mockResolvedValue(salesOrderRecord());
    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation(command);

    expect(result.kind).toBe("EXISTING");
    expect(tx.quotation.findFirst).not.toHaveBeenCalled();
    expect(tx.salesOrder.create).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "SENT", "REJECTED", "EXPIRED", "CANCELLED"])(
    "rejects %s without creating an order",
    async (status) => {
      const { db, tx } = conversionDb(sourceQuotation(status));
      const result = await new PrismaSalesOrderRepository(db as never)
        .convertApprovedQuotation(command);

      expect(result).toEqual({ kind: "INVALID_QUOTATION_STATUS", status });
      expect(tx.salesOrder.create).not.toHaveBeenCalled();
    },
  );

  it("returns not found for missing or cross-tenant quotations", async () => {
    const { db, tx } = conversionDb();
    tx.quotation.findFirst.mockResolvedValue(null);
    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation(command);

    expect(result).toEqual({ kind: "QUOTATION_NOT_FOUND" });
    expect(tx.salesOrder.create).not.toHaveBeenCalled();
  });

  it("fails safely for missing lines or approval metadata", async () => {
    const missingLines = sourceQuotation();
    missingLines.lines = [];
    const first = conversionDb(missingLines);
    const empty = await new PrismaSalesOrderRepository(first.db as never)
      .convertApprovedQuotation(command);
    expect(empty).toMatchObject({ kind: "INVALID_SOURCE_SNAPSHOT" });
    expect(first.tx.salesOrder.create).not.toHaveBeenCalled();

    const missingApproval = sourceQuotation();
    missingApproval.approvedByName = "";
    const second = conversionDb(missingApproval);
    const invalid = await new PrismaSalesOrderRepository(second.db as never)
      .convertApprovedQuotation(command);
    expect(invalid).toMatchObject({ kind: "INVALID_SOURCE_SNAPSHOT" });
    expect(second.tx.salesOrder.create).not.toHaveBeenCalled();
  });

  it("recovers only the source-quotation unique race as idempotent success", async () => {
    const existing = salesOrderRecord();
    const db = {
      $transaction: vi.fn().mockRejectedValue({
        code: "P2002",
        meta: { target: ["sourceQuotationId"] },
      }),
      salesOrder: { findFirst: vi.fn().mockResolvedValue(existing) },
    };
    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation(command);

    expect(result.kind).toBe("EXISTING");
    expect(db.salesOrder.findFirst).toHaveBeenCalledWith({
      where: { companyId: "company-1", sourceQuotationId: "quotation-1" },
      include: { lines: { orderBy: { position: "asc" } } },
    });
  });

  it("recovers the deterministic company-number race only when the source order exists", async () => {
    const existing = salesOrderRecord();
    const db = {
      $transaction: vi.fn().mockRejectedValue({
        code: "P2002",
        meta: { target: ["companyId", "number"] },
      }),
      salesOrder: { findFirst: vi.fn().mockResolvedValue(existing) },
    };
    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation(command);
    expect(result.kind).toBe("EXISTING");
  });

  it("does not swallow unrelated unique or persistence errors", async () => {
    const unrelated = { code: "P2002", meta: { target: ["number"] } };
    const db = {
      $transaction: vi.fn().mockRejectedValue(unrelated),
      salesOrder: { findFirst: vi.fn() },
    };
    await expect(
      new PrismaSalesOrderRepository(db as never)
        .convertApprovedQuotation(command),
    ).rejects.toBe(unrelated);

    const unexpected = new Error("database unavailable");
    db.$transaction.mockRejectedValue(unexpected);
    await expect(
      new PrismaSalesOrderRepository(db as never)
        .convertApprovedQuotation(command),
    ).rejects.toBe(unexpected);
  });
});

describe("PrismaSalesOrderRepository reads", () => {
  it("tenant-scopes detail, source guard, and listing with stable ordering", async () => {
    const record = salesOrderRecord();
    const db = {
      salesOrder: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(record)
          .mockResolvedValueOnce({ id: "sales-order-1" }),
        findMany: vi.fn().mockResolvedValue([record]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const repository = new PrismaSalesOrderRepository(db as never);

    await repository.findById("company-1", "sales-order-1");
    await repository.existsBySourceQuotation("company-1", "quotation-1");
    const list = await repository.findAll({
      companyId: "company-1",
      search: "SO-",
      skip: 0,
      take: 20,
    });

    expect(db.salesOrder.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: "sales-order-1", companyId: "company-1" },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    expect(db.salesOrder.findFirst).toHaveBeenNthCalledWith(2, {
      where: { companyId: "company-1", sourceQuotationId: "quotation-1" },
      select: { id: true },
    });
    expect(db.salesOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-1" }),
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
      skip: 0,
      take: 20,
    }));
    expect(list.total).toBe(1);
  });

  it("round-trips nullable references and sorts snapshot lines", () => {
    const record = salesOrderRecord({
      createdByUserId: null,
      priceListId: null,
      lines: [...salesOrderRecord().lines].reverse().map((line) => ({
        ...line,
        catalogItemId: null,
        taxRateId: null,
      })),
    });
    const order = PrismaSalesOrderMapper.toDomain(record as never);

    expect(order.createdByUserId).toBeNull();
    expect(order.priceListId).toBeNull();
    expect(order.lines.map((line) => line.position)).toEqual([1, 2]);
    expect(order.lines[0].catalogItemId).toBeNull();
    expect(order.totalAmount).toBe(127.9);
  });
});
