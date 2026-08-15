import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../../../../lib/generated/prisma/client";
import { CancelQuotationUseCase } from "../../../../../application/quotation";
import { PrismaQuotationCancellationRepository } from "../../quotation/PrismaQuotationCancellationRepository";
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
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: null,
    confirmedByRole: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelledByName: null,
    cancelledByRole: null,
    cancellationReason: null,
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
  const lockQuotation = vi.fn().mockResolvedValue([{ id: "quotation-1" }]);
  const findExisting = vi.fn().mockResolvedValue(null);
  const findQuotation = vi.fn().mockResolvedValue(source);
  const create = vi.fn().mockResolvedValue(salesOrderRecord());
  const tx = {
    $queryRaw: lockQuotation,
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
    lockQuotation,
  };
}

const command = {
  companyId: "company-1",
  quotationId: "quotation-1",
  createdByUserId: "user-1",
  createdByName: "Creator Snapshot",
  createdByRole: "SALES",
};

function serializedConversionCancellationDb() {
  const state: {
    status: string;
    salesOrder: ReturnType<typeof salesOrderRecord> | null;
  } = {
    status: "APPROVED",
    salesOrder: null,
  };
  const queryRaw = vi.fn().mockResolvedValue([{ id: "quotation-1" }]);
  const findQuotation = vi.fn().mockImplementation(() =>
    Promise.resolve(sourceQuotation(state.status)),
  );
  const findSalesOrder = vi.fn().mockImplementation(() =>
    Promise.resolve(state.salesOrder),
  );
  const createSalesOrder = vi.fn().mockImplementation(() => {
    state.salesOrder = salesOrderRecord();
    return Promise.resolve(state.salesOrder);
  });
  const updateQuotation = vi.fn().mockImplementation((args) => {
    state.status = args.data.status;
    return Promise.resolve({ count: 1 });
  });
  const tx = {
    $queryRaw: queryRaw,
    quotation: {
      findFirst: findQuotation,
      updateMany: updateQuotation,
    },
    salesOrder: {
      findFirst: findSalesOrder,
      create: createSalesOrder,
    },
  };
  const db = {
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    salesOrder: { findFirst: findSalesOrder },
  };

  return {
    state,
    db,
    queryRaw,
    createSalesOrder,
    updateQuotation,
  };
}

describe("PrismaSalesOrderRepository conversion", () => {
  it("copies the complete persisted approved snapshot atomically without live lookups", async () => {
    const { db, tx } = conversionDb();
    const repository = new PrismaSalesOrderRepository(db as never);

    const result = await repository.convertApprovedQuotation(command);

    expect(result.kind).toBe("CREATED");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.salesOrder.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.salesOrder.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.quotation.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.quotation.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.salesOrder.create.mock.invocationCallOrder[0],
    );
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
    expect(Object.keys(tx)).toEqual(["$queryRaw", "salesOrder", "quotation"]);
  });

  it("locks before returning the existing tenant order without loading source data", async () => {
    const { db, tx } = conversionDb();
    tx.salesOrder.findFirst.mockResolvedValue(salesOrderRecord());
    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation(command);

    expect(result.kind).toBe("EXISTING");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.salesOrder.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.quotation.findFirst).not.toHaveBeenCalled();
    expect(tx.salesOrder.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", "company-1"],
    ["soft-deleted", "company-1"],
    ["cross-tenant", "other-company"],
  ])("returns not found before any order decision for a %s source", async (_case, companyId) => {
    const { db, tx, lockQuotation } = conversionDb();
    lockQuotation.mockResolvedValue([]);

    const result = await new PrismaSalesOrderRepository(db as never)
      .convertApprovedQuotation({
        ...command,
        companyId,
      });

    expect(result).toEqual({ kind: "QUOTATION_NOT_FOUND" });
    expect(tx.salesOrder.findFirst).not.toHaveBeenCalled();
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

  it("models the conversion-wins serialized outcome", async () => {
    const context = serializedConversionCancellationDb();
    const conversion = await new PrismaSalesOrderRepository(
      context.db as never,
    ).convertApprovedQuotation(command);
    const cancellation = await new CancelQuotationUseCase(
      new PrismaQuotationCancellationRepository(context.db as never),
    ).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });

    expect(conversion.kind).toBe("CREATED");
    expect(cancellation).toMatchObject({
      success: false,
      error: { code: "QUOTATION_HAS_SALES_ORDER" },
    });
    expect(context.state.salesOrder).not.toBeNull();
    expect(context.state.status).toBe("APPROVED");
    expect(context.updateQuotation).not.toHaveBeenCalled();
    expect(context.queryRaw).toHaveBeenCalledTimes(2);
  });

  it("models the cancellation-wins serialized outcome", async () => {
    const context = serializedConversionCancellationDb();
    const cancellation = await new CancelQuotationUseCase(
      new PrismaQuotationCancellationRepository(context.db as never),
    ).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });
    const conversion = await new PrismaSalesOrderRepository(
      context.db as never,
    ).convertApprovedQuotation(command);

    expect(cancellation.success).toBe(true);
    expect(context.state.status).toBe("CANCELLED");
    expect(conversion).toEqual({
      kind: "INVALID_QUOTATION_STATUS",
      status: "CANCELLED",
    });
    expect(context.state.salesOrder).toBeNull();
    expect(context.createSalesOrder).not.toHaveBeenCalled();
    expect(context.queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe("PrismaSalesOrderRepository confirmation and cancellation CAS transitions", () => {
  it("confirms a DRAFT sales order with atomic CAS update and audit persistence", async () => {
    const draftRecord = salesOrderRecord({ status: "DRAFT" });
    const confirmedRecord = salesOrderRecord({
      status: "CONFIRMED",
      confirmedAt: now,
      confirmedByUserId: "user-2",
      confirmedByName: "Confirmer",
      confirmedByRole: "ADMIN",
    });

    const lockSalesOrder = vi.fn().mockResolvedValue([{ id: "sales-order-1" }]);
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(draftRecord)
      .mockResolvedValueOnce(confirmedRecord);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    const tx = {
      $queryRaw: lockSalesOrder,
      salesOrder: { findFirst, updateMany },
    };
    const db = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    };

    const repository = new PrismaSalesOrderRepository(db as never);
    const result = await repository.confirm({
      companyId: "company-1",
      salesOrderId: "sales-order-1",
      expectedStatus: "DRAFT",
      actor: { userId: "user-2", name: "Confirmer", role: "ADMIN" },
    });

    expect(result.kind).toBe("CONFIRMED");
    if (result.kind === "CONFIRMED") {
      expect(result.salesOrder.status).toBe("CONFIRMED");
      expect(result.salesOrder.confirmedByName).toBe("Confirmer");
    }
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "sales-order-1",
        companyId: "company-1",
        status: "DRAFT",
      },
      data: expect.objectContaining({
        status: "CONFIRMED",
        confirmedByUserId: "user-2",
        confirmedByName: "Confirmer",
        confirmedByRole: "ADMIN",
      }),
    });
  });

  it("handles competing DRAFT confirm vs cancel: confirm wins, cancel gets STALE_STATE conflict", async () => {
    // Simulated DB state that changes when confirm runs
    let currentRecord = salesOrderRecord({ status: "DRAFT" });

    const createDbTx = (statusAtStart: string) => {
      const lockSalesOrder = vi.fn().mockResolvedValue([{ id: "sales-order-1" }]);
      const findFirst = vi.fn().mockImplementation(() => Promise.resolve(currentRecord));
      const updateMany = vi.fn().mockImplementation((args) => {
        if (currentRecord.status === args.where.status) {
          currentRecord = {
            ...currentRecord,
            ...args.data,
          };
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      });

      const tx = {
        $queryRaw: lockSalesOrder,
        salesOrder: { findFirst, updateMany },
      };
      return {
        $transaction: vi.fn(async (cb) => cb(tx)),
      };
    };

    const repo1 = new PrismaSalesOrderRepository(createDbTx("DRAFT") as never);
    // Request 1: Confirm with expectedStatus=DRAFT
    const confirmResult = await repo1.confirm({
      companyId: "company-1",
      salesOrderId: "sales-order-1",
      expectedStatus: "DRAFT",
      actor: { userId: "user-1", name: "Confirmer", role: "ADMIN" },
    });

    expect(confirmResult.kind).toBe("CONFIRMED");
    expect(currentRecord.status).toBe("CONFIRMED");

    // Request 2: Cancel originating from old DRAFT state with expectedStatus=DRAFT
    const repo2 = new PrismaSalesOrderRepository(createDbTx("CONFIRMED") as never);
    const cancelResult = await repo2.cancel({
      companyId: "company-1",
      salesOrderId: "sales-order-1",
      expectedStatus: "DRAFT",
      reason: "Old client request",
      actor: { userId: "user-2", name: "Canceller", role: "OWNER" },
    });

    expect(cancelResult).toEqual({
      kind: "STALE_STATE",
      currentStatus: "CONFIRMED",
    });
    // Ensure state remains CONFIRMED
    expect(currentRecord.status).toBe("CONFIRMED");

    // Request 3: Client reloads, sees CONFIRMED, cancels with expectedStatus=CONFIRMED
    const repo3 = new PrismaSalesOrderRepository(createDbTx("CONFIRMED") as never);
    const laterCancelResult = await repo3.cancel({
      companyId: "company-1",
      salesOrderId: "sales-order-1",
      expectedStatus: "CONFIRMED",
      reason: "Post-confirmation client cancellation",
      actor: { userId: "user-2", name: "Canceller", role: "OWNER" },
    });

    expect(laterCancelResult.kind).toBe("CANCELLED");
    if (laterCancelResult.kind === "CANCELLED") {
      expect(laterCancelResult.salesOrder.status).toBe("CANCELLED");
      expect(laterCancelResult.salesOrder.cancellationReason).toBe(
        "Post-confirmation client cancellation",
      );
    }
  });

  it("returns SALES_ORDER_NOT_FOUND if order is missing or cross-tenant during confirm or cancel", async () => {
    const lockSalesOrder = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw: lockSalesOrder, salesOrder: { findFirst: vi.fn() } };
    const db = { $transaction: vi.fn(async (cb) => cb(tx)) };

    const repo = new PrismaSalesOrderRepository(db as never);

    const confirmRes = await repo.confirm({
      companyId: "other-company",
      salesOrderId: "sales-order-1",
      expectedStatus: "DRAFT",
      actor: { name: "A", role: "ADMIN" },
    });
    expect(confirmRes).toEqual({ kind: "SALES_ORDER_NOT_FOUND" });

    const cancelRes = await repo.cancel({
      companyId: "other-company",
      salesOrderId: "sales-order-1",
      expectedStatus: "DRAFT",
      reason: "Some reason",
      actor: { name: "A", role: "ADMIN" },
    });
    expect(cancelRes).toEqual({ kind: "SALES_ORDER_NOT_FOUND" });
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
