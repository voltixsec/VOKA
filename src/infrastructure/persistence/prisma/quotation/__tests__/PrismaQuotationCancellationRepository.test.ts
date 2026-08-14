import { afterEach, describe, expect, it, vi } from "vitest";

import { Quotation, QuotationDomainError } from "../../../../../domain/quotation";
import { PrismaQuotationCancellationRepository } from "../PrismaQuotationCancellationRepository";
import { PrismaQuotationMapper } from "../PrismaQuotationMapper";
import { lockActiveQuotationForUpdate } from "../lockActiveQuotationForUpdate";

vi.mock("../../../../../../lib/prisma", () => ({ prisma: {} }));

function quotation(
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "CANCELLED" = "APPROVED",
): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "QT-1001",
    status,
    customer: { name: "Customer" },
    lines: [{
      position: 1,
      type: "CUSTOM",
      itemName: "Item",
      quantity: 1,
      unitPrice: 10,
    }],
  });
}

function cancellationDb(options: {
  locked?: boolean;
  record?: object | null;
  salesOrder?: object | null;
  updateCount?: number;
} = {}) {
  const queryRaw = vi.fn().mockResolvedValue(
    options.locked === false ? [] : [{ id: "quotation-1" }],
  );
  const findQuotation = vi.fn().mockResolvedValue(
    options.record === undefined ? { id: "quotation-1" } : options.record,
  );
  const findSalesOrder = vi.fn().mockResolvedValue(options.salesOrder ?? null);
  const updateMany = vi.fn().mockResolvedValue({
    count: options.updateCount ?? 1,
  });
  const tx = {
    $queryRaw: queryRaw,
    quotation: {
      findFirst: findQuotation,
      updateMany,
    },
    salesOrder: { findFirst: findSalesOrder },
  };
  const db = {
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    db,
    tx,
    queryRaw,
    findQuotation,
    findSalesOrder,
    updateMany,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lockActiveQuotationForUpdate", () => {
  it("uses one parameterized tenant-owned active quotation row lock", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: "quotation-1" }]);

    await expect(lockActiveQuotationForUpdate(
      { $queryRaw: queryRaw } as never,
      "company-1",
      "quotation-1",
    )).resolves.toBe(true);

    const [sql, quotationId, companyId] = queryRaw.mock.calls[0];
    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      'WHERE "id" = ?',
    );
    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      'AND "companyId" = ?',
    );
    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      'AND "isDeleted" = FALSE',
    );
    expect(Array.from(sql as TemplateStringsArray).join("?")).toContain(
      "FOR UPDATE",
    );
    expect([quotationId, companyId]).toEqual([
      "quotation-1",
      "company-1",
    ]);
  });
});

describe("PrismaQuotationCancellationRepository", () => {
  it("locks, reloads, checks the Sales Order, and updates only lifecycle fields", async () => {
    const value = quotation();
    vi.spyOn(PrismaQuotationMapper, "toDomain").mockReturnValue(value);
    const context = cancellationDb();

    const result = await new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId: "company-1", quotationId: "quotation-1" });

    expect(result).toEqual({ kind: "CANCELLED" });
    expect(value.status).toBe("CANCELLED");
    expect(context.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      context.findQuotation.mock.invocationCallOrder[0],
    );
    expect(context.findQuotation.mock.invocationCallOrder[0]).toBeLessThan(
      context.findSalesOrder.mock.invocationCallOrder[0],
    );
    expect(context.findSalesOrder.mock.invocationCallOrder[0]).toBeLessThan(
      context.updateMany.mock.invocationCallOrder[0],
    );
    expect(context.findQuotation).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
        isDeleted: false,
      },
      include: { lines: true },
    });
    expect(context.findSalesOrder).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        sourceQuotationId: "quotation-1",
      },
      select: { id: true },
    });
    expect(context.updateMany).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
        isDeleted: false,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });
    expect(Object.keys(context.tx.quotation)).toEqual([
      "findFirst",
      "updateMany",
    ]);
    expect(context.tx).not.toHaveProperty("quotationLine");
  });

  it("returns the conversion-wins conflict without mutating the quotation", async () => {
    const value = quotation();
    vi.spyOn(PrismaQuotationMapper, "toDomain").mockReturnValue(value);
    const context = cancellationDb({ salesOrder: { id: "sales-order-1" } });

    const result = await new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId: "company-1", quotationId: "quotation-1" });

    expect(result).toEqual({ kind: "QUOTATION_HAS_SALES_ORDER" });
    expect(value.status).toBe("APPROVED");
    expect(context.updateMany).not.toHaveBeenCalled();
    expect(PrismaQuotationMapper.toDomain).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", "company-1"],
    ["soft-deleted", "company-1"],
    ["cross-tenant", "other-company"],
  ])("returns not found for a %s quotation that cannot be locked", async (_case, companyId) => {
    const context = cancellationDb({ locked: false });

    const result = await new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId, quotationId: "quotation-1" });

    expect(result).toEqual({ kind: "QUOTATION_NOT_FOUND" });
    expect(context.findQuotation).not.toHaveBeenCalled();
    expect(context.findSalesOrder).not.toHaveBeenCalled();
    expect(context.updateMany).not.toHaveBeenCalled();
  });

  it("returns not found if a locked source cannot be reloaded", async () => {
    const context = cancellationDb({ record: null });

    const result = await new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId: "company-1", quotationId: "quotation-1" });

    expect(result).toEqual({ kind: "QUOTATION_NOT_FOUND" });
    expect(context.findSalesOrder).not.toHaveBeenCalled();
    expect(context.updateMany).not.toHaveBeenCalled();
  });

  it("preserves invalid domain transitions and performs no lifecycle write", async () => {
    vi.spyOn(PrismaQuotationMapper, "toDomain").mockReturnValue(
      quotation("REJECTED"),
    );
    const context = cancellationDb();

    await expect(new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId: "company-1", quotationId: "quotation-1" }))
      .rejects.toBeInstanceOf(QuotationDomainError);
    expect(context.updateMany).not.toHaveBeenCalled();
  });

  it("does not relabel unexpected persistence failures as conflicts", async () => {
    const value = quotation();
    vi.spyOn(PrismaQuotationMapper, "toDomain").mockReturnValue(value);
    const context = cancellationDb({ updateCount: 0 });

    await expect(new PrismaQuotationCancellationRepository(
      context.db as never,
    ).cancel({ companyId: "company-1", quotationId: "quotation-1" }))
      .rejects.toThrow("Failed to persist locked quotation cancellation.");
  });
});
