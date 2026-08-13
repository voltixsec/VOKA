import { describe, expect, it, vi } from "vitest";

import type { IQuotationRepository } from "@/src/application/quotation";
import { Quotation } from "@/src/domain/quotation";
import type { QuotationDelivery } from "@/src/domain/quotation-delivery";

import { DeliverQuotationUseCase } from "../DeliverQuotationUseCase";
import type { QuotationDeliveryGateway } from "../QuotationDeliveryGateway";
import type { QuotationDeliveryRepository } from "../QuotationDeliveryRepository";

function quotation() {
  return new Quotation({
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: { name: "Customer" },
    lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
  });
}

function quotationRepository(value: Quotation | null): IQuotationRepository {
  return {
    existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(value),
    findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn(),
    completeLocalization: vi.fn(), failLocalization: vi.fn(),
  };
}

function deliveryRepository() {
  const values: QuotationDelivery[] = [];
  const repository: QuotationDeliveryRepository = {
    create: vi.fn(async (value) => { values.push(value); }),
    update: vi.fn(async () => undefined),
    findHistory: vi.fn(async () => values),
  };
  return { values, repository };
}

function useCase(options?: {
  quotation?: Quotation | null;
  gateway?: QuotationDeliveryGateway;
}) {
  const quotations = quotationRepository(
    options && "quotation" in options ? options.quotation ?? null : quotation(),
  );
  const deliveries = deliveryRepository();
  const gateway = options?.gateway ?? {
    deliver: vi.fn().mockResolvedValue({ success: true, providerMessageId: "provider-1" }),
  };
  const execute = new DeliverQuotationUseCase(
    quotations,
    deliveries.repository,
    gateway,
    () => new Date("2026-08-14T10:00:00.000Z"),
    () => `delivery-${deliveries.values.length + 1}`,
  );
  return { execute, quotations, deliveries, gateway };
}

describe("DeliverQuotationUseCase", () => {
  it.each([
    ["EMAIL", "customer@example.com"],
    ["WHATSAPP", "+96590000000"],
  ] as const)("creates and sends a tenant-scoped %s attempt", async (channel, recipient) => {
    const context = useCase();
    const result = await context.execute.execute({
      companyId: "company-1", quotationId: "quotation-1", channel, recipient, locale: "en",
    });

    expect(context.quotations.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(result.success).toBe(true);
    expect(context.deliveries.values[0]).toMatchObject({ channel, recipient, status: "SENT" });
    expect(context.deliveries.repository.create).toHaveBeenCalledOnce();
    expect(context.deliveries.repository.update).toHaveBeenCalledOnce();
  });

  it("records gateway failure without changing quotation lifecycle", async () => {
    const value = quotation();
    const gateway = {
      deliver: vi.fn().mockResolvedValue({
        success: false,
        errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Quotation delivery provider is not configured.",
      }),
    };
    const context = useCase({ quotation: value, gateway });
    const result = await context.execute.execute({
      companyId: "company-1", quotationId: "quotation-1", channel: "EMAIL",
      recipient: "customer@example.com", locale: "en",
    });

    expect(result.success).toBe(true);
    expect(context.deliveries.values[0]).toMatchObject({
      status: "FAILED", errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
    });
    expect(value.status).toBe("DRAFT");
    expect(context.quotations.update).not.toHaveBeenCalled();
  });

  it("converts an adapter exception into a safe failed attempt", async () => {
    const context = useCase({
      gateway: {
        deliver: vi.fn().mockRejectedValue(new Error("provider secret")),
      },
    });

    const result = await context.execute.execute({
      companyId: "company-1",
      quotationId: "quotation-1",
      channel: "EMAIL",
      recipient: "customer@example.com",
      locale: "en",
    });

    expect(result.success && result.data).toMatchObject({
      status: "FAILED",
      errorCode: "DELIVERY_PROVIDER_ERROR",
      errorMessage: "Quotation delivery provider failed safely.",
    });
    expect(context.deliveries.repository.update).toHaveBeenCalledOnce();
  });

  it("keeps channel outcomes independent", async () => {
    const email = useCase();
    const whatsapp = useCase({
      gateway: { deliver: vi.fn().mockResolvedValue({ success: false, errorCode: "FAILED", errorMessage: "Failed." }) },
    });

    const emailResult = await email.execute.execute({
      companyId: "company-1", quotationId: "quotation-1", channel: "EMAIL",
      recipient: "customer@example.com", locale: "en",
    });
    const whatsappResult = await whatsapp.execute.execute({
      companyId: "company-1", quotationId: "quotation-1", channel: "WHATSAPP",
      recipient: "+96590000000", locale: "ar",
    });

    expect(emailResult.success && emailResult.data.status).toBe("SENT");
    expect(whatsappResult.success && whatsappResult.data.status).toBe("FAILED");
  });

  it.each([
    [{ channel: "SMS", recipient: "x", locale: "en" }, "DELIVERY_CHANNEL_INVALID"],
    [{ channel: "EMAIL", recipient: " ", locale: "en" }, "DELIVERY_RECIPIENT_REQUIRED"],
    [{ channel: "EMAIL", recipient: "x", locale: "fr" }, "DELIVERY_LOCALE_INVALID"],
  ] as const)("rejects invalid delivery input", async (invalid, code) => {
    const context = useCase();
    const result = await context.execute.execute({
      companyId: "company-1", quotationId: "quotation-1",
      ...invalid,
    } as never);

    expect(result).toMatchObject({ success: false, error: { code } });
    expect(context.deliveries.repository.create).not.toHaveBeenCalled();
  });

  it("does not create an attempt for a missing or cross-tenant quotation", async () => {
    const context = useCase({ quotation: null });
    const result = await context.execute.execute({
      companyId: "other-company", quotationId: "quotation-1", channel: "EMAIL",
      recipient: "customer@example.com", locale: "en",
    });

    expect(result).toMatchObject({ success: false, error: { code: "QUOTATION_NOT_FOUND" } });
    expect(context.deliveries.repository.create).not.toHaveBeenCalled();
  });
});
