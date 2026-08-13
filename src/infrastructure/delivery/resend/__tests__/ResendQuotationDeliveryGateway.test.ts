import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuotationDeliveryGatewayInput } from "@/src/application/quotation-delivery";

import {
  ResendQuotationDeliveryGateway,
  type ResendEmailTransport,
} from "../ResendQuotationDeliveryGateway";

const transport: ResendEmailTransport = {
  send: vi.fn(),
};

function input(locale: "ar" | "en" = "en"): QuotationDeliveryGatewayInput {
  return {
    deliveryId: "delivery-1",
    providerRequestKey: "quotation-delivery/delivery-1",
    companyId: "company-1",
    quotationId: "quotation-1",
    channel: "EMAIL",
    recipient: "customer@example.com",
    locale,
    document: {
      filename: "quotation-Q-001.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
    },
  };
}

describe("ResendQuotationDeliveryGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transport.send).mockResolvedValue({
      data: { id: "resend-email-1" },
      error: null,
    });
  });

  it("maps the neutral email, PDF, and idempotency contract to single send", async () => {
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "VOKA Sales <sales@example.invalid>",
    );

    const result = await gateway.deliver(input());

    expect(transport.send).toHaveBeenCalledOnce();
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "VOKA Sales <sales@example.invalid>",
        to: "customer@example.com",
        attachments: [{
          filename: "quotation-Q-001.pdf",
          content: Buffer.from([37, 80, 68, 70]),
          contentType: "application/pdf",
        }],
      }),
      { idempotencyKey: "quotation-delivery/delivery-1" },
    );
    expect(result).toEqual({
      success: true,
      providerMessageId: "resend-email-1",
    });
  });

  it.each([
    ["en", "Your quotation", "Hello,", "Please find attached"],
    ["ar", "عرض السعر الخاص بكم", "مرحبًا،", "يرجى الاطلاع"],
  ] as const)("generates safe %s HTML and text", async (
    locale,
    subject,
    greeting,
    phrase,
  ) => {
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "sales@example.invalid",
    );

    await gateway.deliver(input(locale));

    const payload = vi.mocked(transport.send).mock.calls[0][0];
    expect(payload.subject).toBe(subject);
    expect(payload.text).toContain(greeting);
    expect(payload.text).toContain(phrase);
    expect(payload.html).toContain(greeting);
    expect(payload.html).toContain(phrase);
    expect(payload.html).not.toContain("customer@example.com");
  });

  it.each([
    ["invalid_api_key", "DELIVERY_EMAIL_AUTH_FAILED"],
    ["validation_error", "DELIVERY_EMAIL_INVALID_REQUEST"],
    ["invalid_attachment", "DELIVERY_EMAIL_INVALID_REQUEST"],
    ["rate_limit_exceeded", "DELIVERY_EMAIL_RATE_LIMITED"],
    ["invalid_idempotent_request", "DELIVERY_EMAIL_IDEMPOTENCY_CONFLICT"],
    ["concurrent_idempotent_requests", "DELIVERY_EMAIL_IDEMPOTENCY_CONFLICT"],
    ["security_error", "DELIVERY_EMAIL_PROVIDER_REJECTED"],
    ["internal_server_error", "DELIVERY_EMAIL_PROVIDER_ERROR"],
  ])("maps %s without exposing raw provider details", async (name, code) => {
    vi.mocked(transport.send).mockResolvedValue({
      data: null,
      error: {
        name,
        message: "Authorization: Bearer re_secret raw provider detail",
        statusCode: 400,
      },
    });
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "sales@example.invalid",
    );

    const result = await gateway.deliver(input());

    expect(result).toMatchObject({ success: false, errorCode: code });
    expect(JSON.stringify(result)).not.toContain("re_secret");
    expect(JSON.stringify(result)).not.toContain("Authorization");
  });

  it("sanitizes unexpected thrown provider errors", async () => {
    vi.mocked(transport.send).mockRejectedValue(
      new Error("Authorization: Bearer re_secret"),
    );
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "sales@example.invalid",
    );

    await expect(gateway.deliver(input())).resolves.toEqual({
      success: false,
      errorCode: "DELIVERY_EMAIL_PROVIDER_ERROR",
      errorMessage: "Email provider failed safely.",
    });
  });

  it("rejects an oversized attachment without truncation or a provider call", async () => {
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "sales@example.invalid",
    );

    const result = await gateway.deliver({
      ...input(),
      document: {
        ...input().document,
        bytes: new Uint8Array(30 * 1024 * 1024 + 1),
      },
    });

    expect(result).toEqual({
      success: false,
      errorCode: "DELIVERY_EMAIL_INVALID_REQUEST",
      errorMessage: "Quotation PDF exceeds the email provider size limit.",
    });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("keeps WHATSAPP unavailable without calling Resend", async () => {
    const gateway = new ResendQuotationDeliveryGateway(
      transport,
      "sales@example.invalid",
    );

    const result = await gateway.deliver({ ...input(), channel: "WHATSAPP" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    });
    expect(transport.send).not.toHaveBeenCalled();
  });
});
