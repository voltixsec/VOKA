export type QuotationDeliveryProviderEnvironment = {
  [name: string]: string | undefined;
  VOKA_EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  VOKA_EMAIL_FROM?: string;
  VOKA_WHATSAPP_PROVIDER?: string;
  META_WHATSAPP_ACCESS_TOKEN?: string;
  META_WHATSAPP_PHONE_NUMBER_ID?: string;
  META_WHATSAPP_TEMPLATE_AR?: string;
  META_WHATSAPP_TEMPLATE_EN?: string;
};

export type QuotationDeliveryProviderAvailability = {
  EMAIL: {
    configured: boolean;
    provider: "RESEND" | null;
  };
  WHATSAPP: {
    configured: boolean;
    provider: "META" | null;
    templates: {
      arConfigured: boolean;
      enConfigured: boolean;
    };
  };
};

function value(input: string | undefined): string | null {
  return input?.trim() || null;
}

export class QuotationDeliveryProviderConfiguration {
  constructor(
    private readonly environment: QuotationDeliveryProviderEnvironment =
      process.env,
  ) {}

  getAvailability(): QuotationDeliveryProviderAvailability {
    const emailProvider =
      value(this.environment.VOKA_EMAIL_PROVIDER)?.toLowerCase() === "resend"
        ? "RESEND"
        : null;
    const whatsappProvider =
      value(this.environment.VOKA_WHATSAPP_PROVIDER)?.toLowerCase() === "meta"
        ? "META"
        : null;

    return {
      EMAIL: {
        provider: emailProvider,
        configured: Boolean(
          emailProvider &&
          value(this.environment.RESEND_API_KEY) &&
          value(this.environment.VOKA_EMAIL_FROM),
        ),
      },
      WHATSAPP: {
        provider: whatsappProvider,
        configured: Boolean(
          whatsappProvider &&
          value(this.environment.META_WHATSAPP_ACCESS_TOKEN) &&
          value(this.environment.META_WHATSAPP_PHONE_NUMBER_ID),
        ),
        templates: {
          arConfigured: Boolean(
            value(this.environment.META_WHATSAPP_TEMPLATE_AR),
          ),
          enConfigured: Boolean(
            value(this.environment.META_WHATSAPP_TEMPLATE_EN),
          ),
        },
      },
    };
  }

  getWhatsAppTemplate(locale: "ar" | "en"): string | null {
    return value(
      locale === "ar"
        ? this.environment.META_WHATSAPP_TEMPLATE_AR
        : this.environment.META_WHATSAPP_TEMPLATE_EN,
    );
  }
}
