import { describe, expect, it, vi } from "vitest";

import { UnavailableQuotationDeliveryGateway } from "../UnavailableQuotationDeliveryGateway";
import { QuotationDeliveryProviderConfiguration } from "../QuotationDeliveryProviderConfiguration";

describe("UnavailableQuotationDeliveryGateway production safety", () => {
  it.each(["EMAIL", "WHATSAPP"] as const)(
    "never reports fake success for %s",
    async (channel) => {
      const network = vi.spyOn(globalThis, "fetch");
      const gateway = new UnavailableQuotationDeliveryGateway();

      const result = await gateway.deliver({
        deliveryId: `delivery-${channel}`,
        providerRequestKey: `quotation-delivery/delivery-${channel}`,
        companyId: "company-1",
        quotationId: "quotation-1",
        channel,
        recipient: channel === "EMAIL"
          ? "customer@example.com"
          : "+96590000000",
        locale: "en",
        document: {
          filename: "quotation-Q-001.pdf",
          contentType: "application/pdf",
          bytes: new Uint8Array([37, 80, 68, 70]),
        },
      });

      expect(result).toEqual({
        success: false,
        errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Quotation delivery provider is not configured.",
      });
      expect(network).not.toHaveBeenCalled();
      network.mockRestore();
    },
  );

  it("remains unavailable even when future provider environment looks configured", async () => {
    const availability = new QuotationDeliveryProviderConfiguration({
      VOKA_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "test-only-key",
      VOKA_EMAIL_FROM: "sales@example.invalid",
    }).getAvailability();
    const gateway = new UnavailableQuotationDeliveryGateway();

    expect(availability.EMAIL.configured).toBe(true);
    await expect(gateway.deliver({
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
    })).resolves.toMatchObject({
      success: false,
      errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    });
  });
});
