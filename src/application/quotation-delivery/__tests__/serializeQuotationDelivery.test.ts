import { describe, expect, it } from "vitest";

import { QuotationDelivery } from "@/src/domain/quotation-delivery";

import { serializeQuotationDelivery } from "../serializeQuotationDelivery";

describe("serializeQuotationDelivery", () => {
  it("contains historical delivery fields but no document, request key, or credentials", () => {
    const delivery = new QuotationDelivery({
      id: "delivery-1",
      companyId: "company-1",
      quotationId: "quotation-1",
      channel: "EMAIL",
      recipient: "customer@example.com",
      attemptedAt: new Date("2026-08-14T10:00:00.000Z"),
    });
    const serialized = serializeQuotationDelivery(delivery);

    expect(serialized).toMatchObject({
      id: "delivery-1",
      quotationId: "quotation-1",
      channel: "EMAIL",
      recipient: "customer@example.com",
      status: "PENDING",
    });
    expect(serialized).not.toHaveProperty("companyId");
    expect(serialized).not.toHaveProperty("document");
    expect(serialized).not.toHaveProperty("bytes");
    expect(serialized).not.toHaveProperty("providerRequestKey");
    expect(serialized).not.toHaveProperty("apiKey");
    expect(serialized).not.toHaveProperty("accessToken");
  });
});
