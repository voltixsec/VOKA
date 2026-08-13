import type { QuotationDeliveryChannel } from "@/src/domain/quotation-delivery";
import type { QuotationDocument } from "@/src/application/document";

export type QuotationDeliveryGatewayInput = {
  deliveryId: string;
  providerRequestKey: string;
  companyId: string;
  quotationId: string;
  channel: QuotationDeliveryChannel;
  recipient: string;
  locale: "ar" | "en";
  document: QuotationDocument;
};

export type QuotationDeliveryGatewayResult =
  | {
      success: true;
      providerMessageId?: string | null;
    }
  | {
      success: false;
      errorCode: string;
      errorMessage: string;
    };

export interface QuotationDeliveryGateway {
  deliver(
    input: QuotationDeliveryGatewayInput,
  ): Promise<QuotationDeliveryGatewayResult>;
}
