import { describe, expect, it, vi } from "vitest";

import type { QuotationDeliveryGatewayInput } from "@/src/application/quotation-delivery";

import { createQuotationDeliveryGateway } from "../createQuotationDeliveryGateway";

const input: QuotationDeliveryGatewayInput = {
  deliveryId: "delivery-1",
  providerRequestKey: "quotation-delivery/delivery-1",
  companyId: "company-1",
  quotationId: "quotation-1",
  channel: "EMAIL",
  recipient: "customer@example.com",
  locale: "en",
  document: {
    filename: "quotation-Q-001.pdf",
    contentType: "application/pdf",
    bytes: new Uint8Array([37, 80, 68, 70]),
  },
};

describe("createQuotationDeliveryGateway", () => {
  it("routes configured EMAIL to an injected Resend transport", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "resend-1" },
      error: null,
    });
    const createTransport = vi.fn(() => ({ send }));
    const gateway = createQuotationDeliveryGateway({
      VOKA_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "test-only-key",
      VOKA_EMAIL_FROM: "sales@example.invalid",
    }, createTransport);

    const result = await gateway.deliver(input);

    expect(createTransport).toHaveBeenCalledWith("test-only-key");
    expect(send).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, providerMessageId: "resend-1" });
  });

  it.each([
    [{ VOKA_EMAIL_PROVIDER: "resend", VOKA_EMAIL_FROM: "sales@example.invalid" }],
    [{ VOKA_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "key" }],
    [{ VOKA_EMAIL_PROVIDER: "other", RESEND_API_KEY: "key", VOKA_EMAIL_FROM: "sales@example.invalid" }],
  ])("keeps EMAIL unavailable for incomplete or wrong configuration", async (environment) => {
    const createTransport = vi.fn();
    const gateway = createQuotationDeliveryGateway(environment, createTransport);

    const result = await gateway.deliver(input);

    expect(result).toMatchObject({
      success: false,
      errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("routes fully configured WHATSAPP independently of email", async () => {
    const send = vi.fn();
    const uploadDocument = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { id: "media-1" } });
    const sendTemplate = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { messages: [{ id: "wamid.1" }] } });
    const createMetaTransport = vi.fn(() => ({ uploadDocument, sendTemplate }));
    const gateway = createQuotationDeliveryGateway({
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "test-token",
      META_WHATSAPP_PHONE_NUMBER_ID: "test-phone",
      META_WHATSAPP_GRAPH_API_VERSION: "v23.0",
      META_WHATSAPP_TEMPLATE_EN: "quotation_en",
      META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
    }, () => ({ send }), createMetaTransport);

    const result = await gateway.deliver({
      ...input,
      channel: "WHATSAPP",
      recipient: "96590000000",
    });

    expect(createMetaTransport).toHaveBeenCalledWith({
      accessToken: "test-token",
      phoneNumberId: "test-phone",
      graphApiVersion: "v23.0",
    });
    expect(result).toEqual({ success: true, providerMessageId: "wamid.1" });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps WHATSAPP unavailable when its selected locale lacks a language/template pair", async () => {
    const createMetaTransport = vi.fn();
    const gateway = createQuotationDeliveryGateway({
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "test-token",
      META_WHATSAPP_PHONE_NUMBER_ID: "test-phone",
      META_WHATSAPP_GRAPH_API_VERSION: "v23.0",
      META_WHATSAPP_TEMPLATE_AR: "quotation_ar",
    }, vi.fn(), createMetaTransport);

    expect(await gateway.deliver({ ...input, channel: "WHATSAPP" })).toMatchObject({
      success: false,
      errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    });
    expect(createMetaTransport).not.toHaveBeenCalled();
  });
});
