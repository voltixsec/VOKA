import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { QuotationDelivery } from "@/src/domain/quotation-delivery";

import { PrismaQuotationDeliveryRepository } from "../PrismaQuotationDeliveryRepository";

const db = {
  quotationDelivery: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
};

function delivery() {
  return new QuotationDelivery({
    id: "delivery-1",
    companyId: "company-1",
    quotationId: "quotation-1",
    channel: "EMAIL",
    recipient: "customer@example.com",
    attemptedAt: new Date("2026-08-14T10:00:00.000Z"),
  });
}

function record(id: string, createdAt: string) {
  return {
    id,
    companyId: "company-1",
    quotationId: "quotation-1",
    channel: "EMAIL" as const,
    recipient: "customer@example.com",
    status: "FAILED" as const,
    providerMessageId: null,
    errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    errorMessage: "Quotation delivery provider is not configured.",
    attemptedAt: new Date(createdAt),
    sentAt: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

describe("PrismaQuotationDeliveryRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.quotationDelivery.create.mockResolvedValue(undefined);
    db.quotationDelivery.updateMany.mockResolvedValue({ count: 1 });
    db.quotationDelivery.findMany.mockResolvedValue([]);
  });

  it("persists the immutable tenant, quotation, channel, and recipient fields", async () => {
    const repository = new PrismaQuotationDeliveryRepository(db as never);

    await repository.create(delivery());

    expect(db.quotationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "delivery-1",
        companyId: "company-1",
        quotationId: "quotation-1",
        channel: "EMAIL",
        recipient: "customer@example.com",
        status: "PENDING",
      }),
    });
  });

  it("updates an outcome only inside the original tenant and quotation", async () => {
    const repository = new PrismaQuotationDeliveryRepository(db as never);
    const value = delivery();
    value.markFailed("FAILED", "Failed safely.", new Date("2026-08-14T10:01:00.000Z"));

    await repository.update(value);

    expect(db.quotationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: "delivery-1",
        companyId: "company-1",
        quotationId: "quotation-1",
      },
      data: expect.objectContaining({ status: "FAILED", errorCode: "FAILED" }),
    });
  });

  it("queries tenant-scoped history newest first", async () => {
    db.quotationDelivery.findMany.mockResolvedValue([
      record("delivery-2", "2026-08-14T11:00:00.000Z"),
      record("delivery-1", "2026-08-14T10:00:00.000Z"),
    ]);
    const repository = new PrismaQuotationDeliveryRepository(db as never);

    const history = await repository.findHistory("company-1", "quotation-1");

    expect(db.quotationDelivery.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", quotationId: "quotation-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(history.map((value) => value.id)).toEqual(["delivery-2", "delivery-1"]);
  });
});
