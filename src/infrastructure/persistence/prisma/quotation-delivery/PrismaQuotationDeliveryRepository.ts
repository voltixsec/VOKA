import { prisma } from "@/lib/prisma";
import type { QuotationDeliveryRepository } from "@/src/application/quotation-delivery";
import { QuotationDelivery } from "@/src/domain/quotation-delivery";

export class PrismaQuotationDeliveryRepository
  implements QuotationDeliveryRepository {
  constructor(private readonly db = prisma) {}

  async reserve(delivery: QuotationDelivery): Promise<{
    created: boolean;
    delivery: QuotationDelivery;
  }> {
    const existing = await this.db.quotationDelivery.findUnique({
      where: {
        companyId_requestKey: {
          companyId: delivery.companyId,
          requestKey: delivery.requestKey,
        },
      },
    });
    if (existing) return { created: false, delivery: this.toDomain(existing) };

    const data = {
        id: delivery.id,
        companyId: delivery.companyId,
        quotationId: delivery.quotationId,
        actorUserId: delivery.actorUserId,
        requestKey: delivery.requestKey,
        channel: delivery.channel,
        recipient: delivery.recipient,
        status: delivery.status,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        documentSha256: delivery.documentSha256,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
        attemptedAt: delivery.attemptedAt,
        sentAt: delivery.sentAt,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
    };

    try {
      const record = await this.db.quotationDelivery.create({ data });
      return { created: true, delivery: this.toDomain(record) };
    } catch (error) {
      const concurrent = await this.db.quotationDelivery.findUnique({
        where: {
          companyId_requestKey: {
            companyId: delivery.companyId,
            requestKey: delivery.requestKey,
          },
        },
      });
      if (!concurrent) throw error;
      return { created: false, delivery: this.toDomain(concurrent) };
    }
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
        documentSha256: delivery.documentSha256,
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

    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: {
    id: string;
    companyId: string;
    quotationId: string;
    actorUserId: string | null;
    requestKey: string;
    channel: "EMAIL" | "WHATSAPP";
    recipient: string;
    provider: string;
    status: "PENDING" | "SENT" | "FAILED";
    providerMessageId: string | null;
    documentSha256: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    attemptedAt: Date;
    sentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): QuotationDelivery {
    return new QuotationDelivery({
      id: record.id,
      companyId: record.companyId,
      quotationId: record.quotationId,
      actorUserId: record.actorUserId,
      requestKey: record.requestKey,
      channel: record.channel,
      recipient: record.recipient,
      provider: record.provider,
      status: record.status,
      providerMessageId: record.providerMessageId,
      documentSha256: record.documentSha256,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
      attemptedAt: record.attemptedAt,
      sentAt: record.sentAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
