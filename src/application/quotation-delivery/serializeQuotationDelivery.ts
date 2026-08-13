import type { QuotationDelivery } from "@/src/domain/quotation-delivery";

export function serializeQuotationDelivery(delivery: QuotationDelivery) {
  return {
    id: delivery.id,
    quotationId: delivery.quotationId,
    channel: delivery.channel,
    recipient: delivery.recipient,
    status: delivery.status,
    providerMessageId: delivery.providerMessageId,
    errorCode: delivery.errorCode,
    errorMessage: delivery.errorMessage,
    attemptedAt: delivery.attemptedAt.toISOString(),
    sentAt: delivery.sentAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
