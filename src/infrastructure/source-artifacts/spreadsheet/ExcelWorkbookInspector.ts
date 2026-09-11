import ExcelJS from "exceljs";
import {
  MAX_CELLS_INSPECTED,
  MAX_CELL_TEXT_CHARACTERS,
  MAX_LIMITATIONS_PER_RECORD,
  MAX_MERGED_RANGES_INSPECTED,
  MAX_SHEET_LIMITATIONS,
  MAX_TABLE_REGIONS_PER_SHEET,
  MAX_USED_COLUMNS_PER_SHEET,
  MAX_USED_ROWS_PER_SHEET,
  MAX_WORKBOOK_BYTES,
  MAX_WORKBOOK_LIMITATIONS,
  MAX_WORKSHEETS,
  columnLetterFromNumber,
  columnNumberFromLetter,
  formatCellAddress,
  formatRange,
  formatSheetCellRef,
  formatSheetRange,
  type MergedRangeEvidence,
  type ObservationReliability,
  type SheetVisibility,
  type SpreadsheetCellEvidence,
  type SpreadsheetCellType,
  type WorkbookInspection,
  type WorksheetInspection,
} from "@/src/domain/source-artifact";
import { literalTextOf, renderCellDisplayText } from "./NumberFormatRenderer";
import { hasOle2Signature, hasZipSignature, listZipEntries, readZipEntryText } from "./ZipContainerReader";

/**
 * Phase 2A-6: bounded Excel workbook inspector.
 *
 * This is the only place in VOKA where spreadsheet bytes are read. ExcelJS
 * lives here and nowhere else: domain and application types never see a
 * worksheet object, only the bounded evidence model defined in the domain.
 *
 * Hard rules:
 * - VOKA never calculates anything. A formula is captured as the expression
 *   the workbook stored plus the workbook's own cached result, and nothing is
 *   ever evaluated, recalculated, or verified;
 * - no macro, VBA project, external workbook link, DDE reference, or remote
 *   formula is opened. Detecting one adds a limitation; following one is not a
 *   code path that exists;
 * - no external executable, no LibreOffice, no Office automation;
 * - the format decision comes from evidence (container signature plus the
 *   OOXML content-types declaration), never from the file extension alone;
 * - every structure is bounded by the limits below. Crossing a cap truncates
 *   deterministically and the truncation is disclosed, so a hostile or simply
 *   huge workbook cannot expand memory or runtime without limit.
 */

export const SPREADSHEET_FORMATS = ["XLSX", "XLS", "XLSB", "XLSM", "OVERSIZED", "NOT_A_WORKBOOK", "UNKNOWN"] as const;
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number];

/** Formats VOKA can actually inspect in this phase. */
export const SUPPORTED_SPREADSHEET_FORMATS: readonly SpreadsheetFormat[] = ["XLSX"];

export type SpreadsheetFormatDecision = {
  format: SpreadsheetFormat;
  supported: boolean;
  /** Bounded plain-language evidence behind the decision. */
  evidence: string[];
  /** Plain-language reason, safe to show a user or hand to the assistant. */
  reason: string;
  limitations: string[];
};

export class SpreadsheetInspectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SpreadsheetInspectionError";
  }
}

export type SpreadsheetInspectionLimits = {
  maxWorkbookBytes: number;
  maxWorksheets: number;
  maxUsedRowsPerSheet: number;
  maxUsedColumnsPerSheet: number;
  maxCellsInspected: number;
  maxMergedRangesInspected: number;
  /** Maximum table regions analyzed on one worksheet. */
  maxTableRegionsPerSheet: number;
};

export const DEFAULT_SPREADSHEET_LIMITS: SpreadsheetInspectionLimits = {
  maxWorkbookBytes: MAX_WORKBOOK_BYTES,
  maxWorksheets: MAX_WORKSHEETS,
  maxUsedRowsPerSheet: MAX_USED_ROWS_PER_SHEET,
  maxUsedColumnsPerSheet: MAX_USED_COLUMNS_PER_SHEET,
  maxCellsInspected: MAX_CELLS_INSPECTED,
  maxMergedRangesInspected: MAX_MERGED_RANGES_INSPECTED,
  maxTableRegionsPerSheet: MAX_TABLE_REGIONS_PER_SHEET,
};

const XLSX_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const XLSX_TEMPLATE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml";
const XLSM_MAIN_CONTENT_TYPE = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
const XLSB_MAIN_CONTENT_TYPE = "application/vnd.ms-excel.sheet.binary.macroEnabled.main+xml";

function extensionOf(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const match = /\.([A-Za-z0-9]{1,8})$/u.exec(filename.trim());
  return match ? match[1]!.toLocaleLowerCase() : null;
}

/**
 * Decides what a spreadsheet attachment actually is.
 *
 * Extension and MIME type are recorded as corroborating evidence only: the
 * decision itself rests on the ZIP signature and the OOXML content-types part,
 * so a renamed file cannot talk its way into the parser and a real workbook
 * cannot be rejected because a browser declared an odd type.
 */
export function detectSpreadsheetFormat(input: {
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
}): SpreadsheetFormatDecision {
  const { bytes } = input;
  const evidence: string[] = [];
  const limitations: string[] = [];
  const extension = extensionOf(input.filename);
  if (extension) evidence.push(`the file name ends in .${extension}`);
  if (input.mimeType) evidence.push(`the declared MIME type is ${input.mimeType}`);

  const decide = (format: SpreadsheetFormat, supported: boolean, reason: string, extra: string[] = []): SpreadsheetFormatDecision => ({
    format,
    supported,
    evidence,
    reason,
    limitations: [...new Set([...limitations, ...extra])].slice(0, MAX_WORKBOOK_LIMITATIONS),
  });

  if (bytes.length === 0) return decide("NOT_A_WORKBOOK", false, "the file is empty, so there is no workbook to inspect");
  if (hasOle2Signature(bytes)) {
    return decide("XLS", false, "the file is a legacy binary .xls workbook; VOKA inspects the modern .xlsx format only");
  }
  if (!hasZipSignature(bytes)) {
    return decide("NOT_A_WORKBOOK", false, "the file does not begin with a ZIP container signature, so it is not an .xlsx workbook");
  }
  evidence.push("the bytes begin with a ZIP container signature");
  if (bytes.length > MAX_WORKBOOK_BYTES) {
    return decide("OVERSIZED", false, `the workbook is ${bytes.length} bytes, above the ${MAX_WORKBOOK_BYTES} byte inspection limit, so it was not opened`);
  }

  const listing = listZipEntries(bytes);
  limitations.push(...listing.limitations);
  const contentTypes = readZipEntryText(bytes, "[Content_Types].xml");
  if (!contentTypes) {
    return decide("UNKNOWN", false, "the ZIP container has no readable OOXML content-types part, so its workbook structure could not be confirmed");
  }
  limitations.push(...contentTypes.limitations);
  const declared = contentTypes.text;

  if (listing.entries.some((entry) => /^word\//u.test(entry))) {
    return decide("NOT_A_WORKBOOK", false, "the container is a Word document, not a workbook");
  }
  if (listing.entries.some((entry) => /^ppt\//u.test(entry))) {
    return decide("NOT_A_WORKBOOK", false, "the container is a PowerPoint presentation, not a workbook");
  }
  if (declared.includes(XLSB_MAIN_CONTENT_TYPE)) {
    return decide("XLSB", false, "the workbook uses the binary .xlsb format; VOKA inspects the standard .xlsx format only");
  }
  if (declared.includes(XLSM_MAIN_CONTENT_TYPE)) {
    return decide("XLSM", false, "the workbook is macro-enabled (.xlsm); VOKA does not open macro-enabled workbooks and never executes macros");
  }
  if (declared.includes(XLSX_TEMPLATE_CONTENT_TYPE)) {
    limitations.push("the container declares a spreadsheet template rather than a plain workbook");
    return decide("XLSX", true, "the container declares an OOXML spreadsheet workbook structure", collectWorkbookLimitations(listing.entries));
  }
  if (!declared.includes(XLSX_MAIN_CONTENT_TYPE)) {
    return decide("NOT_A_WORKBOOK", false, "the container does not declare an OOXML spreadsheet workbook part");
  }
  evidence.push("the container declares an OOXML spreadsheet workbook part");
  return decide("XLSX", true, "the container declares an OOXML spreadsheet workbook structure", collectWorkbookLimitations(listing.entries));
}

/**
 * Container-level safety disclosures. Seeing a macro project or an external
 * link is evidence; opening one is not a behaviour this module has.
 */
function collectWorkbookLimitations(entries: string[]): string[] {
  const limitations: string[] = [];
  if (entries.some((entry) => /^xl\/vbaProject\.bin$/u.test(entry))) {
    limitations.push("the workbook declares a VBA project; no macro was read or executed");
  }
  const externalLinks = entries.filter((entry) => /^xl\/externalLinks\//u.test(entry));
  if (externalLinks.length) {
    limitations.push(`the workbook declares ${externalLinks.length} external link part(s); no external workbook link was followed and no remote formula was resolved`);
  }
  if (entries.some((entry) => /^xl\/connections\//u.test(entry))) {
    limitations.push("the workbook declares external data connections; none was opened");
  }
  return limitations;
}

// ---------------------------------------------------------------------------
// Workbook inspection
// ---------------------------------------------------------------------------

type CellBudget = { remaining: number };

/**
 * Parses an .xlsx workbook into the bounded evidence model.
 *
 * Throws `SpreadsheetInspectionError` when the format is unsupported or the
 * bytes cannot be parsed safely: a caller must never be handed a half-read
 * workbook that looks like a complete one.
 */
export async function inspectXlsxWorkbook(
  bytes: Uint8Array,
  options: { limits?: Partial<SpreadsheetInspectionLimits>; filename?: string | null; mimeType?: string | null } = {},
): Promise<WorkbookInspection> {
  const limits: SpreadsheetInspectionLimits = { ...DEFAULT_SPREADSHEET_LIMITS, ...(options.limits ?? {}) };
  const decision = detectSpreadsheetFormat({ bytes, filename: options.filename, mimeType: options.mimeType });
  if (!decision.supported) throw new SpreadsheetInspectionError("SPREADSHEET_FORMAT_UNSUPPORTED", decision.reason);
  if (bytes.length > limits.maxWorkbookBytes) {
    throw new SpreadsheetInspectionError("SPREADSHEET_OVERSIZED", `the workbook is ${bytes.length} bytes, above the ${limits.maxWorkbookBytes} byte inspection limit`);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new SpreadsheetInspectionError("SPREADSHEET_UNREADABLE", `the workbook could not be parsed safely (${reason})`);
  }

  const sheets = workbook.worksheets ?? [];
  const limitations: string[] = [...decision.limitations];
  const worksheets: WorksheetInspection[] = [];
  const budget: CellBudget = { remaining: limits.maxCellsInspected };
  let truncated = false;
  let cellsInspected = 0;
  let mergedRangeCount = 0;

  if (sheets.length > limits.maxWorksheets) {
    truncated = true;
    limitations.push(`only the first ${limits.maxWorksheets} of ${sheets.length} worksheets were inspected`);
  }
  for (let index = 0; index < Math.min(sheets.length, limits.maxWorksheets); index += 1) {
    const inspected = inspectWorksheet(sheets[index]!, index + 1, limits, budget);
    worksheets.push(inspected);
    cellsInspected += inspected.cellCount;
    mergedRangeCount += inspected.mergedRanges.length;
    if (budget.remaining <= 0 && index + 1 < sheets.length) {
      truncated = true;
      limitations.push(`the workbook reached the ${limits.maxCellsInspected} cell inspection cap, so later worksheets were not inspected`);
      break;
    }
  }
  // A worksheet truncated by the inspection bounds makes the workbook reading
  // partial, so the workbook carries the flag too: a consumer reading only the
  // workbook summary must still learn the inspection was bounded.
  if (worksheets.some((sheet) => sheet.truncated)) {
    truncated = true;
    limitations.push("one or more worksheets were truncated by the inspection bounds");
  }
  const visibleSheetCount = sheets.filter((sheet) => visibilityOf(sheet.state) === "VISIBLE").length;
  const hiddenSheetCount = sheets.length - visibleSheetCount;
  if (hiddenSheetCount > 0) {
    limitations.push(`${hiddenSheetCount} worksheet(s) are hidden in the workbook; their contents are retained as hidden evidence only`);
  }
  return {
    format: "XLSX",
    sheetCount: sheets.length,
    visibleSheetCount,
    hiddenSheetCount,
    worksheets,
    cellsInspected,
    mergedRangeCount,
    truncated,
    limitations: [...new Set(limitations)].slice(0, MAX_WORKBOOK_LIMITATIONS),
  };
}

function visibilityOf(state: string | undefined): SheetVisibility {
  if (state === "hidden") return "HIDDEN";
  if (state === "veryHidden") return "VERY_HIDDEN";
  return "VISIBLE";
}

function inspectWorksheet(
  sheet: ExcelJS.Worksheet,
  sheetIndex: number,
  limits: SpreadsheetInspectionLimits,
  budget: CellBudget,
): WorksheetInspection {
  const sheetName = sheet.name;
  const limitations: string[] = [];
  const declaredRows = Math.max(0, sheet.rowCount ?? 0);
  const declaredColumns = Math.max(0, sheet.columnCount ?? 0);
  const rowCount = Math.min(declaredRows, limits.maxUsedRowsPerSheet);
  const columnCount = Math.min(declaredColumns, limits.maxUsedColumnsPerSheet);
  if (declaredRows > limits.maxUsedRowsPerSheet) limitations.push(`only the first ${limits.maxUsedRowsPerSheet} of ${declaredRows} rows were inspected`);
  if (declaredColumns > limits.maxUsedColumnsPerSheet) limitations.push(`only the first ${limits.maxUsedColumnsPerSheet} of ${declaredColumns} columns were inspected`);
  const visibility = visibilityOf(sheet.state);
  if (visibility !== "VISIBLE") {
    limitations.push(`this worksheet is ${visibility === "VERY_HIDDEN" ? "very hidden" : "hidden"} in the workbook, so its contents are hidden evidence, not user-facing content`);
  }

  const hiddenColumns = new Set<number>();
  for (let column = 1; column <= columnCount; column += 1) {
    if (sheet.getColumn(column)?.hidden === true) hiddenColumns.add(column);
  }
  if (hiddenColumns.size) limitations.push(`${hiddenColumns.size} column(s) are hidden on this worksheet`);

  const declaredMerges = (sheet.model?.merges ?? []) as string[];
  const mergedRanges: MergedRangeEvidence[] = [];
  const mergeByCell = new Map<string, MergedRangeEvidence>();
  let mergesTruncated = false;
  for (const merge of declaredMerges) {
    if (mergedRanges.length >= limits.maxMergedRangesInspected) {
      mergesTruncated = true;
      break;
    }
    const parsed = parseMergedRange(merge, sheetName, sheetIndex);
    if (!parsed) continue;
    mergedRanges.push(parsed.range);
    // Only a merge whose anchor is inside the inspected window is registered:
    // an anchor outside the window means the merge cannot be represented
    // faithfully here, so its in-window cells keep their own evidence instead
    // of being silently dropped.
    const anchorInWindow = parsed.range.startRow <= rowCount && parsed.range.startColumn <= columnCount;
    if (!anchorInWindow) continue;
    for (let row = parsed.range.startRow; row <= parsed.range.endRow; row += 1) {
      for (let column = parsed.range.startColumn; column <= parsed.range.endColumn; column += 1) {
        if (row > rowCount || column > columnCount) continue;
        mergeByCell.set(cellKey(row, column), parsed.range);
      }
    }
  }
  if (mergesTruncated) limitations.push(`only the first ${limits.maxMergedRangesInspected} merged ranges were inspected`);

  const cells: SpreadsheetCellEvidence[] = [];
  const occupiedRows = new Set<number>();
  let hiddenRowCount = 0;
  let truncated = false;
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = 0;

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const hiddenRow = row?.hidden === true;
    if (hiddenRow) hiddenRowCount += 1;
    for (let column = 1; column <= columnCount; column += 1) {
      const merged = mergeByCell.get(cellKey(rowNumber, column)) ?? null;
      // A merged range holds one value, in its top-left cell. Every other cell
      // it covers is a child with no value of its own, so it is deliberately
      // not recorded: copying the anchor text into each child would present
      // merged context as though it were direct cell evidence.
      if (merged && merged.anchorAddress !== formatCellAddress(rowNumber, column)) continue;
      const cell = row.findCell(column);
      if (!cell) continue;
      const evidence = cellEvidenceOf({
        sheetName,
        sheetIndex,
        rowNumber,
        columnNumber: column,
        cell,
        hiddenRow,
        hiddenColumn: hiddenColumns.has(column),
        mergedRange: mergeByCell.get(cellKey(rowNumber, column)) ?? null,
      });
      if (!evidence) continue;
      if (budget.remaining <= 0) {
        truncated = true;
        break;
      }
      budget.remaining -= 1;
      cells.push(evidence);
      occupiedRows.add(rowNumber);
      minRow = Math.min(minRow, rowNumber);
      maxRow = Math.max(maxRow, rowNumber);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
    if (truncated) break;
  }
  if (hiddenRowCount) limitations.push(`${hiddenRowCount} row(s) are hidden on this worksheet`);
  if (truncated) limitations.push(`the worksheet inspection stopped at the workbook cell cap, so later cells were not inspected`);

  // A merged range is a container, not a value: its text belongs to the anchor
  // cell only, and it is attached here so the merged heading can be quoted
  // without ever being copied onto the child cells it spans.
  const anchorByRef = new Map(cells.map((cell) => [cell.cellRef, cell]));
  for (const merge of mergedRanges) {
    const anchor = anchorByRef.get(merge.anchorRef);
    if (!anchor) continue;
    merge.text = anchor.displayText || literalTextOf(anchor.rawValue);
    merge.rawType = anchor.rawType;
    merge.hiddenRow = anchor.hiddenRow;
    merge.hiddenColumn = anchor.hiddenColumn;
  }

  const usedRange = cells.length
    ? formatRange(Number.isFinite(minRow) ? minRow : 1, Number.isFinite(minColumn) ? minColumn : 1, maxRow || 1, maxColumn || 1)
    : null;

  return {
    sheetName,
    sheetIndex,
    visibility,
    usedRange,
    rowCount,
    columnCount,
    occupiedRowCount: occupiedRows.size,
    cellCount: cells.length,
    hiddenRowCount,
    hiddenColumnCount: hiddenColumns.size,
    mergedRanges,
    regions: [],
    cells,
    truncated,
    limitations: [...new Set(limitations)].slice(0, MAX_SHEET_LIMITATIONS),
  };
}

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

const MERGE_PATTERN = /^([A-Za-z]{1,4})(\d{1,7}):([A-Za-z]{1,4})(\d{1,7})$/u;

function parseMergedRange(range: string, sheetName: string, sheetIndex: number): { range: MergedRangeEvidence } | null {
  const match = MERGE_PATTERN.exec(range.trim());
  if (!match) return null;
  const startColumn = columnNumberFromLetter(match[1]!);
  const endColumn = columnNumberFromLetter(match[3]!);
  const startRow = Number(match[2]);
  const endRow = Number(match[4]);
  if (!startColumn || !endColumn || !Number.isInteger(startRow) || !Number.isInteger(endRow)) return null;
  const left = Math.min(startColumn, endColumn);
  const right = Math.max(startColumn, endColumn);
  const top = Math.min(startRow, endRow);
  const bottom = Math.max(startRow, endRow);
  return {
    range: {
      sheetName,
      sheetIndex,
      range: formatRange(top, left, bottom, right),
      cellRef: formatSheetRange(sheetName, top, left, bottom, right),
      anchorAddress: formatCellAddress(top, left),
      anchorRef: formatSheetCellRef(sheetName, top, left),
      startRow: top,
      endRow: bottom,
      startColumn: left,
      endColumn: right,
      text: "",
      rawType: "BLANK",
      hiddenRow: false,
      hiddenColumn: false,
      reliability: "MEDIUM",
      limitations: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Cell evidence
// ---------------------------------------------------------------------------

type CellValueRecord = {
  rawType: SpreadsheetCellType;
  rawValue: string | number | boolean | null;
  formula: string | null;
  cachedResult: string | number | boolean | null;
  cachedResultType: SpreadsheetCellType | null;
  limitations: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads one cell into the evidence model.
 *
 * The value and the display text are kept apart on purpose: "00123" and 123
 * are different workbook facts, and collapsing them would destroy part
 * numbers. The formula is recorded verbatim and never evaluated.
 */
function cellEvidenceOf(input: {
  sheetName: string;
  sheetIndex: number;
  rowNumber: number;
  columnNumber: number;
  cell: ExcelJS.Cell;
  hiddenRow: boolean;
  hiddenColumn: boolean;
  mergedRange: MergedRangeEvidence | null;
}): SpreadsheetCellEvidence | null {
  const { cell } = input;
  const record = readCellValue(cell);
  if (record.rawType === "BLANK" && record.formula === null) return null;
  const numberFormat = typeof cell.numFmt === "string" && cell.numFmt.trim() ? cell.numFmt : null;
  // A formula cell renders through the type of its cached result when the
  // workbook stored one, so a formula that produces a date is displayed as the
  // workbook displays it. The reported `rawType` still says FORMULA_RESULT.
  const renderType = record.formula ? (record.cachedResultType ?? record.rawType) : record.rawType;
  const rendered = renderCellDisplayText({
    value: record.formula ? record.cachedResult : record.rawValue,
    type: renderType,
    numberFormat,
  });
  const limitations = [...record.limitations];
  if (rendered.limitation) limitations.push(rendered.limitation);
  if (record.formula && record.cachedResult === null) {
    limitations.push("the workbook stores no cached result for this formula, so only the expression was preserved");
  }
  if (record.formula) limitations.push("the formula was preserved and never recalculated or verified");
  if (input.hiddenRow) limitations.push("the cell sits on a hidden row");
  if (input.hiddenColumn) limitations.push("the cell sits on a hidden column");
  const boundedLimitations = [...new Set(limitations)].slice(0, MAX_LIMITATIONS_PER_RECORD);
  const reliability = cellReliability({ hiddenRow: input.hiddenRow, hiddenColumn: input.hiddenColumn, hasFormula: record.formula !== null, limitationCount: boundedLimitations.length });
  return {
    sheetName: input.sheetName,
    sheetIndex: input.sheetIndex,
    rowNumber: input.rowNumber,
    columnNumber: input.columnNumber,
    columnLetter: columnLetterFromNumber(input.columnNumber),
    cellAddress: formatCellAddress(input.rowNumber, input.columnNumber),
    cellRef: formatSheetCellRef(input.sheetName, input.rowNumber, input.columnNumber),
    rawType: record.rawType,
    rawValue: record.rawValue,
    displayText: rendered.text.slice(0, MAX_CELL_TEXT_CHARACTERS),
    displayFormatted: rendered.formatted,
    numberFormat,
    formula: record.formula,
    cachedResult: record.cachedResult,
    cachedResultType: record.cachedResultType,
    mergedRange: input.mergedRange?.cellRef ?? null,
    isMergeAnchor: input.mergedRange ? input.mergedRange.anchorAddress === formatCellAddress(input.rowNumber, input.columnNumber) : false,
    hiddenRow: input.hiddenRow,
    hiddenColumn: input.hiddenColumn,
    reliability,
    limitations: boundedLimitations,
  };
}

function cellReliability(input: { hiddenRow: boolean; hiddenColumn: boolean; hasFormula: boolean; limitationCount: number }): ObservationReliability {
  if (input.hiddenRow || input.hiddenColumn) return "MEDIUM";
  if (input.hasFormula) return "MEDIUM";
  if (input.limitationCount > 0) return "MEDIUM";
  return "HIGH";
}

/**
 * Maps an ExcelJS cell onto the domain value vocabulary.
 *
 * Formula detection does not trust the reported value type alone: shared
 * formulas and cached results arrive in different shapes, and a formula must
 * never be mistaken for the value it produced.
 */
function readCellValue(cell: ExcelJS.Cell): CellValueRecord {
  const raw = cell.value as unknown;
  const formulaFromGetter = typeof cell.formula === "string" && cell.formula.length > 0 ? cell.formula : null;
  let formula = formulaFromGetter;
  let cached: unknown = undefined;
  if (isRecord(raw)) {
    if (typeof raw.sharedFormula === "string" && raw.sharedFormula.length > 0) formula = formula ?? raw.sharedFormula;
    if ("result" in raw) cached = raw.result;
  }
  if (formula) {
    const normalized = normalizeScalar(cached);
    const hasCached = cached !== undefined && cached !== null;
    return {
      rawType: hasCached ? "FORMULA_RESULT" : "FORMULA",
      rawValue: hasCached ? normalized.value : null,
      formula,
      cachedResult: hasCached ? normalized.value : null,
      cachedResultType: hasCached ? normalized.type : null,
      limitations: [],
    };
  }
  const scalar = normalizeScalar(raw);
  return {
    rawType: scalar.type,
    rawValue: scalar.value,
    formula: null,
    cachedResult: null,
    cachedResultType: null,
    limitations: scalar.limitations,
  };
}

/**
 * Converts any ExcelJS cell value into a JSON-safe scalar plus its value kind.
 * Dates become ISO strings so the evidence model stays serializable, and rich
 * text is flattened to the characters the workbook actually shows.
 */
function normalizeScalar(value: unknown): { value: string | number | boolean | null; type: SpreadsheetCellType; limitations: string[] } {
  if (value === null || value === undefined) return { value: null, type: "BLANK", limitations: [] };
  if (value instanceof Date) return { value: value.toISOString(), type: "DATE", limitations: [] };
  if (typeof value === "number") return { value, type: Number.isFinite(value) ? "NUMBER" : "ERROR", limitations: Number.isFinite(value) ? [] : ["the cell holds a non-finite number"] };
  if (typeof value === "boolean") return { value, type: "BOOLEAN", limitations: [] };
  if (typeof value === "string") return { value, type: "TEXT", limitations: [] };
  if (isRecord(value)) {
    if (typeof value.error === "string") return { value: value.error, type: "ERROR", limitations: ["the cell holds a workbook error value"] };
    if (typeof value.text === "string") return { value: value.text, type: "TEXT", limitations: [] };
    if (Array.isArray(value.richText)) {
      const text = value.richText.map((entry: unknown) => (isRecord(entry) && typeof entry.text === "string" ? entry.text : "")).join("");
      return { value: text, type: "TEXT", limitations: ["the cell holds rich text; only its characters were preserved, not its per-run formatting"] };
    }
    if ("formula" in value || "sharedFormula" in value) return { value: null, type: "FORMULA", limitations: [] };
    if (typeof value.hyperlink === "string") {
      return { value: typeof value.text === "string" ? value.text : "", type: "TEXT", limitations: ["the cell holds a hyperlink; only its text was preserved and the link target was not opened"] };
    }
  }
  return { value: literalTextOf(value as string | number | boolean | Date | null), type: "TEXT", limitations: ["the cell value shape was not recognized, so it was preserved as text"] };
}
