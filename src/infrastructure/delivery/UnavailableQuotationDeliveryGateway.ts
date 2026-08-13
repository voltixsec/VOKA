import type {
  QuotationDeliveryGateway,
  QuotationDeliveryGatewayInput,
  QuotationDeliveryGatewayResult,
} from "@/src/application/quotation-delivery";

export class UnavailableQuotationDeliveryGateway
  implements QuotationDeliveryGateway {
  deliver(
    _input: QuotationDeliveryGatewayInput,
  ): Promise<QuotationDeliveryGatewayResult> {
    return Promise.resolve({
      success: false,
      errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
      errorMessage: "Quotation delivery provider is not configured.",
    });
  }
}
