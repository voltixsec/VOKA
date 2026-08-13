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
  ])("requires Meta selection, token, and phone ID for WHATSAPP", (environment) => {
    const report = new QuotationDeliveryProviderConfiguration(environment)
      .getAvailability();

    expect(report.WHATSAPP.configured).toBe(false);
  });

  it("reports WHATSAPP configured and template presence without exposing values", () => {
    const environment = {
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "test-only-token",
      META_WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
      META_WHATSAPP_TEMPLATE_EN: "quotation_en",
    };
    const configuration = new QuotationDeliveryProviderConfiguration(environment);
    const report = configuration.getAvailability();
    const serialized = JSON.stringify(report);

    expect(report.WHATSAPP).toEqual({
      configured: true,
      provider: "META",
      templates: { arConfigured: true, enConfigured: true },
    });
    expect(serialized).not.toContain(environment.META_WHATSAPP_ACCESS_TOKEN);
    expect(serialized).not.toContain(environment.META_WHATSAPP_PHONE_NUMBER_ID);
    expect(serialized).not.toContain(environment.META_WHATSAPP_TEMPLATE_AR);
    expect(serialized).not.toContain(environment.META_WHATSAPP_TEMPLATE_EN);
  });

  it("keeps locale-specific Meta template selection in infrastructure", () => {
    const configuration = new QuotationDeliveryProviderConfiguration({
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
      META_WHATSAPP_TEMPLATE_EN: "quotation_en",
    });

    expect(configuration.getWhatsAppTemplate("ar")).toBe("quotation_ar");
    expect(configuration.getWhatsAppTemplate("en")).toBe("quotation_en");
  });
});
