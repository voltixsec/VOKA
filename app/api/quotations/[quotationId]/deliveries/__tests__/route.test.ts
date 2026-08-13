import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findHistory: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository",
  () => ({
    PrismaQuotationRepository: class {
      findById = mocks.findById;
    },
  }),
);

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation-delivery/PrismaQuotationDeliveryRepository",
  () => ({
    PrismaQuotationDeliveryRepository: class {
      findHistory = mocks.findHistory;
    },
  }),
);

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>(
    "@/lib/api/ApiError",
  );
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>(
    "@/lib/api/ApiResponse",
  );

  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      allowedRoles: readonly string[],
      handler: (
        request: Request,
        auth: never,
        company: { companyId: string },
      ) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...allowedRoles]);
      return async (request: Request) => {
        try {
          return await handler(request, {} as never, { companyId: "company-1" });
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { Quotation } from "@/src/domain/quotation";
import { QuotationDelivery } from "@/src/domain/quotation-delivery";

import { GET } from "../route";

function quotation() {
  return new Quotation({
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: { name: "Customer" },
    lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
  });
}

function failedDelivery() {
  const value = new QuotationDelivery({
    id: "delivery-1",
    companyId: "company-1",
    quotationId: "quotation-1",
    channel: "WHATSAPP",
    recipient: "+96590000000",
    attemptedAt: new Date("2026-08-14T10:00:00.000Z"),
  });
  value.markFailed(
    "DELIVERY_PROVIDER_NOT_CONFIGURED",
    "Quotation delivery provider is not configured.",
    new Date("2026-08-14T10:01:00.000Z"),
  );
  return value;
}

describe("GET /api/quotations/[quotationId]/deliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(quotation());
    mocks.findHistory.mockResolvedValue([failedDelivery()]);
  });

  it("allows VIEWER and returns safe tenant-scoped history", async () => {
    const response = await GET(new Request(
      "http://localhost/api/quotations/quotation-1/deliveries",
    ));
    const body = await response.json();

    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(mocks.findHistory).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data[0]).toMatchObject({
      id: "delivery-1",
      channel: "WHATSAPP",
      recipient: "+96590000000",
      status: "FAILED",
    });
    expect(body.data[0]).not.toHaveProperty("companyId");
    expect(body.data[0]).not.toHaveProperty("document");
    expect(body.data[0]).not.toHaveProperty("bytes");
    expect(body.data[0]).not.toHaveProperty("providerRequestKey");
    expect(body.data[0]).not.toHaveProperty("accessToken");
    expect(body.meta.channels).toMatchObject({
      EMAIL: { configured: false },
      WHATSAPP: { configured: false },
    });
    expect(JSON.stringify(body.meta)).not.toContain("RESEND_API_KEY");
    expect(JSON.stringify(body.meta)).not.toContain("ACCESS_TOKEN");
  });

  it("does not query or leak history for a cross-tenant quotation id", async () => {
    mocks.findById.mockResolvedValue(null);

    const response = await GET(new Request(
      "http://localhost/api/quotations/quotation-1/deliveries",
    ));

    expect(response.status).toBe(404);
    expect(mocks.findHistory).not.toHaveBeenCalled();
  });
});
