import type { IQuotationRepository } from "@/src/application/quotation";
import type { QuotationDocumentProvider } from "@/src/application/document";
import {
  isQuotationDeliveryChannel,
  QuotationDelivery,
  type QuotationDeliveryChannel,
} from "@/src/domain/quotation-delivery";

import type { QuotationDeliveryGateway } from "./QuotationDeliveryGateway";
import type { QuotationDeliveryRepository } from "./QuotationDeliveryRepository";
import { createQuotationDeliveryProviderRequestKey } from "./createQuotationDeliveryProviderRequestKey";

export type DeliverQuotationInput = {
  companyId: string;
  quotationId: string;
  channel: QuotationDeliveryChannel;
  recipient: string;
  locale: "ar" | "en";
};

export type DeliverQuotationResult =
  | { success: true; data: QuotationDelivery }
  | { success: false; error: { code: string; message: string } };

export class DeliverQuotationUseCase {
  constructor(
    private readonly quotations: IQuotationRepository,
    private readonly deliveries: QuotationDeliveryRepository,
    private readonly documents: QuotationDocumentProvider,
    private readonly gateway: QuotationDeliveryGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: DeliverQuotationInput): Promise<DeliverQuotationResult> {
    if (!isQuotationDeliveryChannel(input.channel)) {
      return { success: false, error: { code: "DELIVERY_CHANNEL_INVALID", message: "Delivery channel is invalid." } };
    }

    const recipient = input.recipient?.trim();
    if (!recipient) {
      return { success: false, error: { code: "DELIVERY_RECIPIENT_REQUIRED", message: "Delivery recipient is required." } };
    }

    if (input.locale !== "ar" && input.locale !== "en") {
      return { success: false, error: { code: "DELIVERY_LOCALE_INVALID", message: "Delivery locale must be ar or en." } };
    }

    const quotation = await this.quotations.findById(input.companyId, input.quotationId);
    if (!quotation) {
      return { success: false, error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." } };
    }

    const attemptedAt = this.now();
    const delivery = new QuotationDelivery({
      id: this.createId(),
      companyId: input.companyId,
      quotationId: input.quotationId,
      channel: input.channel,
      recipient,
      attemptedAt,
    });

    await this.deliveries.create(delivery);

    let documentResult;
    try {
      documentResult = await this.documents.generate({
        companyId: input.companyId,
        quotationId: input.quotationId,
        locale: input.locale,
      });
    } catch {
      delivery.markFailed(
        "DELIVERY_DOCUMENT_PROVIDER_ERROR",
        "Quotation delivery document could not be generated.",
        this.now(),
      );
      await this.deliveries.update(delivery);
      return { success: true, data: delivery };
    }

    if (!documentResult.success) {
      delivery.markFailed(
        `DELIVERY_DOCUMENT_${documentResult.error.code}`,
        "Quotation delivery document could not be generated.",
        this.now(),
      );
      await this.deliveries.update(delivery);
      return { success: true, data: delivery };
    }

    let result;
    try {
      result = await this.gateway.deliver({
        deliveryId: delivery.id,
        providerRequestKey:
          createQuotationDeliveryProviderRequestKey(delivery.id),
        companyId: input.companyId,
        quotationId: input.quotationId,
        channel: input.channel,
        recipient,
        locale: input.locale,
        document: documentResult.data,
      });
    } catch {
      result = {
        success: false as const,
        errorCode: "DELIVERY_PROVIDER_ERROR",
        errorMessage: "Quotation delivery provider failed safely.",
      };
    }
    const completedAt = this.now();

    if (result.success) {
      delivery.markSent(result.providerMessageId ?? null, completedAt);
    } else {
      delivery.markFailed(result.errorCode, result.errorMessage, completedAt);
    }

    await this.deliveries.update(delivery);
    return { success: true, data: delivery };
  }
}
