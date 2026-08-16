import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  render: vi.fn(),
  companyFindUnique: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: mocks.companyFindUnique,
    },
  },
}));

vi.mock("@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository", () => ({
  PrismaSalesOrderRepository: class {
    findById = mocks.findById;
  },
}));

vi.mock("@/src/infrastructure/document/pdfkit/PdfKitSalesOrderDocumentRenderer", () => ({
  PdfKitSalesOrderDocumentRenderer: class {
    render = mocks.render;
  },
}));

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    withCompanyAuth: (
      allowedRoles: readonly string[],
      handler: (
        request: Request,
        auth: { user: { locale: string } },
        company: { companyId: string; membership: { company: { name: string } } },
      ) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...allowedRoles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            { user: { locale: "en" } },
            { companyId: "company-1", membership: { company: { name: "VOKA Company" } } },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { SalesOrder } from "@/src/domain/sales-order";
import { GET } from "../route";

function sampleSalesOrder(): SalesOrder {
  return SalesOrder.restore({
    id: "so-1",
    companyId: "company-1",
    sourceQuotationId: "q-1",
    sourceQuotationNumber: "Q-001",
    number: "SO-001",
    status: "CONFIRMED",
    customerId: "c-1",
    currencyCode: "KWD",
    orderDate: new Date("2026-08-05T00:00:00Z"),
    createdAt: new Date("2026-08-05T10:30:00Z"),
    customer: { name: "Demo Customer" },
    lines: [
      {
        sourceQuotationLineId: "ql-1",
        position: 1,
        type: "PRODUCT",
        itemName: "Product 1",
        quantity: 1,
        unitPrice: 10,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 10,
        totalAmount: 10,
      },
    ],
    subtotal: 10,
    discountValue: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 10,
    sourceApprovedAt: new Date("2026-08-04T00:00:00Z"),
    sourceApprovedByName: "Approver",
    sourceApprovedByRole: "OWNER",
    createdByUserId: "u-1",
    createdByName: "Creator",
    createdByRole: "SALES",
    confirmedAt: new Date("2026-08-06T00:00:00Z"),
    confirmedByUserId: "u-2",
    confirmedByName: "Confirmer",
    confirmedByRole: "ADMIN",
  });
}

describe("GET /api/sales-orders/[salesOrderId]/pdf", () => {
  beforeEach(() => {
    mocks.findById.mockReset();
    mocks.render.mockReset();
    mocks.companyFindUnique.mockReset();

    mocks.companyFindUnique.mockResolvedValue({
      name: "VOKA Company",
      nameAr: "شركة فوكا",
      nameEn: "VOKA Company",
      addressAr: "الكويت",
      addressEn: "Kuwait",
      poBox: "12345",
      phone: "+965 2222 2222",
      mobile: "+965 9999 9999",
      whatsapp: "+965 9999 9999",
      logoUrl: "data:image/png;base64,AAAA",
    });
  });

  it("downloads a Sales Order PDF with proper auth and headers", async () => {
    mocks.findById.mockResolvedValue(sampleSalesOrder());
    mocks.render.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));

    const response = await GET(new Request("http://localhost/api/sales-orders/so-1/pdf?locale=ar"));

    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "so-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="sales-order-SO-001.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 404 for missing or cross-tenant sales order", async () => {
    mocks.findById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/sales-orders/cross-tenant-id/pdf"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "SALES_ORDER_NOT_FOUND", message: "Sales Order not found." },
    });
  });

  it("rejects invalid locale parameter", async () => {
    const response = await GET(new Request("http://localhost/api/sales-orders/so-1/pdf?locale=fr"));

    expect(response.status).toBe(400);
    expect(mocks.findById).not.toHaveBeenCalled();
  });
});
