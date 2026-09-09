import ExcelJS from "exceljs";
import type { CatalogItemType } from "../../domain/entities";
import { CatalogItem } from "../../domain/entities";
import { CreateCatalogItem } from "../commands/CreateCatalogItem";
import { ListCatalogItems } from "../queries/ListCatalogItems";
import type { CatalogItemRepository } from "../../domain/repositories";

export const CATALOG_XLSX_MAX_ROWS = 500;
export const CATALOG_XLSX_MAX_BYTES = 2 * 1024 * 1024;

export const CATALOG_XLSX_FIELDS = [
  "type",
  "code",
  "name",
  "nameAr",
  "nameEn",
  "salePrice",
  "purchasePrice",
  "sku",
  "barcode",
  "unit",
  "taxRate",
  "description",
  "descriptionAr",
  "descriptionEn",
  "trackInventory",
  "allowDiscount",
  "active",
  "notes",
] as const;

export type CatalogXlsxField = (typeof CATALOG_XLSX_FIELDS)[number];

export const CATALOG_XLSX_HEADERS: Record<CatalogXlsxField, string> = {
  type: "Type",
  code: "Code",
  name: "Name",
  nameAr: "Name AR",
  nameEn: "Name EN",
  salePrice: "Sale Price",
  purchasePrice: "Purchase Price",
  sku: "SKU",
  barcode: "Barcode",
  unit: "Unit",
  taxRate: "Tax Rate",
  description: "Description",
  descriptionAr: "Description AR",
  descriptionEn: "Description EN",
  trackInventory: "Track Inventory",
  allowDiscount: "Allow Discount",
  active: "Active",
  notes: "Notes",
};

export const CATALOG_XLSX_FIELD_LABELS: Record<CatalogXlsxField, { ar: string; en: string }> = {
  type: { ar: "النوع", en: "Type" },
  code: { ar: "الكود", en: "Code" },
  name: { ar: "الاسم", en: "Name" },
  nameAr: { ar: "الاسم بالعربية", en: "Name AR" },
  nameEn: { ar: "الاسم بالإنجليزية", en: "Name EN" },
  salePrice: { ar: "سعر البيع", en: "Sale Price" },
  purchasePrice: { ar: "سعر الشراء", en: "Purchase Price" },
  sku: { ar: "رمز المخزون", en: "SKU" },
  barcode: { ar: "الباركود", en: "Barcode" },
  unit: { ar: "الوحدة", en: "Unit" },
  taxRate: { ar: "الضريبة", en: "Tax Rate" },
  description: { ar: "الوصف", en: "Description" },
  descriptionAr: { ar: "الوصف بالعربية", en: "Description AR" },
  descriptionEn: { ar: "الوصف بالإنجليزية", en: "Description EN" },
  trackInventory: { ar: "تتبع المخزون", en: "Track Inventory" },
  allowDiscount: { ar: "السماح بالخصم", en: "Allow Discount" },
  active: { ar: "نشط", en: "Active" },
  notes: { ar: "ملاحظات", en: "Notes" },
};

export const REQUIRED_CATALOG_XLSX_FIELDS: CatalogXlsxField[] = ["type", "code", "name"];

const ALLOWED_TYPES: CatalogItemType[] = [
  "PRODUCT",
  "SERVICE",
  "SHIPPING",
  "LABOR",
  "DISCOUNT",
  "CUSTOM",
];

export type CatalogXlsxMapping = Partial<Record<CatalogXlsxField, string>>;

export type CatalogXlsxLookups = {
  units: Array<{ id: string; symbol: string; name: string }>;
  taxRates: Array<{ id: string; name: string; percentage: number }>;
};

export type CatalogXlsxPreviewRow = {
  rowNumber: number;
  values: Record<string, string | number | boolean | null>;
  valid: boolean;
  errors: string[];
  input?: {
    type: CatalogItemType;
    code: string;
    name: string;
    nameAr?: string | null;
    nameEn?: string | null;
    salePrice: number | null;
    purchasePrice?: number | null;
    sku?: string | null;
    barcode?: string | null;
    unitId?: string | null;
    taxRateId?: string | null;
    description?: string | null;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    trackInventory?: boolean;
    allowDiscount?: boolean;
    notes?: string | null;
    isActive?: boolean;
  };
};

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function autoMapCatalogHeaders(headers: string[]): CatalogXlsxMapping {
  const aliases: Record<string, CatalogXlsxField> = {
    type: "type",
    code: "code",
    name: "name",
    "name ar": "nameAr",
    namear: "nameAr",
    "name en": "nameEn",
    nameen: "nameEn",
    "sale price": "salePrice",
    saleprice: "salePrice",
    "purchase price": "purchasePrice",
    sku: "sku",
    barcode: "barcode",
    unit: "unit",
    "tax rate": "taxRate",
    taxrate: "taxRate",
    description: "description",
    "description ar": "descriptionAr",
    "description en": "descriptionEn",
    "track inventory": "trackInventory",
    "allow discount": "allowDiscount",
    active: "active",
    notes: "notes",
  };
  const mapping: CatalogXlsxMapping = {};
  const used = new Set<CatalogXlsxField>();
  for (const header of headers) {
    const field = aliases[normalizeHeader(header)];
    if (field && !used.has(field)) {
      mapping[field] = header;
      used.add(field);
    }
  }
  return mapping;
}

export function validateCatalogXlsxMapping(mapping: CatalogXlsxMapping, headers: string[]) {
  const errors: string[] = [];
  const seen = new Map<string, CatalogXlsxField>();
  for (const field of CATALOG_XLSX_FIELDS) {
    const header = mapping[field];
    if (!header) continue;
    if (!headers.includes(header)) errors.push(`Mapped column "${header}" is missing.`);
    const owner = seen.get(header);
    if (owner && owner !== field) errors.push(`Column "${header}" is mapped more than once.`);
    seen.set(header, field);
  }
  for (const field of REQUIRED_CATALOG_XLSX_FIELDS) {
    if (!mapping[field]) errors.push(`Required field ${CATALOG_XLSX_HEADERS[field]} is not mapped.`);
  }
  return errors;
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value && "text" in value) return String((value as { text: string }).text ?? "").trim();
  if (typeof value === "object" && value && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseBoolean(raw: string): { ok: true; value: boolean } | { ok: false } | { ok: true; value: undefined } {
  if (!raw) return { ok: true, value: undefined };
  const n = raw.trim().toLowerCase();
  if (["true", "yes", "1", "y", "active", "نعم", "نشط"].includes(n)) return { ok: true, value: true };
  if (["false", "no", "0", "n", "inactive", "لا", "غير نشط"].includes(n)) return { ok: true, value: false };
  return { ok: false };
}

function parsePrice(raw: string): { ok: true; value: number | null } | { ok: false } {
  if (!raw) return { ok: true, value: null };
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function parseType(raw: string): CatalogItemType | null {
  const n = raw.trim().toUpperCase().replace(/\s+/g, "_");
  return ALLOWED_TYPES.includes(n as CatalogItemType) ? (n as CatalogItemType) : null;
}

function uniqueLookup(candidates: string[], map: Map<string, string[]>): string | "AMBIGUOUS" | null {
  const keys = [...new Set(candidates.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const ids = new Set<string>();
  for (const key of keys) {
    for (const id of map.get(key) ?? []) ids.add(id);
  }
  if (ids.size === 1) return [...ids][0];
  if (ids.size > 1) return "AMBIGUOUS";
  return null;
}

export async function readCatalogWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Catalog") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("NO_WORKSHEET");
  const headerRow = sheet.getRow(1);
  const colByHeader = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const text = cellText(cell.value);
    if (text && !colByHeader.has(text)) colByHeader.set(text, col);
  });
  const namedHeaders = [...colByHeader.keys()];
  const rows: Array<{ rowNumber: number; cells: Record<string, string> }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    let empty = true;
    namedHeaders.forEach((header) => {
      const text = cellText(row.getCell(colByHeader.get(header) ?? 0).value);
      cells[header] = text;
      if (text) empty = false;
    });
    if (!empty) rows.push({ rowNumber, cells });
  });
  return { headers: namedHeaders, rows };
}

export function buildCatalogXlsxLookups(lookups: CatalogXlsxLookups) {
  const units = new Map<string, string[]>();
  for (const unit of lookups.units) {
    for (const key of [unit.symbol, unit.name]) {
      const k = key.trim().toLowerCase();
      if (!k) continue;
      units.set(k, [...(units.get(k) ?? []), unit.id]);
    }
  }
  const taxes = new Map<string, string[]>();
  for (const tax of lookups.taxRates) {
    const labels = [tax.name, `${tax.name} ${tax.percentage}%`, `${tax.name} ${Number(tax.percentage).toFixed(0)}%`];
    for (const label of labels) {
      const k = label.trim().toLowerCase();
      taxes.set(k, [...(taxes.get(k) ?? []), tax.id]);
    }
  }
  return { units, taxes };
}

export function previewCatalogRows(
  rows: Array<{ rowNumber: number; cells: Record<string, string> }>,
  mapping: CatalogXlsxMapping,
  lookups: CatalogXlsxLookups,
  existing: { codes: Set<string>; skus: Set<string>; barcodes: Set<string> },
): CatalogXlsxPreviewRow[] {
  const maps = buildCatalogXlsxLookups(lookups);
  const workbookCodes = new Map<string, number>();
  const workbookSkus = new Map<string, number>();
  const workbookBarcodes = new Map<string, number>();
  const previews: CatalogXlsxPreviewRow[] = [];

  for (const row of rows) {
    const get = (field: CatalogXlsxField) => {
      const header = mapping[field];
      return header ? row.cells[header] ?? "" : "";
    };
    const errors: string[] = [];
    const type = parseType(get("type"));
    if (!type) errors.push("INVALID_TYPE");
    const code = get("code").trim().toUpperCase();
    if (!code) errors.push("CODE_REQUIRED");
    const name = get("name").trim();
    if (!name) errors.push("NAME_REQUIRED");
    const sale = parsePrice(get("salePrice"));
    if (!sale.ok) errors.push("INVALID_SALE_PRICE");
    const purchase = parsePrice(get("purchasePrice"));
    if (!purchase.ok) errors.push("INVALID_PURCHASE_PRICE");
    const track = parseBoolean(get("trackInventory"));
    if (!track.ok) errors.push("INVALID_TRACK_INVENTORY");
    const discount = parseBoolean(get("allowDiscount"));
    if (!discount.ok) errors.push("INVALID_ALLOW_DISCOUNT");
    const active = parseBoolean(get("active"));
    if (!active.ok) errors.push("INVALID_ACTIVE");

    const unitRaw = get("unit");
    let unitId: string | null | undefined;
    if (unitRaw) {
      const resolved = uniqueLookup([unitRaw], maps.units);
      if (!resolved) errors.push("UNRESOLVED_UNIT");
      else if (resolved === "AMBIGUOUS") errors.push("AMBIGUOUS_UNIT");
      else unitId = resolved;
    }

    const taxRaw = get("taxRate");
    let taxRateId: string | null | undefined;
    if (taxRaw) {
      const resolved = uniqueLookup([taxRaw], maps.taxes);
      if (!resolved) errors.push("UNRESOLVED_TAX_RATE");
      else if (resolved === "AMBIGUOUS") errors.push("AMBIGUOUS_TAX_RATE");
      else taxRateId = resolved;
    }

    const sku = get("sku").trim() || null;
    const barcode = get("barcode").trim() || null;

    if (code) {
      if (workbookCodes.has(code)) errors.push("DUPLICATE_CODE_IN_WORKBOOK");
      workbookCodes.set(code, row.rowNumber);
      if (existing.codes.has(code)) errors.push("CATALOG_ITEM_CODE_ALREADY_EXISTS");
    }
    if (sku) {
      if (workbookSkus.has(sku)) errors.push("DUPLICATE_SKU_IN_WORKBOOK");
      workbookSkus.set(sku, row.rowNumber);
      if (existing.skus.has(sku)) errors.push("CATALOG_ITEM_SKU_ALREADY_EXISTS");
    }
    if (barcode) {
      if (workbookBarcodes.has(barcode)) errors.push("DUPLICATE_BARCODE_IN_WORKBOOK");
      workbookBarcodes.set(barcode, row.rowNumber);
      if (existing.barcodes.has(barcode)) errors.push("CATALOG_ITEM_BARCODE_ALREADY_EXISTS");
    }

    const input = type && code && name && sale.ok && purchase.ok
      ? {
          type,
          code,
          name,
          nameAr: get("nameAr") || null,
          nameEn: get("nameEn") || null,
          salePrice: sale.value,
          purchasePrice: purchase.value,
          sku,
          barcode,
          unitId: unitId ?? null,
          taxRateId: taxRateId ?? null,
          description: get("description") || null,
          descriptionAr: get("descriptionAr") || null,
          descriptionEn: get("descriptionEn") || null,
          trackInventory: track.ok ? track.value : undefined,
          allowDiscount: discount.ok ? discount.value : undefined,
          notes: get("notes") || null,
          isActive: active.ok ? active.value : undefined,
        }
      : undefined;

    if (input) {
      const created = CatalogItem.create({ companyId: "preview", ...input });
      if (!created.isSuccess) errors.push(created.getError().code);
    }

    previews.push({
      rowNumber: row.rowNumber,
      values: {
        type: type ?? get("type"),
        code,
        name,
        salePrice: sale.ok ? sale.value : get("salePrice"),
      },
      valid: errors.length === 0,
      errors,
      input: errors.length === 0 ? input : undefined,
    });
  }
  return previews;
}

export async function buildCatalogTemplateBuffer(lookups: CatalogXlsxLookups) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VOKA";
  const sheet = workbook.addWorksheet("Catalog");
  sheet.columns = CATALOG_XLSX_FIELDS.map((field) => ({
    header: CATALOG_XLSX_HEADERS[field],
    key: field,
    width: 22,
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075985" } };
  const help = workbook.addWorksheet("Instructions");
  help.addRow(["Map Type, Code and Name. Sale Price may be empty. Units and tax rates must match tenant values."]);
  help.addRow([`Units: ${lookups.units.map((u) => u.symbol).slice(0, 20).join(", ")}`]);
  help.addRow([`Tax rates: ${lookups.taxRates.map((t) => `${t.name} ${t.percentage}%`).slice(0, 20).join(", ")}`]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildCatalogExportBuffer(
  items: Array<{
    type: string;
    code: string;
    name: string;
    nameAr?: string | null;
    nameEn?: string | null;
    salePrice: number | null;
    purchasePrice?: number | null;
    sku?: string | null;
    barcode?: string | null;
    unitLabel?: string | null;
    taxLabel?: string | null;
    description?: string | null;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    trackInventory?: boolean;
    allowDiscount?: boolean;
    isActive: boolean;
    notes?: string | null;
  }>,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VOKA";
  const sheet = workbook.addWorksheet("Catalog");
  sheet.columns = CATALOG_XLSX_FIELDS.map((field) => ({ header: CATALOG_XLSX_HEADERS[field], key: field, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  for (const item of items) {
    sheet.addRow({
      type: item.type,
      code: item.code,
      name: item.name,
      nameAr: item.nameAr ?? "",
      nameEn: item.nameEn ?? "",
      salePrice: item.salePrice,
      purchasePrice: item.purchasePrice ?? "",
      sku: item.sku ?? "",
      barcode: item.barcode ?? "",
      unit: item.unitLabel ?? "",
      taxRate: item.taxLabel ?? "",
      description: item.description ?? "",
      descriptionAr: item.descriptionAr ?? "",
      descriptionEn: item.descriptionEn ?? "",
      trackInventory: item.trackInventory ?? true,
      allowDiscount: item.allowDiscount ?? true,
      active: item.isActive,
      notes: item.notes ?? "",
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function loadExistingCatalogKeys(repository: CatalogItemRepository, companyId: string) {
  const list = new ListCatalogItems(repository);
  const codes = new Set<string>();
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await list.execute({ companyId, page, pageSize: 100 });
    totalPages = result.totalPages || 0;
    for (const item of result.items) {
      codes.add(item.code);
      if (item.sku) skus.add(item.sku);
      if (item.barcode) barcodes.add(item.barcode);
    }
    if (totalPages === 0) break;
    page += 1;
  }
  return { codes, skus, barcodes };
}

export async function commitCatalogRows(
  repository: CatalogItemRepository,
  companyId: string,
  rows: NonNullable<CatalogXlsxPreviewRow["input"]>[],
) {
  const create = new CreateCatalogItem(repository);
  const imported: string[] = [];
  for (const row of rows) {
    const result = await create.execute({ companyId, ...row });
    if (!result.isSuccess) {
      throw Object.assign(new Error(result.getError().code), { code: result.getError().code });
    }
    imported.push(result.getValue().id.toString());
  }
  return imported;
}

export function xlsxResponseHeaders(filename: string) {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
