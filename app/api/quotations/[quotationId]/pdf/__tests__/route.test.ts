import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById:
    vi.fn(),

  render:
    vi.fn(),

  companyFindUnique:
    vi.fn(),
  update: vi.fn(),

  roleSets:
    [] as string[][],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique:
        mocks.companyFindUnique,
    },
  },
}));

vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({
  PrismaQuotationRepository: class { findById = mocks.findById; update = mocks.update; },
}));
vi.mock("@/src/infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer", () => ({
  PdfKitQuotationDocumentRenderer: class { render = mocks.render; },
}));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    withCompanyAuth: (allowedRoles: readonly string[], handler: (request: Request, auth: { user: { locale: string } }, company: { companyId: string; membership: { company: { name: string } } }) => Promise<Response>) => {
      mocks.roleSets.push([...allowedRoles]);
      return async (request: Request) => {
        try { return await handler(request, { user: { locale: "en" } }, { companyId: "company-1", membership: { company: { name: "VOKA Company" } } }); }
        catch (error) { return responses.handleApiError(error); }
      };
    },
  };
});

import { Quotation } from "@/src/domain/quotation";
import { GET } from "../route";

function quotation(): Quotation {
  return Quotation.restore({ id: "quotation-1", companyId: "company-1", customerId: "customer-1", number: "Q-001", customer: { name: "Demo Customer" }, lines: [{ position: 1, type: "PRODUCT", itemName: "Product", quantity: 1, unitPrice: 10 }] });
}

describe("GET /api/quotations/[quotationId]/pdf", () => {
  beforeEach(() => {
    mocks.findById
      .mockReset();

    mocks.render
      .mockReset();

    mocks.companyFindUnique
      .mockReset();
    mocks.update.mockReset();

    mocks.companyFindUnique
      .mockResolvedValue({
        name:
          "VOKA Company",

        nameAr:
          "???? ????",

        nameEn:
          "VOKA Company",

        addressAr:
          "??????",

        addressEn:
          "Kuwait",

        poBox:
          "12345",

        phone:
          "+965 2222 2222",

        mobile:
          "+965 9999 9999",

        whatsapp:
          "+965 9999 9999",

        logoUrl:
          "data:image/png;base64,AAAA",
      });
  });

  it("downloads an Arabic tenant-scoped PDF for every read role", async () => {
    mocks.findById.mockResolvedValue(quotation());
    mocks.render.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));
    const response = await GET(new Request("http://localhost/api/quotations/quotation-1/pdf?locale=ar"));
    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "quotation-1");
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ locale: "ar", company:
      expect.objectContaining({
        name:
          "???? ????",

        address:
          "??????",

        poBox:
          "12345",

        phone:
          "+965 2222 2222",

        mobile:
          "+965 9999 9999",

        whatsapp:
          "+965 9999 9999",

        logoUrl:
          "data:image/png;base64,AAAA",
      }), qrValue: "VOKA:Q-001" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="quotation-Q-001.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("%PDF-");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ["?locale=en", "attachment"],
    ["?locale=en&disposition=attachment", "attachment"],
    ["?locale=en&disposition=inline", "inline"],
  ] as const)("returns %s using %s disposition", async (query, disposition) => {
    mocks.findById.mockResolvedValue(quotation());
    mocks.render.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));

    const response = await GET(new Request(
      `http://localhost/api/quotations/quotation-1/pdf${query}`,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      `${disposition}; filename="quotation-Q-001.pdf"`,
    );
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "quotation-1");
  });

  it("rejects an unsupported disposition before document generation", async () => {
    const response = await GET(new Request(
      "http://localhost/api/quotations/quotation-1/pdf?locale=en&disposition=preview",
    ));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "DOCUMENT_DISPOSITION_INVALID",
        details: { field: "disposition" },
      },
    });
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("uses an approved quotation brand snapshot without mutating it", async () => {
    const approved = Quotation.restore({
      id: "quotation-1", companyId: "company-1", customerId: "customer-1",
      number: "Q-001", status: "APPROVED", customer: { name: "Demo Customer" },
      lines: [{ position: 1, type: "PRODUCT", itemName: "Product", quantity: 1, unitPrice: 10 }],
      documentBrandSnapshot: {
        version: 1, nameAr: null, nameEn: "Original Brand",
        addressAr: null, addressEn: "Original Address", poBox: null,
        phone: null, mobile: null, whatsapp: null, logoUrl: null,
        brandTheme: "EMERALD",
      },
    });
    mocks.findById.mockResolvedValue(approved);
    mocks.companyFindUnique.mockResolvedValue({
      name: "Changed Company", nameAr: null, nameEn: "Changed Brand",
      addressAr: null, addressEn: "Changed Address", poBox: null,
      phone: null, mobile: null, whatsapp: null, logoUrl: null,
      brandTheme: "BURGUNDY",
    });
    mocks.render.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));

    const response = await GET(new Request("http://localhost/api/quotations/quotation-1/pdf?locale=en"));
    expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({ name: "Original Brand", address: "Original Address", brandTheme: "EMERALD" }),
    }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns the same 404 for missing and cross-company quotations", async () => {
    mocks.findById.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/quotations/other-company-quotation/pdf"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." } });
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("rejects unsupported locales before rendering", async () => {
    const response = await GET(new Request("http://localhost/api/quotations/quotation-1/pdf?locale=fr"));
    expect(response.status).toBe(400);
    expect(mocks.findById).not.toHaveBeenCalled();
  });
});
