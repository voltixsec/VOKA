import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { QuotationDelivery } from "@/src/domain/quotation-delivery";

import { PrismaQuotationDeliveryRepository } from "../PrismaQuotationDeliveryRepository";

const db = {
  quotationDelivery: {
    create: vi.fn(),
    findUnique: vi.fn(),
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
    actorUserId: "user-1",
    requestKey: id,
    provider: "RESEND",
    providerMessageId: null,
    documentSha256: null,
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
    db.quotationDelivery.findUnique.mockResolvedValue(null);
    db.quotationDelivery.create.mockImplementation(async ({ data }) => data);
    db.quotationDelivery.updateMany.mockResolvedValue({ count: 1 });
    db.quotationDelivery.findMany.mockResolvedValue([]);
  });

  it("persists the immutable tenant, quotation, channel, and recipient fields", async () => {
    const repository = new PrismaQuotationDeliveryRepository(db as never);

    await repository.reserve(delivery());

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

  it("returns an existing tenant request reservation without creating a duplicate", async () => {
    db.quotationDelivery.findUnique.mockResolvedValue({
      ...record("delivery-existing", "2026-08-14T10:00:00.000Z"),
      requestKey: "delivery-1",
    });
    const repository = new PrismaQuotationDeliveryRepository(db as never);

    const result = await repository.reserve(delivery());

    expect(result).toMatchObject({
      created: false,
      delivery: { id: "delivery-existing" },
    });
    expect(db.quotationDelivery.create).not.toHaveBeenCalled();
    expect(db.quotationDelivery.findUnique).toHaveBeenCalledWith({
      where: {
        companyId_requestKey: {
          companyId: "company-1",
          requestKey: "delivery-1",
        },
      },
    });
  });

  it("recovers a concurrent unique-key race as the same reserved attempt", async () => {
    db.quotationDelivery.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...record("delivery-winner", "2026-08-14T10:00:00.000Z"),
        requestKey: "delivery-1",
      });
    db.quotationDelivery.create.mockRejectedValueOnce(new Error("unique constraint"));
    const repository = new PrismaQuotationDeliveryRepository(db as never);

    const result = await repository.reserve(delivery());

    expect(result).toMatchObject({
      created: false,
      delivery: { id: "delivery-winner" },
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
