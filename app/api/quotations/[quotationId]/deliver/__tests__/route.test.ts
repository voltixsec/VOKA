import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  generateDocument: vi.fn(),
  roleSets: [] as string[][],
  update: vi.fn(),
}));

vi.mock(
  "@/src/infrastructure/document/PrismaQuotationDocumentProvider",
  () => ({
    PrismaQuotationDocumentProvider: class {
      generate = mocks.generateDocument;
    },
  }),
);

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
      create = mocks.create;
      update = mocks.update;
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

import { POST } from "../route";

function quotation() {
  return new Quotation({
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: { name: "Customer" },
    lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/quotations/quotation-1/deliver", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/quotations/[quotationId]/deliver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(quotation());
    mocks.create.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(undefined);
    mocks.generateDocument.mockResolvedValue({
      success: true,
      data: {
        filename: "quotation-Q-001.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([37, 80, 68, 70]),
      },
    });
  });

  it("allows write roles but excludes VIEWER", () => {
    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES"]);
    expect(mocks.roleSets.flat()).not.toContain("VIEWER");
  });

  it("persists and safely reports the unavailable provider failure", async () => {
    const response = await POST(request({
      channel: "EMAIL",
      recipient: "customer@example.com",
      locale: "en",
    }));
    const body = await response.json();

    expect(mocks.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: {
        quotationId: "quotation-1",
        channel: "EMAIL",
        recipient: "customer@example.com",
        status: "FAILED",
        errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
      },
    });
    expect(body.data).not.toHaveProperty("companyId");
    expect(body.data).not.toHaveProperty("providerResponse");
  });

  it.each([
    [{ channel: "SMS", recipient: "x", locale: "en" }, "DELIVERY_CHANNEL_INVALID"],
    [{ channel: "EMAIL", recipient: "", locale: "en" }, "DELIVERY_RECIPIENT_REQUIRED"],
    [{ channel: "EMAIL", recipient: "x", locale: "fr" }, "DELIVERY_LOCALE_INVALID"],
  ])("rejects invalid input", async (invalid, code) => {
    const response = await POST(request(invalid));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns the same not-found result for a cross-tenant quotation id", async () => {
    mocks.findById.mockResolvedValue(null);

    const response = await POST(request({
      channel: "WHATSAPP",
      recipient: "+96590000000",
      locale: "ar",
    }));

    expect(response.status).toBe(404);
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
