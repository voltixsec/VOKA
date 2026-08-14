import type {
  QuotationDeliveryGateway,
  QuotationDeliveryGatewayInput,
  QuotationDeliveryGatewayResult,
} from "@/src/application/quotation-delivery";

export class QuotationDeliveryGatewayRouter
  implements QuotationDeliveryGateway {
  constructor(
    private readonly email: QuotationDeliveryGateway,
    private readonly whatsapp: QuotationDeliveryGateway,
    private readonly unavailable: QuotationDeliveryGateway,
  ) {}

  deliver(
    input: QuotationDeliveryGatewayInput,
  ): Promise<QuotationDeliveryGatewayResult> {
    if (input.channel === "EMAIL") return this.email.deliver(input);
    if (input.channel === "WHATSAPP") return this.whatsapp.deliver(input);
    return this.unavailable.deliver(input);
  }
}
