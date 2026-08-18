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

export type QuotationDeliveryReadiness = {
  email: {
    provider: "RESEND" | null;
    configured: boolean;
    requirements: {
      providerSelected: boolean;
      apiKeyConfigured: boolean;
      senderConfigured: boolean;
    };
  };
  whatsapp: {
    provider: "META" | null;
    configured: boolean;
    requirements: {
      providerSelected: boolean;
      accessTokenConfigured: boolean;
      phoneNumberIdConfigured: boolean;
      graphApiVersionConfigured: boolean;
    };
    locales: {
      ar: {
        templateConfigured: boolean;
        languageConfigured: boolean;
        configured: boolean;
      };
      en: {
        templateConfigured: boolean;
        languageConfigured: boolean;
        configured: boolean;
      };
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

  getReadiness(): QuotationDeliveryReadiness {
    const emailProvider =
      value(this.environment.VOKA_EMAIL_PROVIDER)?.toLowerCase() === "resend"
        ? "RESEND"
        : null;
    const emailProviderSelected = emailProvider === "RESEND";
    const apiKeyConfigured = Boolean(value(this.environment.RESEND_API_KEY));
    const senderConfigured = Boolean(value(this.environment.VOKA_EMAIL_FROM));
    const emailConfigured =
      emailProviderSelected && apiKeyConfigured && senderConfigured;

    const whatsappProvider =
      value(this.environment.VOKA_WHATSAPP_PROVIDER)?.toLowerCase() === "meta"
        ? "META"
        : null;
    const whatsappProviderSelected = whatsappProvider === "META";
    const accessTokenConfigured = Boolean(
      value(this.environment.META_WHATSAPP_ACCESS_TOKEN),
    );
    const phoneNumberIdConfigured = Boolean(
      value(this.environment.META_WHATSAPP_PHONE_NUMBER_ID),
    );
    const graphApiVersionConfigured = Boolean(
      graphApiVersion(this.environment.META_WHATSAPP_GRAPH_API_VERSION),
    );
    const whatsappBaseConfigured =
      whatsappProviderSelected &&
      accessTokenConfigured &&
      phoneNumberIdConfigured &&
      graphApiVersionConfigured;

    const arTemplateConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_AR),
    );
    const arLanguageConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_AR),
    );
    const arConfigured =
      whatsappBaseConfigured && arTemplateConfigured && arLanguageConfigured;

    const enTemplateConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_EN),
    );
    const enLanguageConfigured = Boolean(
      value(this.environment.META_WHATSAPP_TEMPLATE_LANGUAGE_EN),
    );
    const enConfigured =
      whatsappBaseConfigured && enTemplateConfigured && enLanguageConfigured;

    return {
      email: {
        provider: emailProvider,
        configured: emailConfigured,
        requirements: {
          providerSelected: emailProviderSelected,
          apiKeyConfigured,
          senderConfigured,
        },
      },
      whatsapp: {
        provider: whatsappProvider,
        configured: whatsappBaseConfigured,
        requirements: {
          providerSelected: whatsappProviderSelected,
          accessTokenConfigured,
          phoneNumberIdConfigured,
          graphApiVersionConfigured,
        },
        locales: {
          ar: {
            templateConfigured: arTemplateConfigured,
            languageConfigured: arLanguageConfigured,
            configured: arConfigured,
          },
          en: {
            templateConfigured: enTemplateConfigured,
            languageConfigured: enLanguageConfigured,
            configured: enConfigured,
          },
        },
      },
    };
  }

  getAvailability(): QuotationDeliveryProviderAvailability {
    const readiness = this.getReadiness();
    return {
      EMAIL: {
        provider: readiness.email.provider,
        configured: readiness.email.configured,
      },
      WHATSAPP: {
        provider: readiness.whatsapp.provider,
        configured: readiness.whatsapp.configured,
        templates: {
          arConfigured:
            readiness.whatsapp.locales.ar.templateConfigured &&
            readiness.whatsapp.locales.ar.languageConfigured,
          enConfigured:
            readiness.whatsapp.locales.en.templateConfigured &&
            readiness.whatsapp.locales.en.languageConfigured,
        },
        locales: {
          ar: readiness.whatsapp.locales.ar.configured,
          en: readiness.whatsapp.locales.en.configured,
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
