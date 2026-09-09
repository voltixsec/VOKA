import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PrismaCatalogItemRepository, PrismaUnitRepository } from "@/features/catalog";
import {
  CATALOG_XLSX_MAX_BYTES,
  CATALOG_XLSX_MAX_ROWS,
  type CatalogXlsxLookups,
  type CatalogXlsxMapping,
  previewCatalogRows,
  readCatalogWorkbook,
  validateCatalogXlsxMapping,
  loadExistingCatalogKeys,
} from "@/features/catalog/application/xlsx/catalogXlsx";

export const catalogItemRepository = new PrismaCatalogItemRepository(prisma);
export const unitRepository = new PrismaUnitRepository(prisma);

export async function loadCatalogXlsxLookups(companyId: string): Promise<CatalogXlsxLookups> {
  const [units, taxRates] = await Promise.all([
    unitRepository.findAll({ companyId, isActive: true }),
    prisma.taxRate.findMany({
      where: { isActive: true, OR: [{ companyId }, { isSystem: true }, { companyId: null }] },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    units: units.map((unit: { id: { toString(): string }; symbol: string; name: string }) => ({
      id: unit.id.toString(),
      symbol: unit.symbol,
      name: unit.name,
    })),
    taxRates: taxRates.map((tax: { id: string; name: string; percentage: unknown }) => ({
      id: tax.id,
      name: tax.name,
      percentage: Number(tax.percentage),
    })),
  };
}

export async function parseCatalogWorkbookFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw ApiError.badRequest("CATALOG_XLSX_FILE_REQUIRED", "An .xlsx file is required.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw ApiError.badRequest("CATALOG_XLSX_FILE_TYPE", "Only .xlsx files are accepted.");
  }
  if (file.size > CATALOG_XLSX_MAX_BYTES) {
    throw ApiError.badRequest("CATALOG_XLSX_TOO_LARGE", "Workbook exceeds the 2MB limit.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await readCatalogWorkbook(buffer);
  } catch {
    throw ApiError.badRequest("CATALOG_XLSX_UNREADABLE", "Workbook could not be read.");
  }
  if (!parsed.headers.length) throw ApiError.badRequest("CATALOG_XLSX_NO_HEADERS", "Workbook has no header row.");
  return { parsed, buffer };
}

export async function parseCatalogUpload(form: FormData) {
  const { parsed } = await parseCatalogWorkbookFile(form);
  if (!parsed.rows.length) throw ApiError.badRequest("CATALOG_XLSX_NO_ROWS", "Workbook has no usable rows.");
  if (parsed.rows.length > CATALOG_XLSX_MAX_ROWS) {
    throw ApiError.badRequest("CATALOG_XLSX_TOO_MANY_ROWS", `At most ${CATALOG_XLSX_MAX_ROWS} rows can be imported.`);
  }
  const rawMapping = form.get("mapping");
  let mapping: CatalogXlsxMapping = {};
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try {
      mapping = JSON.parse(rawMapping) as CatalogXlsxMapping;
    } catch {
      throw ApiError.badRequest("CATALOG_XLSX_MAPPING_INVALID", "Column mapping is invalid.");
    }
  }
  const mappingErrors = validateCatalogXlsxMapping(mapping, parsed.headers);
  if (mappingErrors.length) {
    throw ApiError.badRequest("CATALOG_XLSX_MAPPING_INVALID", mappingErrors[0]);
  }
  return { parsed, mapping };
}

export async function previewUploadedCatalog(companyId: string, form: FormData) {
  const { parsed, mapping } = await parseCatalogUpload(form);
  const [lookups, existing] = await Promise.all([
    loadCatalogXlsxLookups(companyId),
    loadExistingCatalogKeys(catalogItemRepository, companyId),
  ]);
  const rows = previewCatalogRows(parsed.rows, mapping, lookups, existing);
  return {
    headers: parsed.headers,
    total: rows.length,
    valid: rows.filter((row) => row.valid).length,
    invalid: rows.filter((row) => !row.valid).length,
    rows,
  };
}
