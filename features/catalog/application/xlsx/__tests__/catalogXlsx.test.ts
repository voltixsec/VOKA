import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { CatalogItem } from "../../../domain/entities";
import {
  autoMapCatalogHeaders,
  buildCatalogExportBuffer,
  buildCatalogTemplateBuffer,
  CATALOG_XLSX_HEADERS,
  commitCatalogRows,
  previewCatalogRows,
  readCatalogWorkbook,
  validateCatalogXlsxMapping,
} from "../catalogXlsx";

async function workbook(rows: Array<Record<string, unknown>>) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Catalog");
  sheet.addRow(Object.values(CATALOG_XLSX_HEADERS));
  rows.forEach((row) => sheet.addRow([
    row.type, row.code, row.name, row.nameAr, row.nameEn, row.salePrice, row.purchasePrice,
    row.sku, row.barcode, row.unit, row.taxRate, row.description, row.descriptionAr, row.descriptionEn,
    row.trackInventory, row.allowDiscount, row.active, row.notes,
  ]));
  return Buffer.from(await book.xlsx.writeBuffer());
}

const mapping = autoMapCatalogHeaders(Object.values(CATALOG_XLSX_HEADERS));
const lookups = {
  units: [{ id: "u-1", symbol: "PCS", name: "Piece" }],
  taxRates: [{ id: "t-1", name: "VAT", percentage: 5 }],
};

describe("catalog xlsx engine", () => {
  it("builds a true xlsx template with canonical headers", async () => {
    const bytes = await buildCatalogTemplateBuffer(lookups);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const parsed = await readCatalogWorkbook(bytes);
    expect(parsed.headers).toEqual(Object.values(CATALOG_XLSX_HEADERS));
  });

  it("auto-maps headers and rejects duplicate mapping", () => {
    expect(mapping.type).toBe("Type");
    expect(validateCatalogXlsxMapping({ type: "Type", code: "Type", name: "Name" }, ["Type", "Name"])).toContain(
      'Column "Type" is mapped more than once.',
    );
  });

  it("accepts nullable sale price and valid rows", async () => {
    const parsed = await readCatalogWorkbook(await workbook([{ type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: "", unit: "PCS", taxRate: "VAT 5%" }]));
    const rows = previewCatalogRows(parsed.rows, mapping, lookups, { codes: new Set(), skus: new Set(), barcodes: new Set() });
    expect(rows[0].valid).toBe(true);
    expect(rows[0].input?.salePrice).toBeNull();
    expect(rows[0].input?.unitId).toBe("u-1");
    expect(rows[0].input?.taxRateId).toBe("t-1");
  });

  it("rejects invalid type, workbook duplicates, tenant conflicts and unresolved unit/tax", async () => {
    const parsed = await readCatalogWorkbook(await workbook([
      { type: "WIDGET", code: "A-1", name: "One" },
      { type: "PRODUCT", code: "A-1", name: "Two" },
      { type: "PRODUCT", code: "EXIST", name: "Three", sku: "SKU-1", unit: "BOX", taxRate: "Unknown" },
    ]));
    const rows = previewCatalogRows(parsed.rows, mapping, lookups, {
      codes: new Set(["EXIST"]),
      skus: new Set(["SKU-1"]),
      barcodes: new Set(),
    });
    expect(rows[0].errors).toContain("INVALID_TYPE");
    expect(rows[1].errors).toContain("DUPLICATE_CODE_IN_WORKBOOK");
    expect(rows[2].errors).toEqual(expect.arrayContaining([
      "CATALOG_ITEM_CODE_ALREADY_EXISTS",
      "CATALOG_ITEM_SKU_ALREADY_EXISTS",
      "UNRESOLVED_UNIT",
      "UNRESOLVED_TAX_RATE",
    ]));
  });

  it("exports xlsx with human-readable unit and tax labels", async () => {
    const bytes = await buildCatalogExportBuffer([
      { type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: 10, isActive: true, unitLabel: "PCS", taxLabel: "VAT 5%" },
    ]);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const parsed = await readCatalogWorkbook(bytes);
    expect(parsed.rows[0].cells.Unit).toBe("PCS");
    expect(parsed.rows[0].cells["Tax Rate"]).toBe("VAT 5%");
  });

  it("commit writes only through CreateCatalogItem and can abort on conflict", async () => {
    const save = vi.fn(async (item: CatalogItem) => item);
    const repository = {
      findByCode: vi.fn().mockResolvedValue(null),
      findBySku: vi.fn().mockResolvedValue(null),
      findByBarcode: vi.fn().mockResolvedValue(null),
      save,
    };
    const ids = await commitCatalogRows(repository as never, "company-1", [
      { type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: null },
    ]);
    expect(ids).toHaveLength(1);
    expect(save).toHaveBeenCalledOnce();
    repository.findByCode.mockResolvedValue(CatalogItem.create({ companyId: "company-1", type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: null }).getValue());
    await expect(commitCatalogRows(repository as never, "company-1", [
      { type: "PRODUCT", code: "CAM-1", name: "Camera", salePrice: null },
    ])).rejects.toMatchObject({ code: "CATALOG_ITEM_CODE_ALREADY_EXISTS" });
  });
});
