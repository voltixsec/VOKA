import { describe, expect, it, vi } from "vitest";
import {
  UniversalCatalogItem,
  UniversalItemIdentifier,
} from "../../../../features/universal-library";
import { serializeUniversalItem } from "../serialize-universal";

vi.mock("../../../../lib/api/with-company-auth", () => ({
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

vi.mock("../../../../lib/prisma", () => ({
  prisma: {
    universalCatalogItem: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "ucl-item-1",
          type: "PRODUCT",
          name: "Global Solar Panel 400W",
          nameAr: "لوح شمسي عالمي 400 واط",
          nameEn: "Global Solar Panel 400W",
          searchName: "global solar panel 400w",
          description: "High efficiency mono solar panel",
          isActive: true,
          createdAt: new Date("2026-08-20T00:00:00Z"),
          updatedAt: new Date("2026-08-20T00:00:00Z"),
          category: {
            id: "cat-solar",
            parentId: null,
            code: "SOLAR",
            name: "Solar Energy",
            isActive: true,
            createdAt: new Date("2026-08-20T00:00:00Z"),
            updatedAt: new Date("2026-08-20T00:00:00Z"),
          },
          provenances: [],
        },
      ]),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === "ucl-item-1") {
          return {
            id: "ucl-item-1",
            type: "PRODUCT",
            name: "Global Solar Panel 400W",
            isActive: true,
            createdAt: new Date("2026-08-20T00:00:00Z"),
            updatedAt: new Date("2026-08-20T00:00:00Z"),
          };
        }
        return null;
      }),
    },
    universalItemAdoption: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    catalogItem: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn().mockImplementation(async (callback: any) => {
      const tx = {
        universalCatalogItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "ucl-item-1",
            type: "PRODUCT",
            name: "Global Solar Panel 400W",
            nameAr: null,
            nameEn: null,
            description: null,
            descriptionAr: null,
            descriptionEn: null,
            isActive: true,
          }),
        },
        unit: { findFirst: vi.fn() },
        taxRate: { findFirst: vi.fn() },
        catalogItem: {
          create: vi.fn().mockResolvedValue({
            id: "tenant-cat-999",
            companyId: "company-authenticated-456",
            type: "PRODUCT",
            code: "UCL-UCL-ITEM",
            name: "Global Solar Panel 400W",
            salePrice: { toNumber: () => 120 },
            isActive: true,
            trackInventory: true,
            allowDiscount: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        universalItemAdoption: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "adoption-777",
            companyId: "company-authenticated-456",
            universalItemId: "ucl-item-1",
            catalogItemId: "tenant-cat-999",
            adoptedByUserId: "user-123",
            adoptedAt: new Date(),
            catalogItem: {
              id: "tenant-cat-999",
              companyId: "company-authenticated-456",
              type: "PRODUCT",
              code: "UCL-UCL-ITEM",
              name: "Global Solar Panel 400W",
              salePrice: { toNumber: () => 120 },
              isActive: true,
              trackInventory: true,
              allowDiscount: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }),
        },
      };
      return callback(tx);
    }),
  },
}));

describe("Universal Library API Surface", () => {
  it("does not expose internal normalized identifier values", () => {
    const timestamp = new Date("2026-08-21T00:00:00Z");
    const serialized = serializeUniversalItem(new UniversalCatalogItem({
      id: "item-1",
      type: "PRODUCT",
      name: "Camera",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      identifiers: [new UniversalItemIdentifier({
        id: "identifier-1",
        universalItemId: "item-1",
        identifierType: "MPN",
        value: "DS-2CD",
        normalizedValue: "DS-2CD",
        manufacturerId: "mfg-1",
        createdAt: timestamp,
        updatedAt: timestamp,
      })],
    }));
    expect(serialized.identifiers[0]).toMatchObject({
      value: "DS-2CD",
      manufacturerId: "mfg-1",
    });
    expect(serialized.identifiers[0]).not.toHaveProperty("normalizedValue");
  });

  it("GET /api/universal-library/items returns bounded universal results", async () => {
    const { GET } = await import("../items/route");

    const req = new Request("http://localhost:3000/api/universal-library/items?q=solar&limit=10");
    const res = await GET(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("ucl-item-1");
    expect(body.meta.total).toBe(1);
  });

  it("POST /api/universal-library/items/[id]/adopt derives company ownership server-side", async () => {
    const { POST } = await import("../items/[id]/adopt/route");

    const req = new Request("http://localhost:3000/api/universal-library/items/ucl-item-1/adopt", {
      method: "POST",
      body: JSON.stringify({
        salePrice: 120,
        companyId: "FORGED_OTHER_COMPANY_ID",
      }),
    });

    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.catalogItem.companyId).toBe("company-authenticated-456");
    expect(body.data.adoption.companyId).toBe("company-authenticated-456");
  });

  it.each([
    [{ salePrice: "120" }, "salePrice"],
    [{ salePrice: -1 }, "salePrice"],
    [{ unitId: 42 }, "unitId"],
    [{ taxRateId: false }, "taxRateId"],
  ])("rejects malformed adoption input %#", async (payload, field) => {
    const { POST } = await import("../items/[id]/adopt/route");
    await expect(POST(new Request(
      "http://localhost:3000/api/universal-library/items/ucl-item-1/adopt",
      { method: "POST", body: JSON.stringify(payload) }
    ) as any)).rejects.toMatchObject({ statusCode: 400, details: { field } });
  });

  it("rejects incomplete identifier filters and malformed boolean filters", async () => {
    const { GET } = await import("../items/route");
    await expect(GET(new Request(
      "http://localhost:3000/api/universal-library/items?identifierType=GTIN_13"
    ) as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INCOMPLETE_IDENTIFIER_FILTER",
    });
    await expect(GET(new Request(
      "http://localhost:3000/api/universal-library/items?isActive=maybe"
    ) as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_BOOLEAN",
    });
  });

  it("requires manufacturer scope for exact MPN lookup", async () => {
    const { GET } = await import("../identifiers/lookup/route");
    await expect(GET(new Request(
      "http://localhost:3000/api/universal-library/identifiers/lookup?type=MPN&value=DS-2CD"
    ) as any)).rejects.toMatchObject({
      statusCode: 400,
      code: "IDENTIFIER_MANUFACTURER_REQUIRED",
    });
  });
});
