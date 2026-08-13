import { describe, expect, it } from "vitest";

import { createQuotationDeliveryProviderRequestKey } from "../createQuotationDeliveryProviderRequestKey";

describe("createQuotationDeliveryProviderRequestKey", () => {
  it("derives the same provider request identity from the same attempt", () => {
    expect(createQuotationDeliveryProviderRequestKey("delivery-123")).toBe(
      "quotation-delivery/delivery-123",
    );
    expect(createQuotationDeliveryProviderRequestKey("delivery-123")).toBe(
      "quotation-delivery/delivery-123",
    );
  });

  it("naturally separates attempts without including customer PII", () => {
    const email = createQuotationDeliveryProviderRequestKey("email-attempt");
    const whatsapp = createQuotationDeliveryProviderRequestKey("whatsapp-attempt");

    expect(email).not.toBe(whatsapp);
    expect(email).not.toContain("customer@example.com");
    expect(whatsapp).not.toContain("+965");
  });
});
