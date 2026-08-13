import { Resend } from "resend";

import type { QuotationDeliveryGateway } from "@/src/application/quotation-delivery";

import {
  QuotationDeliveryProviderConfiguration,
  type QuotationDeliveryProviderEnvironment,
} from "./QuotationDeliveryProviderConfiguration";
import { QuotationDeliveryGatewayRouter } from "./QuotationDeliveryGatewayRouter";
import {
  ResendQuotationDeliveryGateway,
  type ResendEmailTransport,
} from "./resend/ResendQuotationDeliveryGateway";
import { UnavailableQuotationDeliveryGateway } from "./UnavailableQuotationDeliveryGateway";

export function createQuotationDeliveryGateway(
  environment: QuotationDeliveryProviderEnvironment = process.env,
  createResendTransport: (apiKey: string) => ResendEmailTransport =
    (apiKey) => new Resend(apiKey).emails,
): QuotationDeliveryGateway {
  const unavailable = new UnavailableQuotationDeliveryGateway();
  const availability = new QuotationDeliveryProviderConfiguration(environment)
    .getAvailability();
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.VOKA_EMAIL_FROM?.trim();

  if (!availability.EMAIL.configured || !apiKey || !from) {
    return new QuotationDeliveryGatewayRouter(unavailable, unavailable);
  }

  return new QuotationDeliveryGatewayRouter(
    new ResendQuotationDeliveryGateway(
      createResendTransport(apiKey),
      from,
    ),
    unavailable,
  );
}
