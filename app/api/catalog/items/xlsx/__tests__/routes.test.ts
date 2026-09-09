import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { CATALOG_XLSX_HEADERS } from "@/features/catalog/application/xlsx/catalogXlsx";

const mocks = vi.hoisted(() => ({
  findAllItems: vi.fn(),
  count: vi.fn(),
  findByCode: vi.fn(),
  findBySku: vi.fn(),
  findByBarcode: vi.fn(),
  save: vi.fn(),
  findAllUnits: vi.fn(),
  taxFindMany: vi.fn(),
  transaction: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock("@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository", () => ({
  PrismaCatalogItemRepository: class {
    findAll = mocks.findAllItems;
    count = mocks.count;
    findByCode = mocks.findByCode;
    findBySku = mocks.findBySku;
    findByBarcode = mocks.findByBarcode;
    save = mocks.save;
  },
}));
vi.mock("@/features/catalog/infrastructure/prisma/PrismaUnitRepository", () => ({
  PrismaUnitRepository: class {
    findAll = mocks.findAllUnits;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    taxRate: { findMany: mocks.taxFindMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: (request: Request, auth: never, company: { companyId: string }) => Promise<Response>) => {
      mocks.roleSets.push([...roles]);
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

import { GET as template } from "../template/route";
import { POST as preview } from "../preview/route";
import { POST as commit } from "../commit/route";
import { GET as exportXlsx } from "../export/route";
import { CatalogItem } from "@/features/catalog/domain/entities/CatalogItem";

async function xlsxFile(rows: Array<Record<string, unknown>>) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Catalog");
  sheet.addRow(Object.values(CATALOG_XLSX_HEADERS));
  rows.forEach((row) => sheet.addRow([
    row.type, row.code, row.name, "", "", row.salePrice, "", row.sku, "", row.unit, row.taxRate,
  ]));
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return new File([buffer], "catalog.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function mapping() {
  return JSON.stringify({
    type: "Type",
    code: "Code",
    name: "Name",
    salePrice: "Sale Price",
    sku: "SKU",
    unit: "Unit",
    taxRate: "Tax Rate",
  });
}

describe("catalog xlsx routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllUnits.mockResolvedValue([{ id: { toString: () => "u-1" }, symbol: "PCS", name: "Piece" }]);
    mocks.taxFindMany.mockResolvedValue([{ id: "t-1", name: "VAT", percentage: 5 }]);
    mocks.findAllItems.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.findByCode.mockResolvedValue(null);
    mocks.findBySku.mockResolvedValue(null);
    mocks.findByBarcode.mockResolvedValue(null);
    mocks.save.mockImplementation(async (value) => value);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
  });

  it("returns a true xlsx template", async () => {
    const response = await template(new Request("http://localhost/api/catalog/items/xlsx/template"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  it("previews without writing and blocks invalid type", async () => {
    const body = new FormData();
    body.set("file", await xlsxFile([{ type: "WIDGET", code: "A-1", name: "Bad" }]));
    body.set("mapping", mapping());
    const response = await preview(new Request("http://localhost/api/catalog/items/xlsx/preview", { method: "POST", body }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(false);
    expect(json.data.rows[0].valid).toBe(false);
    expect(json.data.rows[0].errors).toContain("INVALID_TYPE");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("commits valid rows and imports zero when any row is invalid", async () => {
    const good = new FormData();
    good.set("file", await xlsxFile([{ type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: "", unit: "PCS" }]));
    good.set("mapping", mapping());
    const ok = await commit(new Request("http://localhost/api/catalog/items/xlsx/commit", { method: "POST", body: good }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.importedCount).toBe(1);
    expect(mocks.transaction).toHaveBeenCalled();

    const bad = new FormData();
    bad.set("file", await xlsxFile([{ type: "PRODUCT", code: "CAM-1", name: "Camera" }, { type: "WIDGET", code: "X", name: "Bad" }]));
    bad.set("mapping", mapping());
    const blocked = await commit(new Request("http://localhost/api/catalog/items/xlsx/commit", { method: "POST", body: bad }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: { code: "CATALOG_XLSX_COMMIT_BLOCKED" } });
  });

  it("exports matching pages as true xlsx with tenant scope", async () => {
    mocks.findAllItems
      .mockResolvedValueOnce([CatalogItem.create({ companyId: "company-1", type: "PRODUCT", code: "A", name: "A", salePrice: 1 }).getValue()])
      .mockResolvedValueOnce([CatalogItem.create({ companyId: "company-1", type: "PRODUCT", code: "B", name: "B", salePrice: 2 }).getValue()]);
    mocks.count.mockResolvedValue(101);
    const response = await exportXlsx(new Request("http://localhost/api/catalog/items/xlsx/export?search=cam&type=PRODUCT"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(mocks.findAllItems.mock.calls[0][0]).toMatchObject({ companyId: "company-1", search: "cam", type: "PRODUCT", take: 100 });
    expect(mocks.findAllItems).toHaveBeenCalledTimes(2);
  });

  it("uses catalog write roles for commit and read roles for export", () => {
    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES"]);
    expect(mocks.roleSets).toContainEqual(["OWNER", "ADMIN", "SALES", "VIEWER"]);
  });
});
