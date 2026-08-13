import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { PrismaQuotationDocumentProvider } from "../PrismaQuotationDocumentProvider";

const company = {
  name: "VOKA Company",
  nameAr: "شركة فوكا",
  nameEn: "VOKA Company",
  addressAr: "الكويت",
  addressEn: "Kuwait",
  poBox: "12345",
  phone: "+965 2222 2222",
  mobile: "+965 9999 9999",
  whatsapp: "+965 9999 9999",
  logoUrl: "data:image/png;base64,LOGO",
  letterheadUrl: "data:image/png;base64,LETTERHEAD",
  signatureUrl: "data:image/png;base64,SIGNATURE",
  stampUrl: "data:image/png;base64,STAMP",
  brandTheme: "NAVY_GOLD",
};

const db = {
  company: { findUnique: vi.fn() },
};

const generateDocument = {
  execute: vi.fn(),
};

describe("PrismaQuotationDocumentProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.company.findUnique.mockResolvedValue(company);
    generateDocument.execute.mockResolvedValue({
      success: true,
      data: {
        filename: "quotation-Q-001.pdf",
        bytes: new Uint8Array([37, 80, 68, 70]),
      },
    });
  });

  it("reuses canonical document generation with tenant branding", async () => {
    const provider = new PrismaQuotationDocumentProvider(
      generateDocument as never,
      db as never,
      "https://voka.example",
    );

    const result = await provider.generate({
      companyId: "company-1",
      quotationId: "quotation-1",
      locale: "ar",
    });

    expect(db.company.findUnique).toHaveBeenCalledWith({
      where: { id: "company-1" },
      select: expect.objectContaining({
        name: true,
        logoUrl: true,
        letterheadUrl: true,
        signatureUrl: true,
        stampUrl: true,
      }),
    });
    expect(generateDocument.execute).toHaveBeenCalledWith({
      companyId: "company-1",
      companyName: "VOKA Company",
      companyIdentity: expect.objectContaining({
        nameAr: "شركة فوكا",
        letterheadUrl: "data:image/png;base64,LETTERHEAD",
        signatureUrl: "data:image/png;base64,SIGNATURE",
        stampUrl: "data:image/png;base64,STAMP",
      }),
      quotationId: "quotation-1",
      locale: "ar",
      publicBaseUrl: "https://voka.example",
    });
    expect(result).toEqual({
      success: true,
      data: {
        filename: "quotation-Q-001.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([37, 80, 68, 70]),
      },
    });
  });

  it("returns a stable error without invoking document generation when company is missing", async () => {
    db.company.findUnique.mockResolvedValue(null);
    const provider = new PrismaQuotationDocumentProvider(
      generateDocument as never,
      db as never,
    );

    const result = await provider.generate({
      companyId: "other-company",
      quotationId: "quotation-1",
      locale: "en",
    });

    expect(result).toEqual({
      success: false,
      error: { code: "COMPANY_NOT_FOUND", message: "Company not found." },
    });
    expect(generateDocument.execute).not.toHaveBeenCalled();
  });
});
