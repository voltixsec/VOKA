import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/with-company-auth", () => ({
  withCompanyAuth: (_roles: string[], handler: any) => {
    return async (req: any) => {
      const mockAuth = {
        user: { id: "user-123", email: "sales@company.com" },
        membership: { role: "SALES" },
      };
      const mockCompany = { companyId: "company-authenticated-456" };
      return handler(req, mockAuth, mockCompany);
    };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    catalogItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "cat-item-1",
          companyId: "company-authenticated-456",
          type: "PRODUCT",
          code: "CAM-01",
          sku: "SKU-01",
          barcode: "123456",
          name: "Company CCTV Camera",
          nameAr: null,
          nameEn: null,
          salePrice: { toNumber: () => 150 },
          isActive: true,
          unit: { id: "u-pc", name: "Piece", symbol: "pc" },
          category: { id: "c-sec", name: "Security" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    },
    universalCatalogItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "ucl-item-1",
          type: "PRODUCT",
          name: "Global Security Camera 4K",
          searchName: "global security camera 4k",
          modelNumber: "DS-4K",
          isActive: true,
          manufacturer: { name: "Hikvision" },
          brand: { name: "Hikvision" },
          category: { id: "c-sec", name: "Security" },
          identifiers: [{ identifierType: "GTIN_13", value: "6941218201234" }],
          aliases: [{ alias: "Hikvision 4K" }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    },
    universalItemAdoption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("Commercial Retrieval API Surface", () => {
  it("GET /api/commercial-retrieval returns candidates from both Catalog and Universal Library", async () => {
    const { GET } = await import("../route");

    const req = new Request("http://localhost:3000/api/commercial-retrieval?q=Camera&limit=10");
    const res = await GET(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].origin).toBe("COMPANY_CATALOG");
    expect(body.data[1].origin).toBe("UNIVERSAL_LIBRARY");
    expect(body.meta.totalCandidates).toBe(2);
    expect(body.meta.limit).toBe(10);
  });

  it("returns controlled 400 validation error for invalid limit", async () => {
    const { GET } = await import("../route");

    const req1 = new Request("http://localhost:3000/api/commercial-retrieval?limit=100");
    await expect(GET(req1 as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_LIMIT",
    });

    const req2 = new Request("http://localhost:3000/api/commercial-retrieval?limit=0");
    await expect(GET(req2 as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_LIMIT",
    });

    const req3 = new Request("http://localhost:3000/api/commercial-retrieval?limit=abc");
    await expect(GET(req3 as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_LIMIT",
    });
  });

  it("returns controlled 400 validation error for invalid item type or locale", async () => {
    const { GET } = await import("../route");

    const req1 = new Request("http://localhost:3000/api/commercial-retrieval?type=INVALID_TYPE");
    await expect(GET(req1 as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_CATALOG_ITEM_TYPE",
    });

    const req2 = new Request("http://localhost:3000/api/commercial-retrieval?locale=fr");
    await expect(GET(req2 as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_LOCALE",
    });
  });
});
