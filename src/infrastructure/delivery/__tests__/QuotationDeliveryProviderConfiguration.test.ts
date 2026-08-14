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
});
