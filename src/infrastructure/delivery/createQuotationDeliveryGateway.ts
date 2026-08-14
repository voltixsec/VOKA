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
import { MetaWhatsAppCloudTransport, type MetaWhatsAppTransport } from "./meta/MetaWhatsAppCloudTransport";
import { MetaWhatsAppQuotationDeliveryGateway } from "./meta/MetaWhatsAppQuotationDeliveryGateway";

export function createQuotationDeliveryGateway(
  environment: QuotationDeliveryProviderEnvironment = process.env,
  createResendTransport: (apiKey: string) => ResendEmailTransport =
    (apiKey) => new Resend(apiKey).emails,
  createMetaTransport: (configuration: {
    accessToken: string;
    phoneNumberId: string;
    graphApiVersion: string;
  }) => MetaWhatsAppTransport = (configuration) => new MetaWhatsAppCloudTransport(configuration),
): QuotationDeliveryGateway {
  const unavailable = new UnavailableQuotationDeliveryGateway();
  const configuration = new QuotationDeliveryProviderConfiguration(environment);
  const availability = configuration.getAvailability();
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.VOKA_EMAIL_FROM?.trim();

  const email = availability.EMAIL.configured && apiKey && from
    ? new ResendQuotationDeliveryGateway(
      createResendTransport(apiKey),
      from,
    )
    : unavailable;

  const accessToken = environment.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = environment.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const graphApiVersion = configuration.getWhatsAppGraphApiVersion();
  const localeConfiguration: Partial<Record<"ar" | "en", {
    templateName: string;
    languageCode: string;
  }>> = {};
  for (const locale of ["ar", "en"] as const) {
    const templateName = configuration.getWhatsAppTemplate(locale);
    const languageCode = configuration.getWhatsAppTemplateLanguage(locale);
    if (availability.WHATSAPP.locales[locale] && templateName && languageCode) {
      localeConfiguration[locale] = { templateName, languageCode };
    }
  }
  const whatsapp = availability.WHATSAPP.configured && accessToken && phoneNumberId && graphApiVersion &&
      (localeConfiguration.ar || localeConfiguration.en)
    ? new MetaWhatsAppQuotationDeliveryGateway(
      createMetaTransport({ accessToken, phoneNumberId, graphApiVersion }),
      localeConfiguration,
    )
    : unavailable;

  return new QuotationDeliveryGatewayRouter(email, whatsapp, unavailable);
}
