import { prisma } from "@/lib/prisma";
import type { QuotationDeliveryRepository } from "@/src/application/quotation-delivery";
import { QuotationDelivery } from "@/src/domain/quotation-delivery";

export class PrismaQuotationDeliveryRepository
  implements QuotationDeliveryRepository {
  constructor(private readonly db = prisma) {}

  async create(delivery: QuotationDelivery): Promise<void> {
    await this.db.quotationDelivery.create({
      data: {
        id: delivery.id,
        companyId: delivery.companyId,
        quotationId: delivery.quotationId,
        channel: delivery.channel,
        recipient: delivery.recipient,
        status: delivery.status,
        providerMessageId: delivery.providerMessageId,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
        attemptedAt: delivery.attemptedAt,
        sentAt: delivery.sentAt,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      },
    });
  }

  async update(delivery: QuotationDelivery): Promise<void> {
    const result = await this.db.quotationDelivery.updateMany({
      where: {
        id: delivery.id,
        companyId: delivery.companyId,
        quotationId: delivery.quotationId,
      },
      data: {
        status: delivery.status,
        providerMessageId: delivery.providerMessageId,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
        sentAt: delivery.sentAt,
        updatedAt: delivery.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new Error("Quotation delivery attempt was not found.");
    }
  }

  async findHistory(
    companyId: string,
    quotationId: string,
  ): Promise<QuotationDelivery[]> {
    const records = await this.db.quotationDelivery.findMany({
      where: { companyId, quotationId },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });

    return records.map((record) => new QuotationDelivery({
      id: record.id,
      companyId: record.companyId,
      quotationId: record.quotationId,
      channel: record.channel,
      recipient: record.recipient,
      status: record.status,
      providerMessageId: record.providerMessageId,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
      attemptedAt: record.attemptedAt,
      sentAt: record.sentAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }
}
