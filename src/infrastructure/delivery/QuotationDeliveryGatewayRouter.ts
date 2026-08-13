import type {
  QuotationDeliveryGateway,
  QuotationDeliveryGatewayInput,
  QuotationDeliveryGatewayResult,
} from "@/src/application/quotation-delivery";

export class QuotationDeliveryGatewayRouter
  implements QuotationDeliveryGateway {
  constructor(
    private readonly email: QuotationDeliveryGateway,
    private readonly unavailable: QuotationDeliveryGateway,
  ) {}

  deliver(
    input: QuotationDeliveryGatewayInput,
  ): Promise<QuotationDeliveryGatewayResult> {
    return input.channel === "EMAIL"
      ? this.email.deliver(input)
      : this.unavailable.deliver(input);
  }
}
