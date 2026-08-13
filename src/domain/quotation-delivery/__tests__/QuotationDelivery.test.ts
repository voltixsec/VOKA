import { describe, expect, it } from "vitest";

import { QuotationDelivery } from "../QuotationDelivery";

function attempt(channel: "EMAIL" | "WHATSAPP" = "EMAIL") {
  return new QuotationDelivery({
    id: `delivery-${channel}`,
    companyId: "company-1",
    quotationId: "quotation-1",
    channel,
    recipient: channel === "EMAIL" ? "customer@example.com" : "+96590000000",
    attemptedAt: new Date("2026-08-14T10:00:00.000Z"),
  });
}

describe("QuotationDelivery", () => {
  it.each(["EMAIL", "WHATSAPP"] as const)("accepts %s attempts", (channel) => {
    expect(attempt(channel).channel).toBe(channel);
  });

  it("transitions PENDING to SENT without changing the historical recipient", () => {
    const delivery = attempt();
    delivery.markSent("provider-1", new Date("2026-08-14T10:01:00.000Z"));

    expect(delivery.status).toBe("SENT");
    expect(delivery.recipient).toBe("customer@example.com");
    expect(delivery.providerMessageId).toBe("provider-1");
  });

  it("transitions PENDING to FAILED without changing the historical recipient", () => {
    const delivery = attempt("WHATSAPP");
    delivery.markFailed(
      "DELIVERY_PROVIDER_NOT_CONFIGURED",
      "Quotation delivery provider is not configured.",
      new Date("2026-08-14T10:01:00.000Z"),
    );

    expect(delivery.status).toBe("FAILED");
    expect(delivery.recipient).toBe("+96590000000");
    expect(delivery.errorCode).toBe("DELIVERY_PROVIDER_NOT_CONFIGURED");
  });
});
