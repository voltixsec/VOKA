import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/prisma", () => ({
  prisma: {},
}));

import { Quotation } from "../../../../../domain/quotation";
import { PrismaQuotationRepository } from "../PrismaQuotationRepository";

function createQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: {
      name: "First United",
    },
  });
}

describe("PrismaQuotationRepository tenant isolation", () => {
  it("scopes findById to the active company", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = {
      quotation: {
        findFirst,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);

    await repository.findById("company-1", "quotation-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
        isDeleted: false,
      },
      include: {
        lines: true,
      },
    });
  });

  it("scopes update to the active company", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      quotation: {
        update,
      },
      quotationLine: {
        deleteMany,
      },
    };
    const db = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<void>,
        ) => callback(transaction),
      ),
    };

    const repository = new PrismaQuotationRepository(db as never);

    await repository.update("company-1", createQuotation());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "quotation-1",
          companyId: "company-1",
        },
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "quotation-1",
          companyId: "company-1",
        },
      }),
    );
  });

  it("scopes soft delete to the active company", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const db = {
      quotation: {
        update,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);

    await repository.delete("company-1", "quotation-1");

    expect(update).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
      },
      data: {
        isDeleted: true,
        deletedAt: expect.any(Date),
      },
    });
  });
});
