import {
  MAX_WORKBOOK_LIMITATIONS,
  SPREADSHEET_BASELINE_LIMITATION,
  type SpreadsheetAnalysis,
  type TableRegion,
  type WorkbookInspection,
} from "@/src/domain/source-artifact";
import { inspectXlsxWorkbook, type SpreadsheetInspectionLimits } from "./ExcelWorkbookInspector";
import { analyzeWorkbookBoqLines } from "./SpreadsheetBoqAnalyzer";
import { analyzeWorksheetTables } from "./SpreadsheetTableAnalyzer";

/**
 * Phase 2A-6: orchestrator for governed spreadsheet intelligence.
 *
 * Pipeline: safe workbook parsing -> workbook/sheet evidence -> region
 * detection -> column and row roles -> observed structured BOQ line candidates.
 * It holds no format knowledge of its own: the inspector owns bytes, the table
 * analyzer owns structure, and the BOQ analyzer owns line candidates.
 *
 * Nothing here approves, verifies, calculates, or selects anything.
 */

export type { SpreadsheetAnalysis };

/**
 * Runs the structural and BOQ passes over an already-inspected workbook.
 *
 * Kept separate from byte parsing so tests can exercise the analysis against a
 * hand-built workbook model, and so the production path can reuse a persisted
 * inspection without re-reading bytes.
 */
export function analyzeWorkbook(
  workbook: WorkbookInspection,
  limits: Partial<SpreadsheetInspectionLimits> = {},
): SpreadsheetAnalysis {
  const regions: TableRegion[] = [];
  for (const sheet of workbook.worksheets) {
    const analyzed = analyzeWorksheetTables(sheet, limits);
    sheet.regions = analyzed.regions;
    sheet.limitations = [...new Set([...sheet.limitations, ...analyzed.limitations])];
    if (analyzed.truncated) sheet.truncated = true;
    regions.push(...analyzed.regions);
  }
  const { lines, currency } = analyzeWorkbookBoqLines(workbook);
  const sheetLimitations = workbook.worksheets.flatMap((sheet) => sheet.limitations);
  return {
    format: "XLSX",
    workbook,
    regions,
    lines,
    currency,
    truncated: workbook.truncated || workbook.worksheets.some((sheet) => sheet.truncated),
    limitations: [...new Set([SPREADSHEET_BASELINE_LIMITATION, ...workbook.limitations, ...sheetLimitations])].slice(0, MAX_WORKBOOK_LIMITATIONS),
  };
}

/** Inspects .xlsx bytes and runs the full structural and BOQ analysis in one call. */
export async function analyzeXlsxBytes(
  bytes: Uint8Array,
  options: { limits?: Partial<SpreadsheetInspectionLimits>; filename?: string | null; mimeType?: string | null } = {},
): Promise<SpreadsheetAnalysis> {
  return analyzeWorkbook(await inspectXlsxWorkbook(bytes, options), options.limits ?? {});
}

/**
 * Bounded text rendering of a workbook for reuse and search.
 *
 * It is a convenience view of the same evidence, not a second extraction: cell
 * display text joined by tabs per row and newlines per row, capped hard so a
 * large workbook can never bloat a persisted column.
 */
export function flattenWorkbookText(workbook: WorkbookInspection, maxCharacters = 20_000): string {
  const parts: string[] = [];
  let length = 0;
  for (const sheet of workbook.worksheets) {
    const rows = new Map<number, Map<number, string>>();
    for (const cell of sheet.cells) {
      let row = rows.get(cell.rowNumber);
      if (!row) {
        row = new Map();
        rows.set(cell.rowNumber, row);
      }
      row.set(cell.columnNumber, cell.displayText);
    }
    if (!rows.size) continue;
    parts.push(`[${sheet.sheetName}]`);
    length += sheet.sheetName.length + 2;
    for (const rowNumber of [...rows.keys()].sort((left, right) => left - right)) {
      const row = rows.get(rowNumber)!;
      const text = [...row.keys()].sort((left, right) => left - right).map((column) => row.get(column) ?? "").join("\t").trim();
      if (!text) continue;
      parts.push(text);
      length += text.length + 1;
      if (length >= maxCharacters) break;
    }
    if (length >= maxCharacters) break;
  }
  return parts.join("\n").slice(0, maxCharacters);
}
