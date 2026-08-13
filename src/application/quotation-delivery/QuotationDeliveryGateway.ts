import type { QuotationDeliveryChannel } from "@/src/domain/quotation-delivery";

export type QuotationDeliveryGatewayInput = {
  companyId: string;
  quotationId: string;
  channel: QuotationDeliveryChannel;
  recipient: string;
  locale: "ar" | "en";
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
