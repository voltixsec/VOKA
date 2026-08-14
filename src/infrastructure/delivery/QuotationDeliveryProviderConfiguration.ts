export type QuotationDeliveryProviderEnvironment = {
  [name: string]: string | undefined;
  VOKA_EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  VOKA_EMAIL_FROM?: string;
  VOKA_WHATSAPP_PROVIDER?: string;
  META_WHATSAPP_ACCESS_TOKEN?: string;
  META_WHATSAPP_PHONE_NUMBER_ID?: string;
  META_WHATSAPP_GRAPH_API_VERSION?: string;
  META_WHATSAPP_TEMPLATE_AR?: string;
  META_WHATSAPP_TEMPLATE_EN?: string;
  META_WHATSAPP_TEMPLATE_LANGUAGE_AR?: string;
  META_WHATSAPP_TEMPLATE_LANGUAGE_EN?: string;
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
    locales: {
      ar: boolean;
      en: boolean;
    };
  };
};

function value(input: string | undefined): string | null {
  return input?.trim() || null;
}

function graphApiVersion(input: string | undefined): string | null {
  const normalized = value(input);
  return normalized && /^v\d+\.\d+$/.test(normalized)
    ? normalized
    : null;
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
    const whatsappBaseConfigured = Boolean(
      whatsappProvider &&
      value(this.environment.META_WHATSAPP_ACCESS_TOKEN) &&
      value(this.environment.META_WHATSAPP_PHONE_NUMBER_ID) &&
      graphApiVersion(this.environment.META_WHATSAPP_GRAPH_API_VERSION),
    );
    const arConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_AR) &&
      value(this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_AR),
    );
    const enConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_EN) &&
      value(this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_EN),
    );

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
        configured: whatsappBaseConfigured,
        templates: {
          arConfigured,
          enConfigured,
        },
        locales: {
          ar: whatsappBaseConfigured && arConfigured,
          en: whatsappBaseConfigured && enConfigured,
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

  getWhatsAppTemplateLanguage(locale: "ar" | "en"): string | null {
    return value(
      locale === "ar"
        ? this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_AR
        : this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_EN,
    );
  }

  getWhatsAppGraphApiVersion(): string | null {
    return graphApiVersion(this.environment.META_WHATSAPP_GRAPH_API_VERSION);
  }
}
