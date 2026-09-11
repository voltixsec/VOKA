import type { ObservationReliability } from "./PdfObservations";
import { OBSERVATION_STATUS, type ObservationStatus } from "./PdfObservations";

/**
 * Phase 2A-6: governed EXCEL / STRUCTURED BOQ evidence model.
 *
 * This module owns the workbook evidence vocabulary and the conservative
 * structural rules that turn worksheet cells into table regions, column roles,
 * row roles, and observed structured BOQ line candidates. It holds no parser,
 * no file-format code, and no business rules about what a BOQ means
 * commercially: the inspector owns bytes, this module owns meaning.
 *
 * Hard rules, enforced by construction:
 * - NOTHING here is approved. A quantity is a workbook literal, never an
 *   approved engineering quantity; a rate is a workbook literal, never an
 *   approved commercial price; a line candidate is a candidate, never a
 *   requirement, quotation line, BOM item, or procurement requirement;
 * - a formula is PRESERVED, never evaluated. VOKA keeps the expression and the
 *   workbook's own cached result, and never claims to have recalculated
 *   anything. External links and remote references are never followed;
 * - units are preserved verbatim and never converted: no mm to m, no ft2 to
 *   m2, no UOM master-data resolution;
 * - currency comes from explicit evidence only. It is never inferred from the
 *   company country, tenant, timezone, supplier, customer, or workbook
 *   language, and no FX conversion exists anywhere in this model;
 * - provenance is workbook coordinates: sheet name, row, column, and exact
 *   range. A spreadsheet has no PDF page, so `pageNumber` is always null and
 *   no spreadsheet record may ever carry a page number;
 * - merged-cell context stays distinguishable from direct cell evidence: a
 *   merged header provides context to the rows below it, and the merged text
 *   is never copied into child cells as though it were physically present;
 * - hidden sheets, rows, and columns are inspected, but they always carry an
 *   explicit limitation and are never presented as equivalent to visible
 *   user-facing content;
 * - every structure is bounded. Exceeding a cap truncates deterministically and
 *   the truncation is disclosed; data is never silently dropped.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The distinct value kinds a workbook cell can hold. `FORMULA` means the cell
 * holds a formula with no readable cached result; `FORMULA_RESULT` means the
 * workbook also stored a result, which VOKA preserves without evaluating it.
 */
export const SPREADSHEET_CELL_TYPES = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "FORMULA",
  "FORMULA_RESULT",
  "ERROR",
  "BLANK",
] as const;
export type SpreadsheetCellType = (typeof SPREADSHEET_CELL_TYPES)[number];

const SPREADSHEET_CELL_TYPE_SET = new Set<string>(SPREADSHEET_CELL_TYPES);
export function isSpreadsheetCellType(value: string): value is SpreadsheetCellType {
  return SPREADSHEET_CELL_TYPE_SET.has(value);
}

export const SHEET_VISIBILITIES = ["VISIBLE", "HIDDEN", "VERY_HIDDEN"] as const;
export type SheetVisibility = (typeof SHEET_VISIBILITIES)[number];

export const TABLE_CLASSIFICATIONS = [
  "BOQ",
  "PRICE_SCHEDULE",
  "SCHEDULE",
  "GENERIC_TABLE",
  "UNKNOWN",
] as const;
export type TableRegionClassification = (typeof TABLE_CLASSIFICATIONS)[number];

const TABLE_CLASSIFICATION_SET = new Set<string>(TABLE_CLASSIFICATIONS);
export function isTableRegionClassification(value: string): value is TableRegionClassification {
  return TABLE_CLASSIFICATION_SET.has(value);
}

export const COLUMN_ROLES = [
  "ITEM_NUMBER",
  "DESCRIPTION",
  "UNIT",
  "QUANTITY",
  "RATE",
  "AMOUNT",
  "BRAND",
  "MANUFACTURER",
  "MODEL_OR_REFERENCE",
  "REMARKS",
  "SECTION_OR_DIVISION",
  "UNKNOWN",
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

const COLUMN_ROLE_SET = new Set<string>(COLUMN_ROLES);
export function isColumnRole(value: string): value is ColumnRole {
  return COLUMN_ROLE_SET.has(value);
}

export const ROW_ROLES = [
  "TITLE",
  "HEADER",
  "DATA",
  "SECTION",
  "SUBTOTAL",
  "TOTAL",
  "NOTE",
  "BLANK",
  "UNKNOWN",
] as const;
export type RowRole = (typeof ROW_ROLES)[number];

const ROW_ROLE_SET = new Set<string>(ROW_ROLES);
export function isRowRole(value: string): value is RowRole {
  return ROW_ROLE_SET.has(value);
}

/** Row roles that may become observed structured BOQ line candidates. */
export const DATA_BEARING_ROW_ROLES = ["DATA"] as const satisfies readonly RowRole[];

/** Region classifications whose DATA rows may become observed line candidates. */
export const LINE_BEARING_CLASSIFICATIONS = ["BOQ", "PRICE_SCHEDULE", "SCHEDULE"] as const satisfies readonly TableRegionClassification[];

const LINE_BEARING_CLASSIFICATION_SET = new Set<string>(LINE_BEARING_CLASSIFICATIONS);
export function isLineBearingClassification(value: TableRegionClassification): boolean {
  return LINE_BEARING_CLASSIFICATION_SET.has(value);
}

// ---------------------------------------------------------------------------
// Bounds. Every cap is a hard limit; exceeding it truncates and is disclosed.
// ---------------------------------------------------------------------------

/** Maximum workbook size accepted for inspection. Matches the upload policy. */
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
/** Maximum worksheets inspected per workbook. */
export const MAX_WORKSHEETS = 40;
/** Maximum rows examined per worksheet. */
export const MAX_USED_ROWS_PER_SHEET = 5_000;
/** Maximum columns examined per worksheet. */
export const MAX_USED_COLUMNS_PER_SHEET = 128;
/** Maximum cells retained across the whole workbook. */
export const MAX_CELLS_INSPECTED = 60_000;
/** Maximum table regions detected per worksheet. */
export const MAX_TABLE_REGIONS_PER_SHEET = 12;
/** Maximum columns considered inside one table region. */
export const MAX_REGION_COLUMNS = 64;
/** Maximum rows considered inside one table region. */
export const MAX_ROWS_PER_REGION = 2_000;
/** Maximum merged ranges inspected per worksheet. */
export const MAX_MERGED_RANGES_INSPECTED = 200;
/** Maximum header rows interpreted in one table region (spec: max 3). */
export const MAX_HEADER_ROWS = 3;
/** Maximum row-role records retained per region; counts stay complete. */
export const MAX_ROW_ROLES_PER_REGION = 200;
/** Maximum observed structured line candidates retained per sheet. */
export const MAX_BOQ_LINES_PER_SHEET = 400;
/** Maximum observed structured line candidates retained per workbook. */
export const MAX_BOQ_LINES_TOTAL = 1_200;
/** Maximum cell references retained on one line candidate. */
export const MAX_CELL_REFS_PER_LINE = 16;
/** Maximum characters retained for any single cell-derived text value. */
export const MAX_CELL_TEXT_CHARACTERS = 240;
/** Maximum characters retained for inherited section context. */
export const MAX_SECTION_CONTEXT_CHARACTERS = 120;
/** Maximum limitations retained per record. */
export const MAX_LIMITATIONS_PER_RECORD = 6;
/** Maximum limitations retained per worksheet. */
export const MAX_SHEET_LIMITATIONS = 8;
/** Maximum limitations retained per workbook. */
export const MAX_WORKBOOK_LIMITATIONS = 10;

/**
 * Spreadsheet provenance has no PDF page. This constant exists so every
 * spreadsheet record states the truth explicitly instead of leaving a
 * page-shaped hole that a later consumer might fill with an invented number.
 */
export const SPREADSHEET_PAGE_NUMBER: null = null;

export const SPREADSHEET_BASELINE_LIMITATION =
  "spreadsheet evidence carries sheet, row, column, and range provenance instead of page numbers; formulas were preserved and never recalculated, no unit or currency conversion was performed, and no quantity, rate, or amount is approved";

export const SPREADSHEET_LINE_BASELINE_LIMITATION =
  "observed structured BOQ line candidate: a workbook reading only, not a requirement, quotation line, BOM item, or approved quantity";

// ---------------------------------------------------------------------------
// Workbook coordinates
// ---------------------------------------------------------------------------

/** 1-based column number to spreadsheet letters: 1 -> A, 27 -> AA. */
export function columnLetterFromNumber(column: number): string {
  if (!Number.isInteger(column) || column < 1) return "";
  let remaining = column;
  let letters = "";
  while (remaining > 0) {
    const rest = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    remaining = Math.floor((remaining - rest - 1) / 26);
  }
  return letters;
}

/** Spreadsheet letters to a 1-based column number; null when unparseable. */
export function columnNumberFromLetter(letters: string): number | null {
  const cleaned = letters.trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/u.test(cleaned)) return null;
  let value = 0;
  for (const character of cleaned) value = value * 26 + (character.charCodeAt(0) - 64);
  return value;
}

/**
 * Sheet names containing spaces, operators, or quotes must be quoted in an A1
 * reference. Quoting is what makes `Electrical Works!A1` readable; skipping it
 * would produce a locator that does not resolve in the workbook.
 */
export function quoteSheetName(sheetName: string): string {
  if (sheetName.length === 0) return sheetName;
  if (/^[A-Za-z_][A-Za-z0-9_.]{0,30}$/u.test(sheetName)) return sheetName;
  return `'${sheetName.replace(/'/gu, "''")}'`;
}

/** "D17" from row 17, column 4. */
export function formatCellAddress(row: number, column: number): string {
  const letter = columnLetterFromNumber(column);
  if (!letter || !Number.isInteger(row) || row < 1) return "";
  return `${letter}${row}`;
}

/** "BOQ!D17". */
export function formatSheetCellRef(sheetName: string, row: number, column: number): string {
  const address = formatCellAddress(row, column);
  if (!address) return "";
  return `${quoteSheetName(sheetName)}!${address}`;
}

/** "A3:F3". */
export function formatRange(startRow: number, startColumn: number, endRow: number, endColumn: number): string {
  const start = formatCellAddress(startRow, startColumn);
  const end = formatCellAddress(endRow, endColumn);
  if (!start || !end) return "";
  return start === end ? start : `${start}:${end}`;
}

/** "BOQ!A3:F3". */
export function formatSheetRange(sheetName: string, startRow: number, startColumn: number, endRow: number, endColumn: number): string {
  const range = formatRange(startRow, startColumn, endRow, endColumn);
  if (!range) return "";
  return `${quoteSheetName(sheetName)}!${range}`;
}

// ---------------------------------------------------------------------------
// Cell value model
// ---------------------------------------------------------------------------

/**
 * A workbook value preserved as the workbook stored it. `value` is the raw
 * stored value; `displayText` is what the workbook would show. When the two
 * differ because a number format was applied, `displayFormatted` says so, and
 * when a format could not be applied faithfully the record carries a
 * limitation rather than a silently wrong rendering.
 */
export type SpreadsheetLiteral = {
  type: SpreadsheetCellType;
  value: string | number | boolean | null;
  displayText: string;
  displayFormatted: boolean;
  numberFormat: string | null;
  /** Verbatim formula expression; null unless this is a formula cell. */
  formula: string | null;
  /** The workbook's own stored result for a formula. Never recalculated. */
  cachedResult: string | number | boolean | null;
  cachedResultType: SpreadsheetCellType | null;
  limitations: string[];
};

export type SpreadsheetCellEvidence = {
  sheetName: string;
  sheetIndex: number;
  rowNumber: number;
  columnNumber: number;
  columnLetter: string;
  /** "D17" */
  cellAddress: string;
  /** "BOQ!D17" */
  cellRef: string;
  rawType: SpreadsheetCellType;
  rawValue: string | number | boolean | null;
  displayText: string;
  displayFormatted: boolean;
  numberFormat: string | null;
  formula: string | null;
  cachedResult: string | number | boolean | null;
  cachedResultType: SpreadsheetCellType | null;
  /** "BOQ!A3:F3" when the cell participates in a merged range. */
  mergedRange: string | null;
  /** True only for the top-left cell that physically holds the merged value. */
  isMergeAnchor: boolean;
  hiddenRow: boolean;
  hiddenColumn: boolean;
  reliability: ObservationReliability;
  limitations: string[];
};

export type MergedRangeEvidence = {
  sheetName: string;
  sheetIndex: number;
  /** "A3:F3" */
  range: string;
  /** "BOQ!A3:F3" */
  cellRef: string;
  anchorAddress: string;
  anchorRef: string;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  /** The literal stored in the anchor cell. Never copied onto child cells. */
  text: string;
  rawType: SpreadsheetCellType;
  hiddenRow: boolean;
  hiddenColumn: boolean;
  reliability: ObservationReliability;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Column and row role model
// ---------------------------------------------------------------------------

export type ColumnRoleAssignment = {
  columnNumber: number;
  columnLetter: string;
  role: ColumnRole;
  /**
   * Roles the same header text could plausibly support. Non-empty when the
   * header matched more than one role; a genuinely ambiguous header keeps
   * `UNKNOWN` as the role and names every candidate here instead of guessing.
   */
  alternatives: ColumnRole[];
  /** Verbatim header text as the workbook stores it; null when absent. */
  headerText: string | null;
  /** "BOQ!C6"; null when the column has no header cell. */
  headerCellRef: string | null;
  /** True when the header cell is a merged range rather than a single cell. */
  headerMerged: boolean;
  reliability: ObservationReliability;
  limitations: string[];
};

export type RowRoleAssignment = {
  rowNumber: number;
  role: RowRole;
  /** "BOQ!A17:F17" */
  cellRef: string;
  /** Verbatim text that drove the classification. Never normalized. */
  evidenceText: string | null;
  /** Plain reason a reviewer can check. */
  reason: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type TableRegionClassificationEvidence = {
  value: TableRegionClassification;
  reliability: ObservationReliability;
  /** 0..1 review signal, not a probability. */
  confidence: number;
  /** Plain reasons, each naming the evidence that supported the call. */
  evidence: string[];
  limitations: string[];
};

export type TableRegion = {
  id: string;
  sheetName: string;
  sheetIndex: number;
  /** "A6:F42" */
  range: string;
  /** "BOQ!A6:F42" */
  cellRef: string;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  /** Header rows when the region has a detectable one; null otherwise. */
  header: { startRow: number; endRow: number; rowCount: number; cellRef: string } | null;
  classification: TableRegionClassificationEvidence;
  columnRoles: ColumnRoleAssignment[];
  rowRoles: RowRoleAssignment[];
  /** Complete counts by role; the bounded `rowRoles` list may hold fewer. */
  rowRoleCounts: Partial<Record<RowRole, number>>;
  rowRolesTruncated: boolean;
  dataRowCount: number;
  reliability: ObservationReliability;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Observed structured BOQ line candidate
// ---------------------------------------------------------------------------

/**
 * One observed structured BOQ line candidate.
 *
 * It is what the workbook says on one row. It is never a Requirement, never a
 * QuotationLine, never a BOM item, and never a procurement requirement: there
 * is no promotion path from this record into governed state.
 */
export type BoqLineCandidate = {
  id: string;
  sheetName: string;
  sheetIndex: number;
  regionId: string;
  rowNumber: number;
  /** "BOQ!A17:F17" */
  cellRef: string;
  itemNumber: SpreadsheetLiteral | null;
  description: SpreadsheetLiteral | null;
  unit: SpreadsheetLiteral | null;
  quantity: SpreadsheetLiteral | null;
  /**
   * Numeric view of the quantity, present only when the workbook stored a
   * number. It is a convenience for review, never an approved quantity.
   */
  quantityNumber: number | null;
  rate: SpreadsheetLiteral | null;
  amount: SpreadsheetLiteral | null;
  brand: SpreadsheetLiteral | null;
  manufacturer: SpreadsheetLiteral | null;
  modelOrReference: SpreadsheetLiteral | null;
  remarks: SpreadsheetLiteral | null;
  /** Inherited section/division context, when a section row preceded this row. */
  sectionContext: string | null;
  /** "BOQ!A3:F3" — where the inherited section context physically lives. */
  sectionContextRef: string | null;
  /** True when any cell on the row carries a formula. Never evaluated. */
  hasFormula: boolean;
  /** Bounded list of exact cell references backing this line. */
  cellRefs: string[];
  /** Always present: the row is hidden in the workbook, or it is not. */
  hiddenRow: boolean;
  status: ObservationStatus;
  reliability: ObservationReliability;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Workbook model
// ---------------------------------------------------------------------------

export type WorksheetInspection = {
  sheetName: string;
  sheetIndex: number;
  visibility: SheetVisibility;
  /** "A1:F42"; null when the sheet holds no content. */
  usedRange: string | null;
  rowCount: number;
  columnCount: number;
  occupiedRowCount: number;
  cellCount: number;
  hiddenRowCount: number;
  hiddenColumnCount: number;
  mergedRanges: MergedRangeEvidence[];
  regions: TableRegion[];
  /** Occupied cells only. Blank cells are deliberately not retained. */
  cells: SpreadsheetCellEvidence[];
  truncated: boolean;
  limitations: string[];
};

export type WorkbookInspection = {
  format: "XLSX";
  sheetCount: number;
  visibleSheetCount: number;
  hiddenSheetCount: number;
  worksheets: WorksheetInspection[];
  cellsInspected: number;
  mergedRangeCount: number;
  truncated: boolean;
  limitations: string[];
};

/**
 * Bounded shape persisted in `SourceArtifact.extractedPages` for a workbook.
 *
 * It reuses the existing JSON column instead of adding a migration: version 3
 * keeps it distinct from the version-2 PDF page model, which ignores it. Only
 * structural counts and limitations are stored, never a cell dump, so a large
 * workbook cannot bloat the row.
 */
export type StoredSpreadsheetModel = {
  version: 3;
  kind: "XLSX";
  sheetCount: number;
  visibleSheetCount: number;
  hiddenSheetCount: number;
  limitations: string[];
  sheets: Array<{
    name: string;
    index: number;
    visibility: SheetVisibility;
    usedRange: string | null;
    regionCount: number;
    cellCount: number;
    hiddenRowCount: number;
    hiddenColumnCount: number;
  }>;
};

export function isStoredSpreadsheetModel(value: unknown): value is StoredSpreadsheetModel {
  const candidate = value as Partial<StoredSpreadsheetModel> | null;
  return Boolean(
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
    && candidate.version === 3 && candidate.kind === "XLSX" && Array.isArray(candidate.sheets),
  );
}

export type ObservedCurrencyEvidence = {
  /** ISO code when the workbook stated one; null when only a symbol was found. */
  code: string | null;
  /** Verbatim token the currency came from, e.g. "KD" or "USD". */
  token: string;
  /** Exact place the token was read from. */
  cellRef: string;
  /** What kind of place it was, e.g. "header" or "cell text". */
  source: string;
  limitations: string[];
};

export type SpreadsheetAnalysis = {
  format: "XLSX";
  workbook: WorkbookInspection;
  /** All regions across all sheets, in workbook order. */
  regions: TableRegion[];
  lines: BoqLineCandidate[];
  currency: ObservedCurrencyEvidence[];
  truncated: boolean;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Header vocabulary (English and Arabic)
// ---------------------------------------------------------------------------

/**
 * Header synonyms. Every entry is matched as a whole normalized token run, so
 * "Item No" reaches ITEM_NUMBER while a bare "Item" stays a single, weaker
 * match. Nothing here is fuzzy: an unrecognized header stays UNKNOWN.
 */
const COLUMN_ROLE_SYNONYMS: Record<Exclude<ColumnRole, "UNKNOWN">, readonly string[]> = {
  ITEM_NUMBER: ["item", "item no", "item no.", "item number", "item #", "no", "no.", "number", "#", "sr", "sr.", "sr no", "s/n", "seq", "line", "line no", "رقم البند", "البند", "رقم", "رقم التسلسل", "م"],
  DESCRIPTION: ["description", "item description", "description of work", "scope", "scope of work", "work description", "particulars", "activity", "بيان", "الوصف", "وصف البند", "وصف الأعمال", "البيان"],
  UNIT: ["unit", "uom", "unit of measure", "unit of measurement", "measure", "الوحدة", "وحدة القياس"],
  QUANTITY: ["qty", "qty.", "quantity", "qnty", "count", "الكمية", "العدد"],
  RATE: ["rate", "unit rate", "unit price", "price", "unit cost", "cost", "price/unit", "السعر", "سعر الوحدة", "سعر"],
  AMOUNT: ["amount", "total amount", "value", "total value", "total", "line total", "net amount", "المبلغ", "الإجمالي", "القيمة"],
  BRAND: ["brand", "make", "trade", "trade name", "الماركة", "العلامة التجارية"],
  MANUFACTURER: ["manufacturer", "mfr", "mfr.", "manufacture", "producer", "vendor", "المصنع", "الشركة المصنعة", "المنتج"],
  MODEL_OR_REFERENCE: ["model", "model no", "model no.", "model number", "reference", "ref", "ref.", "ref no", "part no", "part number", "cat no", "catalogue no", "الموديل", "الطراز", "المرجع", "رقم القطعة"],
  REMARKS: ["remarks", "remark", "notes", "note", "comments", "comment", "ملاحظات", "ملاحظة"],
  SECTION_OR_DIVISION: ["division", "section", "category", "trade", "group", "القسم", "التصنيف", "المجموعة"],
};

/** Normalizes header text for matching: case-folded, punctuation-flattened. */
export function normalizeHeaderText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ً-ْ]/gu, "")
    .replace(/[•·_/\\|()[\]{}:;,.#!?"'*&+=~^$@-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

/**
 * Maps header text onto a column role.
 *
 * Conservative by design: the longest matching synonym wins, and when two
 * different roles match with the same strength the header is genuinely
 * ambiguous, so the role stays UNKNOWN and every candidate is named in
 * `alternatives`. A weak or absent header never produces a guess.
 */
export function classifyColumnRole(headerText: string | null | undefined): {
  role: ColumnRole;
  alternatives: ColumnRole[];
  evidence: string;
  reliability: ObservationReliability;
} {
  const raw = typeof headerText === "string" ? headerText : "";
  const normalized = normalizeHeaderText(raw);
  if (!normalized) {
    return { role: "UNKNOWN", alternatives: [], evidence: "the column has no header text", reliability: "LOW" };
  }
  const matches: Array<{ role: Exclude<ColumnRole, "UNKNOWN">; length: number; synonym: string }> = [];
  for (const [role, synonyms] of Object.entries(COLUMN_ROLE_SYNONYMS) as Array<[Exclude<ColumnRole, "UNKNOWN">, readonly string[]]>) {
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeHeaderText(synonym);
      if (!normalizedSynonym) continue;
      const whole = normalized === normalizedSynonym;
      const word = new RegExp(`(^|\\s)${escapeRegExp(normalizedSynonym)}(\\s|$)`, "u").test(normalized);
      if (whole || word) matches.push({ role, length: normalizedSynonym.length, synonym });
    }
  }
  if (!matches.length) {
    return { role: "UNKNOWN", alternatives: [], evidence: `the header text "${raw}" does not match any known column role`, reliability: "LOW" };
  }
  const uniqueByRole = new Map<Exclude<ColumnRole, "UNKNOWN">, number>();
  for (const match of matches) {
    const best = uniqueByRole.get(match.role);
    if (best === undefined || match.length > best) uniqueByRole.set(match.role, match.length);
  }
  const ranked = [...uniqueByRole.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0]!;
  const second = ranked[1];
  if (second && second[1] === top[1]) {
    const tied = ranked.filter((entry) => entry[1] === top[1]).map((entry) => entry[0]);
    return {
      role: "UNKNOWN",
      alternatives: tied,
      evidence: `the header text "${raw}" matches ${tied.length} column roles equally, so no single role was chosen`,
      reliability: "LOW",
    };
  }
  const alternatives = ranked.slice(1).filter((entry) => entry[1] < top[1]).map((entry) => entry[0]);
  return {
    role: top[0],
    alternatives,
    evidence: `the header text "${raw}" matches the ${top[0]} column role`,
    reliability: top[1] >= 6 ? "HIGH" : "MEDIUM",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// ---------------------------------------------------------------------------
// Row role classification
// ---------------------------------------------------------------------------

const NOTE_MARKERS = ["note", "notes", "note:", "notes:", "general note", "ملاحظة", "ملاحظات", "ملاحظة:", "ملاحظات:"];
const SUBTOTAL_MARKERS = ["subtotal", "sub total", "sub-total", "total carried forward", "carried forward", "brought forward", "c/f", "b/f", "المجموع الفرعي", "منقول", "مرحّل", "مرحل"];
const TOTAL_MARKERS = ["total", "grand total", "net total", "final total", "المجموع", "الإجمالي", "الإجمالي العام", "المجموع الكلي"];

/**
 * Conservatively classifies one worksheet row.
 *
 * Sections, titles, subtotals, totals, and notes are recognized so they never
 * masquerade as item lines. When a row's evidence is weak the role stays
 * UNKNOWN rather than being forced into DATA.
 */
export function classifyRowRole(input: {
  /** Display text of each occupied cell on the row, in column order. */
  texts: string[];
  /** Raw cell types aligned with `texts`. */
  types?: SpreadsheetCellType[];
  /** True when the row's only occupied cell is a wide merged range. */
  mergedTitle?: boolean;
  /** Header signature of the region, for repeated-header detection. */
  headerSignature?: string[] | null;
}): { role: RowRole; evidence: string | null; reason: string; reliability: ObservationReliability } {
  const texts = input.texts.map((text) => text.trim()).filter((text) => text.length > 0);
  if (texts.length === 0) {
    return { role: "BLANK", evidence: null, reason: "the row has no occupied cells", reliability: "HIGH" };
  }
  const joined = texts.join(" ").trim();
  const normalized = normalizeHeaderText(joined);
  // Repeated headers are checked before totals so a printed header that
  // happens to contain the word "total" is still recognized as a header.
  if (input.headerSignature?.length) {
    const signature = input.headerSignature.map((text) => normalizeHeaderText(text)).filter((text) => text.length > 0);
    if (signature.length && signature.length === texts.length && signature.every((text, index) => text === normalizeHeaderText(texts[index] ?? ""))) {
      return { role: "HEADER", evidence: joined, reason: "the row repeats the header row of its table region", reliability: "HIGH" };
    }
  }
  if (matchesMarker(normalized, SUBTOTAL_MARKERS)) {
    return { role: "SUBTOTAL", evidence: joined, reason: "the row carries an explicit subtotal or carried-forward marker", reliability: "HIGH" };
  }
  if (matchesMarker(normalized, TOTAL_MARKERS)) {
    return { role: "TOTAL", evidence: joined, reason: "the row carries an explicit total marker", reliability: "HIGH" };
  }
  if (matchesMarker(normalized, NOTE_MARKERS)) {
    return { role: "NOTE", evidence: joined, reason: "the row is explicitly labelled as a note", reliability: "MEDIUM" };
  }
  if (input.mergedTitle) {
    return { role: "TITLE", evidence: joined, reason: "the row is a single wide merged range", reliability: "MEDIUM" };
  }
  if (isSectionLikeRow(texts, normalized)) {
    return { role: "SECTION", evidence: joined, reason: "the row reads as a section or division heading with no item data", reliability: "MEDIUM" };
  }
  const numericCells = (input.types ?? []).filter((type) => type === "NUMBER" || type === "FORMULA" || type === "FORMULA_RESULT").length;
  if (texts.length >= 2 && numericCells >= 1) {
    return { role: "DATA", evidence: joined, reason: "the row holds a text column plus at least one numeric, rate, or amount cell", reliability: "MEDIUM" };
  }
  if (texts.length >= 3) {
    return { role: "DATA", evidence: joined, reason: "the row occupies three or more columns of a table region", reliability: "LOW" };
  }
  return { role: "UNKNOWN", evidence: joined, reason: "the row has too little evidence to be classified confidently", reliability: "LOW" };
}

function matchesMarker(normalized: string, markers: readonly string[]): boolean {
  for (const marker of markers) {
    const normalizedMarker = normalizeHeaderText(marker);
    if (!normalizedMarker) continue;
    if (normalized === normalizedMarker) return true;
    if (new RegExp(`(^|\\s)${escapeRegExp(normalizedMarker)}(\\s|$)`, "u").test(normalized)) return true;
  }
  return false;
}

/**
 * A section row is a heading, not an item: it carries no item number, no
 * quantity, and no rate. It is recognized only when the row is short, reads as
 * a label, and carries an explicit division/section marker or an Arabic section
 * phrase, or when it is short, has no numeric cell at all, and is styled as a
 * heading by being written without lowercase letters.
 */
function isSectionLikeRow(texts: string[], normalized: string): boolean {
  if (texts.length > 2) return false;
  const first = texts[0] ?? "";
  if (first.length === 0 || first.length > 90) return false;
  if (/\d/u.test(first) && /^[\d\s.,%+-]+$/u.test(first)) return false;
  if (/^(division|section|category|trade|group)\b/u.test(normalized)) return true;
  // Arabic has no word boundary in the Latin sense, so the prefix is matched
  // directly: "أعمال الكهرباء" (electrical works) is a section heading.
  if (/^(أعمال|قسم|نظام|بند)/u.test(normalized)) return true;
  if (/[\u0600-\u06FF]/u.test(first)) return false;
  const letters = first.replace(/[^A-Za-z]/gu, "");
  if (letters.length < 3) return false;
  return first === first.toUpperCase();
}

// ---------------------------------------------------------------------------
// Table classification
// ---------------------------------------------------------------------------

/**
 * Classifies a table region from its column roles alone.
 *
 * The filename is deliberately not an input: calling a sheet a BOQ because the
 * file is named "BOQ.xlsx" is exactly the inference this phase refuses to make.
 */
export function classifyTableRegion(input: {
  roles: ColumnRole[];
  dataRowCount: number;
  headerTexts: string[];
}): TableRegionClassificationEvidence {
  const present = new Set<ColumnRole>(input.roles.filter((role) => role !== "UNKNOWN"));
  const has = (role: ColumnRole) => present.has(role);
  const evidence: string[] = [];
  const limitations: string[] = [];
  if (!present.size) {
    return {
      value: "UNKNOWN",
      reliability: "LOW",
      confidence: 0,
      evidence: ["no column in the region carried a recognizable header role"],
      limitations: [...limitations, "the region was not classified because no column role could be read from its headers"],
    };
  }
  evidence.push(`recognized column roles: ${[...present].join(", ")}`);
  if (input.dataRowCount === 0) limitations.push("the region carries no data rows");

  const coreQuantity = has("QUANTITY");
  const coreDescription = has("DESCRIPTION");
  const coreUnit = has("UNIT");
  const itemNumber = has("ITEM_NUMBER");
  const commercial = has("RATE") || has("AMOUNT");

  if (coreDescription && coreQuantity && (coreUnit || itemNumber)) {
    return {
      value: "BOQ",
      reliability: coreDescription && coreQuantity && coreUnit && itemNumber ? "HIGH" : "MEDIUM",
      confidence: coreDescription && coreQuantity && coreUnit && itemNumber ? 0.9 : 0.7,
      evidence: [...evidence, "the region carries description, quantity, and unit or item-number columns, which is strong BOQ structure"],
      limitations,
    };
  }
  if (coreDescription && commercial) {
    return {
      value: "PRICE_SCHEDULE",
      reliability: coreQuantity ? "MEDIUM" : "LOW",
      confidence: coreQuantity ? 0.7 : 0.5,
      evidence: [...evidence, "the region carries description and rate/amount columns but no quantity and unit pair, which reads as a price schedule"],
      limitations: [...limitations, "no quantity and unit pair was found, so this was not classified as a BOQ"],
    };
  }
  if (itemNumber && coreDescription) {
    return {
      value: "SCHEDULE",
      reliability: "MEDIUM",
      confidence: 0.6,
      evidence: [...evidence, "the region carries item-number and description columns, which reads as a schedule"],
      limitations: [...limitations, "no quantity column was found, so this was not classified as a BOQ"],
    };
  }
  if (present.size >= 2) {
    return {
      value: "GENERIC_TABLE",
      reliability: "LOW",
      confidence: 0.4,
      evidence: [...evidence, "the region carries recognizable columns but not a BOQ, price-schedule, or schedule structure"],
      limitations: [...limitations, "the structure was too weak for a stronger classification"],
    };
  }
  return {
    value: "UNKNOWN",
    reliability: "LOW",
    confidence: 0.2,
    evidence: [...evidence, "only one column role was recognized"],
    limitations: [...limitations, "a single recognized column is not enough to classify the region"],
  };
}

// ---------------------------------------------------------------------------
// Currency: explicit evidence only
// ---------------------------------------------------------------------------

const CURRENCY_TOKENS: ReadonlyArray<{ token: string; code: string; symbol: boolean }> = [
  { token: "USD", code: "USD", symbol: false },
  { token: "KWD", code: "KWD", symbol: false },
  { token: "EUR", code: "EUR", symbol: false },
  { token: "GBP", code: "GBP", symbol: false },
  { token: "SAR", code: "SAR", symbol: false },
  { token: "AED", code: "AED", symbol: false },
  { token: "QAR", code: "QAR", symbol: false },
  { token: "BHD", code: "BHD", symbol: false },
  { token: "OMR", code: "OMR", symbol: false },
  { token: "EGP", code: "EGP", symbol: false },
  { token: "INR", code: "INR", symbol: false },
  { token: "$", code: "USD", symbol: true },
  { token: "US$", code: "USD", symbol: true },
  { token: "€", code: "EUR", symbol: true },
  { token: "£", code: "GBP", symbol: true },
  { token: "KD", code: "KWD", symbol: true },
  { token: "د.ك", code: "KWD", symbol: true },
  { token: "د.ك.", code: "KWD", symbol: true },
  { token: "SR", code: "SAR", symbol: true },
  { token: "ر.س", code: "SAR", symbol: true },
  { token: "د.إ", code: "AED", symbol: true },
];

/**
 * Finds currency evidence in a header or cell literal.
 *
 * Only an explicit ISO code or an explicit currency token counts. Currency is
 * never inferred from the company country, the tenant, the timezone, a
 * supplier, a customer, or the workbook language, and no conversion is ever
 * performed.
 */
export function detectExplicitCurrency(text: string | null | undefined): {
  code: string | null;
  token: string | null;
  evidence: string;
} | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const normalized = text.replace(/[\u0640]/gu, "").toLocaleUpperCase();
  for (const entry of CURRENCY_TOKENS) {
    const token = entry.token.toLocaleUpperCase();
    if (entry.symbol) {
      if (normalized.includes(token)) return { code: entry.code, token: entry.token, evidence: `the text states the currency token ${entry.token}` };
      continue;
    }
    if (new RegExp(`(^|[^A-Z])${escapeRegExp(token)}([^A-Z]|$)`, "u").test(normalized)) {
      return { code: entry.code, token: entry.token, evidence: `the text states the currency code ${entry.token}` };
    }
  }
  const arabicCode = normalized.match(/\b(KWD|USD|EUR|SAR|AED)\b/u);
  if (arabicCode) return { code: arabicCode[1]!, token: arabicCode[1]!, evidence: `the text states the currency code ${arabicCode[1]!}` };
  return null;
}

// ---------------------------------------------------------------------------
// Numeric view of an observed literal (never a conversion)
// ---------------------------------------------------------------------------

/**
 * Numeric representation of a workbook literal, present only when the workbook
 * itself stored a number. A display string such as "1,250" is parsed as a
 * plain thousands-separated number; anything else returns null rather than
 * being coerced into a quantity.
 */
export function numericViewOf(literal: SpreadsheetLiteral | null): number | null {
  if (!literal) return null;
  if (literal.type === "NUMBER" && typeof literal.value === "number" && Number.isFinite(literal.value)) return literal.value;
  if (literal.type === "FORMULA_RESULT" && typeof literal.cachedResult === "number" && Number.isFinite(literal.cachedResult)) return literal.cachedResult;
  if (literal.type === "TEXT" && typeof literal.value === "string") {
    const cleaned = literal.value.trim().replace(/[\u066C,]/gu, "");
    if (!/^-?\d+(\.\d+)?$/u.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

export function emptySpreadsheetLiteral(): SpreadsheetLiteral {
  return {
    type: "BLANK",
    value: null,
    displayText: "",
    displayFormatted: false,
    numberFormat: null,
    formula: null,
    cachedResult: null,
    cachedResultType: null,
    limitations: [],
  };
}
