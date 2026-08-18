import { describe, expect, it } from "vitest";

import { QuotationDeliveryProviderConfiguration } from "../QuotationDeliveryProviderConfiguration";

describe("QuotationDeliveryProviderConfiguration", () => {
  it("reports EMAIL and WHATSAPP unavailable when configuration is absent", () => {
    const report = new QuotationDeliveryProviderConfiguration({})
      .getAvailability();

    expect(report).toEqual({
      EMAIL: { configured: false, provider: null },
      WHATSAPP: {
        configured: false,
        provider: null,
        templates: { arConfigured: false, enConfigured: false },
        locales: { ar: false, en: false },
      },
    });
  });

  it.each([
    [{ RESEND_API_KEY: "key", VOKA_EMAIL_FROM: "sales@example.invalid" }],
    [{ VOKA_EMAIL_PROVIDER: "resend", VOKA_EMAIL_FROM: "sales@example.invalid" }],
    [{ VOKA_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "key" }],
    [{ VOKA_EMAIL_PROVIDER: "other", RESEND_API_KEY: "key", VOKA_EMAIL_FROM: "sales@example.invalid" }],
  ])("requires Resend selection, key, and sender for EMAIL", (environment) => {
    const report = new QuotationDeliveryProviderConfiguration(environment)
      .getAvailability();

    expect(report.EMAIL.configured).toBe(false);
  });

  it("reports EMAIL configured only when all local Resend fields exist", () => {
    const report = new QuotationDeliveryProviderConfiguration({
      VOKA_EMAIL_PROVIDER: " ReSeNd ",
      RESEND_API_KEY: "test-only-key",
      VOKA_EMAIL_FROM: "sales@example.invalid",
    }).getAvailability();

    expect(report.EMAIL).toEqual({ configured: true, provider: "RESEND" });
  });

  it.each([
    [{ META_WHATSAPP_ACCESS_TOKEN: "token", META_WHATSAPP_PHONE_NUMBER_ID: "phone" }],
    [{ VOKA_WHATSAPP_PROVIDER: "meta", META_WHATSAPP_PHONE_NUMBER_ID: "phone" }],
    [{ VOKA_WHATSAPP_PROVIDER: "meta", META_WHATSAPP_ACCESS_TOKEN: "token" }],
    [{ VOKA_WHATSAPP_PROVIDER: "other", META_WHATSAPP_ACCESS_TOKEN: "token", META_WHATSAPP_PHONE_NUMBER_ID: "phone" }],
  ])("requires complete Meta base configuration for WHATSAPP", (environment) => {
    const report = new QuotationDeliveryProviderConfiguration(environment)
      .getAvailability();

    expect(report.WHATSAPP.configured).toBe(false);
  });

  it("reports WHATSAPP configured and template presence without exposing values", () => {
    const environment = {
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "test-only-token",
      META_WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
      META_WHATSAPP_GRAPH_API_VERSION: "v23.0",
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
      META_WHATSAPP_TEMPLATE_EN: "quotation_en",
      META_WHATSAPP_TEMPLATE_LANGUAGE_AR: "ar",
      META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
    };
    const configuration = new QuotationDeliveryProviderConfiguration(environment);
    const report = configuration.getAvailability();
    const serialized = JSON.stringify(report);

    expect(report.WHATSAPP).toEqual({
      configured: true,
      provider: "META",
      templates: { arConfigured: true, enConfigured: true },
      locales: { ar: true, en: true },
    });
    expect(serialized).not.toContain(environment.META_WHATSAPP_ACCESS_TOKEN);
    expect(serialized).not.toContain(environment.META_WHATSAPP_PHONE_NUMBER_ID);
    expect(serialized).not.toContain(environment.META_WHATSAPP_TEMPLATE_AR);
    expect(serialized).not.toContain(environment.META_WHATSAPP_TEMPLATE_EN);
    expect(serialized).not.toContain(environment.META_WHATSAPP_TEMPLATE_LANGUAGE_EN);
  });

  it("keeps locale-specific Meta template selection in infrastructure", () => {
    const configuration = new QuotationDeliveryProviderConfiguration({
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
      META_WHATSAPP_TEMPLATE_EN: "quotation_en",
      META_WHATSAPP_TEMPLATE_LANGUAGE_AR: "ar",
      META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
      META_WHATSAPP_GRAPH_API_VERSION: "v23.0",
    });

    expect(configuration.getWhatsAppTemplate("ar")).toBe("quotation_ar");
    expect(configuration.getWhatsAppTemplate("en")).toBe("quotation_en");
    expect(configuration.getWhatsAppTemplateLanguage("ar")).toBe("ar");
    expect(configuration.getWhatsAppTemplateLanguage("en")).toBe("en_US");
    expect(configuration.getWhatsAppGraphApiVersion()).toBe("v23.0");
  });

  it("requires a valid Graph version and template/language pair per locale", () => {
    const invalidVersion = new QuotationDeliveryProviderConfiguration({
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "token",
      META_WHATSAPP_PHONE_NUMBER_ID: "phone",
      META_WHATSAPP_GRAPH_API_VERSION: "latest",
    }).getAvailability();
    expect(invalidVersion.WHATSAPP.configured).toBe(false);

    const partial = new QuotationDeliveryProviderConfiguration({
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "token",
      META_WHATSAPP_PHONE_NUMBER_ID: "phone",
      META_WHATSAPP_GRAPH_API_VERSION: "v23.0",
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
    }).getAvailability();
    expect(partial.WHATSAPP).toMatchObject({
      configured: true,
      locales: { ar: false, en: false },
    });
  });

  describe("getReadiness()", () => {
    it("reports full email and whatsapp readiness", () => {
      const environment = {
        VOKA_EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_secret_key_123",
        VOKA_EMAIL_FROM: "sales@example.com",
        VOKA_WHATSAPP_PROVIDER: "meta",
        META_WHATSAPP_ACCESS_TOKEN: "meta_secret_token_123",
        META_WHATSAPP_PHONE_NUMBER_ID: "123456789",
        META_WHATSAPP_GRAPH_API_VERSION: "v20.0",
        META_WHATSAPP_TEMPLATE_AR: "quote_template_ar",
        META_WHATSAPP_TEMPLATE_LANGUAGE_AR: "ar",
        META_WHATSAPP_TEMPLATE_EN: "quote_template_en",
        META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
      };

      const readiness = new QuotationDeliveryProviderConfiguration(environment).getReadiness();

      expect(readiness).toEqual({
        email: {
          provider: "RESEND",
          configured: true,
          requirements: {
            providerSelected: true,
            apiKeyConfigured: true,
            senderConfigured: true,
          },
        },
        whatsapp: {
          provider: "META",
          configured: true,
          requirements: {
            providerSelected: true,
            accessTokenConfigured: true,
            phoneNumberIdConfigured: true,
            graphApiVersionConfigured: true,
          },
          locales: {
            ar: {
              templateConfigured: true,
              languageConfigured: true,
              configured: true,
            },
            en: {
              templateConfigured: true,
              languageConfigured: true,
              configured: true,
            },
          },
        },
      });

      const serialized = JSON.stringify(readiness);
      expect(serialized).not.toContain("re_secret_key_123");
      expect(serialized).not.toContain("sales@example.com");
      expect(serialized).not.toContain("meta_secret_token_123");
      expect(serialized).not.toContain("123456789");
      expect(serialized).not.toContain("quote_template_ar");
      expect(serialized).not.toContain("quote_template_en");
    });

    it("handles partial email configuration and missing email provider", () => {
      const partialEmail = new QuotationDeliveryProviderConfiguration({
        VOKA_EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_key",
      }).getReadiness();

      expect(partialEmail.email).toEqual({
        provider: "RESEND",
        configured: false,
        requirements: {
          providerSelected: true,
          apiKeyConfigured: true,
          senderConfigured: false,
        },
      });

      const noEmail = new QuotationDeliveryProviderConfiguration({}).getReadiness();
      expect(noEmail.email).toEqual({
        provider: null,
        configured: false,
        requirements: {
          providerSelected: false,
          apiKeyConfigured: false,
          senderConfigured: false,
        },
      });
    });

    it("handles whatsapp partial configuration: missing token, phone number ID, invalid graph API version", () => {
      const missingToken = new QuotationDeliveryProviderConfiguration({
        VOKA_WHATSAPP_PROVIDER: "meta",
        META_WHATSAPP_PHONE_NUMBER_ID: "12345",
        META_WHATSAPP_GRAPH_API_VERSION: "v20.0",
      }).getReadiness();

      expect(missingToken.whatsapp.requirements).toEqual({
        providerSelected: true,
        accessTokenConfigured: false,
        phoneNumberIdConfigured: true,
        graphApiVersionConfigured: true,
      });
      expect(missingToken.whatsapp.configured).toBe(false);

      const missingPhone = new QuotationDeliveryProviderConfiguration({
        VOKA_WHATSAPP_PROVIDER: "meta",
        META_WHATSAPP_ACCESS_TOKEN: "token",
        META_WHATSAPP_GRAPH_API_VERSION: "v20.0",
      }).getReadiness();

      expect(missingPhone.whatsapp.requirements.phoneNumberIdConfigured).toBe(false);
      expect(missingPhone.whatsapp.configured).toBe(false);

      const invalidGraph = new QuotationDeliveryProviderConfiguration({
        VOKA_WHATSAPP_PROVIDER: "meta",
        META_WHATSAPP_ACCESS_TOKEN: "token",
        META_WHATSAPP_PHONE_NUMBER_ID: "12345",
        META_WHATSAPP_GRAPH_API_VERSION: "invalid_version",
      }).getReadiness();

      expect(invalidGraph.whatsapp.requirements.graphApiVersionConfigured).toBe(false);
      expect(invalidGraph.whatsapp.configured).toBe(false);
    });

    it("handles Arabic template only and English template only", () => {
      const baseMeta = {
        VOKA_WHATSAPP_PROVIDER: "meta",
        META_WHATSAPP_ACCESS_TOKEN: "token",
        META_WHATSAPP_PHONE_NUMBER_ID: "12345",
        META_WHATSAPP_GRAPH_API_VERSION: "v20.0",
      };

      const arOnly = new QuotationDeliveryProviderConfiguration({
        ...baseMeta,
        META_WHATSAPP_TEMPLATE_AR: "template_ar",
        META_WHATSAPP_TEMPLATE_LANGUAGE_AR: "ar",
      }).getReadiness();

      expect(arOnly.whatsapp.configured).toBe(true);
      expect(arOnly.whatsapp.locales.ar).toEqual({
        templateConfigured: true,
        languageConfigured: true,
        configured: true,
      });
      expect(arOnly.whatsapp.locales.en).toEqual({
        templateConfigured: false,
        languageConfigured: false,
        configured: false,
      });

      const enOnly = new QuotationDeliveryProviderConfiguration({
        ...baseMeta,
        META_WHATSAPP_TEMPLATE_EN: "template_en",
        META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
      }).getReadiness();

      expect(enOnly.whatsapp.configured).toBe(true);
      expect(enOnly.whatsapp.locales.ar).toEqual({
        templateConfigured: false,
        languageConfigured: false,
        configured: false,
      });
      expect(enOnly.whatsapp.locales.en).toEqual({
        templateConfigured: true,
        languageConfigured: true,
        configured: true,
      });
    });
  });
});
