import { describe, expect, it, vi } from "vitest";

import type { QuotationDeliveryGatewayInput } from "@/src/application/quotation-delivery";
import type { MetaWhatsAppTransport } from "../MetaWhatsAppCloudTransport";
import { MetaWhatsAppQuotationDeliveryGateway } from "../MetaWhatsAppQuotationDeliveryGateway";

const input: QuotationDeliveryGatewayInput = {
  deliveryId: "delivery-1",
  providerRequestKey: "quotation-delivery/delivery-1",
  companyId: "company-1",
  quotationId: "quotation-1",
  channel: "WHATSAPP",
  recipient: "96590000000",
  locale: "en",
  document: {
    filename: "quotation-Q-001.pdf",
    contentType: "application/pdf",
    bytes: new Uint8Array([37, 80, 68, 70]),
  },
};

function setup() {
  const uploadDocument = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { id: "media-1" } });
  const sendTemplate = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { messages: [{ id: "wamid.1" }] } });
  const transport: MetaWhatsAppTransport = { uploadDocument, sendTemplate };
  const gateway = new MetaWhatsAppQuotationDeliveryGateway(transport, {
    ar: { templateName: "quotation_ar", languageCode: "ar" },
    en: { templateName: "quotation_en", languageCode: "en_US" },
  });
  return { gateway, uploadDocument, sendTemplate };
}

describe("MetaWhatsAppQuotationDeliveryGateway", () => {
  it.each([
    ["ar", "quotation_ar", "ar"],
    ["en", "quotation_en", "en_US"],
  ] as const)("uploads before sending the %s template and returns wamid", async (locale, templateName, languageCode) => {
    const { gateway, uploadDocument, sendTemplate } = setup();
    const result = await gateway.deliver({ ...input, locale });

    expect(result).toEqual({ success: true, providerMessageId: "wamid.1" });
    expect(uploadDocument).toHaveBeenCalledWith(input.document);
    expect(sendTemplate).toHaveBeenCalledWith({
      recipient: input.recipient,
      templateName,
      languageCode,
      mediaId: "media-1",
      filename: input.document.filename,
    });
    expect(uploadDocument.mock.invocationCallOrder[0]).toBeLessThan(sendTemplate.mock.invocationCallOrder[0]);
    expect(sendTemplate.mock.calls.flat()).not.toContain(input.providerRequestKey);
  });

  it("does not send when media upload fails", async () => {
    const { gateway, uploadDocument, sendTemplate } = setup();
    uploadDocument.mockResolvedValue({ ok: false, status: 500, data: { error: { message: "secret raw body" } } });

    const result = await gateway.deliver(input);

    expect(result).toEqual({
      success: false,
      errorCode: "DELIVERY_WHATSAPP_MEDIA_UPLOAD_FAILED",
      errorMessage: "WhatsApp could not accept the quotation document.",
    });
    expect(JSON.stringify(result)).not.toContain("secret raw body");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it.each([
    [401, null, "DELIVERY_WHATSAPP_AUTH_FAILED"],
    [429, null, "DELIVERY_WHATSAPP_RATE_LIMITED"],
    [400, null, "DELIVERY_WHATSAPP_INVALID_REQUEST"],
    [500, 190, "DELIVERY_WHATSAPP_AUTH_FAILED"],
  ])("maps provider failure status %s safely", async (status, code, expected) => {
    const { gateway, sendTemplate } = setup();
    sendTemplate.mockResolvedValue({ ok: false, status, data: { error: { code, message: "raw secret" } } });
    const result = await gateway.deliver(input);
    expect(result).toMatchObject({ success: false, errorCode: expected });
    expect(JSON.stringify(result)).not.toContain("raw secret");
  });

  it("requires IDs from both successful provider responses", async () => {
    const { gateway, uploadDocument, sendTemplate } = setup();
    uploadDocument.mockResolvedValue({ ok: true, status: 200, data: {} });
    expect(await gateway.deliver(input)).toMatchObject({ errorCode: "DELIVERY_WHATSAPP_MEDIA_UPLOAD_FAILED" });
    expect(sendTemplate).not.toHaveBeenCalled();

    uploadDocument.mockResolvedValue({ ok: true, status: 200, data: { id: "media-1" } });
    sendTemplate.mockResolvedValue({ ok: true, status: 200, data: {} });
    expect(await gateway.deliver(input)).toMatchObject({ errorCode: "DELIVERY_WHATSAPP_PROVIDER_ERROR" });
  });

  it("maps a thrown network error without exposing its message", async () => {
    const { gateway, uploadDocument } = setup();
    uploadDocument.mockRejectedValue(new Error("network secret details"));
    const result = await gateway.deliver(input);
    expect(result).toMatchObject({
      success: false,
      errorCode: "DELIVERY_WHATSAPP_PROVIDER_ERROR",
    });
    expect(JSON.stringify(result)).not.toContain("network secret details");
  });

  it("rejects missing locale configuration and oversized documents before network I/O", async () => {
    const { uploadDocument, sendTemplate } = setup();
    const gateway = new MetaWhatsAppQuotationDeliveryGateway(
      { uploadDocument, sendTemplate },
      { en: { templateName: "quotation_en", languageCode: "en_US" } },
      3,
    );
    expect(await gateway.deliver({ ...input, locale: "ar" })).toMatchObject({ errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED" });
    expect(await gateway.deliver(input)).toMatchObject({ errorCode: "DELIVERY_WHATSAPP_DOCUMENT_TOO_LARGE" });
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
