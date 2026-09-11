import {
  MAX_HEADER_ROWS,
  MAX_LIMITATIONS_PER_RECORD,
  MAX_REGION_COLUMNS,
  MAX_ROWS_PER_REGION,
  MAX_ROW_ROLES_PER_REGION,
  MAX_TABLE_REGIONS_PER_SHEET,
  classifyColumnRole,
  classifyRowRole,
  classifyTableRegion,
  columnLetterFromNumber,
  formatRange,
  formatSheetRange,
  type ColumnRoleAssignment,
  type ObservationReliability,
  type RowRole,
  type RowRoleAssignment,
  type SpreadsheetCellEvidence,
  type TableRegion,
  type WorksheetInspection,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-6: deterministic table-region detection and column-role analysis.
 *
 * A worksheet is not one table. Real BOQ files stack a title, a blank row, a
 * BOQ schedule, a notes block, a summary table, and a second schedule on the
 * same sheet, so treating the used range as a single table would mix a project
 * title into item lines and a grand total into quantities.
 *
 * This module finds the blocks, reads their headers, and assigns conservative
 * column and row roles. It is deliberately deterministic: no model call, no
 * layout guessing, no inference from the file name, and no coercion of an
 * ambiguous header into a confident role.
 *
 * Hard rules:
 * - a blank row ends a block. Blank separators are the strongest and least
 *   surprising structural signal a worksheet gives;
 * - a region needs at least two rows and two occupied columns. Anything
 *   smaller is kept as evidence on the sheet but is never called a table;
 * - header interpretation is bounded to three rows. A fourth row is data, so a
 *   three-row header is the deepest structure VOKA will read;
 * - a repeated header inside a long BOQ is classified as a header, so printed
 *   page headers never become item lines;
 * - a header that supports two roles equally stays UNKNOWN with both named.
 *   Guessing is not analysis.
 */

type RowMap = Map<number, Map<number, SpreadsheetCellEvidence>>;

function indexCells(sheet: WorksheetInspection): RowMap {
  const rows: RowMap = new Map();
  for (const cell of sheet.cells) {
    let row = rows.get(cell.rowNumber);
    if (!row) {
      row = new Map();
      rows.set(cell.rowNumber, row);
    }
    row.set(cell.columnNumber, cell);
  }
  return rows;
}

/** Groups occupied row numbers into blocks separated by at least one blank row. */
function rowBlocks(rowNumbers: number[]): Array<{ startRow: number; endRow: number; rows: number[] }> {
  const blocks: Array<{ startRow: number; endRow: number; rows: number[] }> = [];
  let current: number[] = [];
  for (const rowNumber of rowNumbers) {
    const previous = current[current.length - 1];
    if (previous !== undefined && rowNumber !== previous + 1) {
      blocks.push({ startRow: current[0]!, endRow: previous, rows: current });
      current = [];
    }
    current.push(rowNumber);
  }
  if (current.length) blocks.push({ startRow: current[0]!, endRow: current[current.length - 1]!, rows: current });
  return blocks;
}

function isSectionLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/^[\d\s.,%+-]+$/u.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/gu, "");
  if (letters.length >= 3 && trimmed === trimmed.toUpperCase()) return true;
  if (/^(division|section|category|trade|group)\b/iu.test(trimmed)) return true;
  if (/^(أعمال|قسم|نظام|بند)/u.test(trimmed)) return true;
  return false;
}

/**
 * True when a row is a wide merged heading: it holds exactly one occupied cell
 * and that cell anchors a merge spanning most of the region. Such a row is a
 * heading, never an item line.
 */
function mergedTitleOf(row: Map<number, SpreadsheetCellEvidence>, columns: number[]): { merged: boolean; cell: SpreadsheetCellEvidence | null } {
  if (row.size !== 1) return { merged: false, cell: null };
  const [cell] = [...row.values()];
  if (!cell) return { merged: false, cell: null };
  if (!cell.mergedRange || !cell.isMergeAnchor) return { merged: false, cell };
  const span = columns.length > 0 ? columns[columns.length - 1]! - columns[0]! + 1 : 0;
  const mergeWidth = mergeWidthOf(cell);
  return { merged: span > 0 && mergeWidth >= Math.max(2, Math.ceil(span / 2)), cell };
}

function mergeWidthOf(cell: SpreadsheetCellEvidence): number {
  const match = /:([A-Za-z]{1,4})(\d{1,7})$/u.exec(cell.mergedRange ?? "");
  if (!match) return 1;
  const endColumn = columnLetterToNumber(match[1]!);
  return endColumn ? endColumn - cell.columnNumber + 1 : 1;
}

function columnLetterToNumber(letters: string): number | null {
  const cleaned = letters.trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/u.test(cleaned)) return null;
  let value = 0;
  for (const character of cleaned) value = value * 26 + (character.charCodeAt(0) - 64);
  return value;
}

/**
 * Detects the header band of a block.
 *
 * Columns are read independently: a two-row header where row 1 names the item
 * and row 2 names the quantity is understood by combining each column's own
 * cells, not by concatenating whole rows. The deepest header considered is
 * three rows; beyond that the rows are data.
 */
function detectHeader(
  rows: RowMap,
  block: { startRow: number; endRow: number; rows: number[] },
  columns: number[],
): { header: { startRow: number; endRow: number; rowCount: number } | null; texts: Map<number, string>; refs: Map<number, string>; merged: Set<number> } {
  const maxDepth = Math.min(MAX_HEADER_ROWS, block.rows.length);
  let best: { depth: number; score: number; texts: Map<number, string>; refs: Map<number, string>; merged: Set<number> } | null = null;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const texts = new Map<number, string>();
    const refs = new Map<number, string>();
    const merged = new Set<number>();
    for (const column of columns) {
      const parts: string[] = [];
      let ref: string | null = null;
      for (let offset = 0; offset < depth; offset += 1) {
        const rowNumber = block.startRow + offset;
        const cell = rows.get(rowNumber)?.get(column);
        if (!cell) continue;
        const text = cell.displayText.trim();
        if (text.length) parts.push(text);
        ref = ref ?? cell.cellRef;
        if (cell.isMergeAnchor) {
          merged.add(column);
          // A header merged across several columns names every column it spans.
          const endColumn = columnLetterToNumber(/:([A-Za-z]{1,4})(\d{1,7})$/u.exec(cell.mergedRange ?? "")?.[1] ?? "");
          if (endColumn) for (let spanned = column + 1; spanned <= endColumn; spanned += 1) merged.add(spanned);
        }
      }
      if (parts.length) texts.set(column, parts.join(" "));
      if (ref) refs.set(column, ref);
    }
    let score = 0;
    for (const text of texts.values()) {
      if (classifyColumnRole(text).role !== "UNKNOWN") score += 1;
    }
    if (!best || score > best.score) best = { depth, score, texts, refs, merged };
  }
  const chosen = best;
  if (!chosen || chosen.score < 2) {
    return { header: null, texts: new Map(), refs: new Map(), merged: new Set() };
  }
  return {
    header: { startRow: block.startRow, endRow: block.startRow + chosen.depth - 1, rowCount: chosen.depth },
    texts: chosen.texts,
    refs: chosen.refs,
    merged: chosen.merged,
  };
}

/**
 * Analyses one worksheet into bounded table regions.
 *
 * Regions are returned in worksheet order with their column roles and row
 * roles attached. Every region keeps its own limitations, so an ambiguous
 * boundary stays visible instead of being resolved silently.
 */
export function analyzeWorksheetTables(
  sheet: WorksheetInspection,
  limits: { maxTableRegionsPerSheet?: number } = {},
): { regions: TableRegion[]; limitations: string[]; truncated: boolean } {
  const regionCap = limits.maxTableRegionsPerSheet ?? MAX_TABLE_REGIONS_PER_SHEET;
  const limitations: string[] = [];
  const rows = indexCells(sheet);
  const rowNumbers = [...rows.keys()].sort((left, right) => left - right);
  if (!rowNumbers.length) return { regions: [], limitations, truncated: false };

  const blocks = rowBlocks(rowNumbers);
  const regions: TableRegion[] = [];
  let truncated = false;

  for (const block of blocks) {
    if (regions.length >= regionCap) {
      truncated = true;
      break;
    }
    const blockRows = block.rows.slice(0, MAX_ROWS_PER_REGION);
    if (block.rows.length > MAX_ROWS_PER_REGION) limitations.push(`a block on this worksheet was truncated to ${MAX_ROWS_PER_REGION} rows`);
    const occupancy = new Map<number, number>();
    for (const rowNumber of blockRows) {
      for (const column of rows.get(rowNumber)?.keys() ?? []) {
        occupancy.set(column, (occupancy.get(column) ?? 0) + 1);
      }
    }
    const columns = [...occupancy.keys()].sort((left, right) => left - right).slice(0, MAX_REGION_COLUMNS);
    if (columns.length > MAX_REGION_COLUMNS) limitations.push(`a region was truncated to ${MAX_REGION_COLUMNS} columns`);
    // A table needs a shape: at least two rows and two occupied columns. A
    // lone title row is evidence, not a table.
    if (blockRows.length < 2 || columns.length < 2) continue;

    // A wide merged heading (a project title or a division banner) is a
    // heading, not a header row. Letting one into the header band would rename
    // the first item column after the banner text, so the header search starts
    // at the first row that is not a merged heading.
    let contentStart = block.startRow;
    for (const rowNumber of blockRows) {
      const row = rows.get(rowNumber);
      if (!row) continue;
      if (mergedTitleOf(row, columns).merged) continue;
      contentStart = rowNumber;
      break;
    }
    const contentRows = blockRows.filter((rowNumber) => rowNumber >= contentStart);
    const detected = detectHeader(rows, { startRow: contentStart, endRow: block.endRow, rows: contentRows }, columns);
    const headerTexts: string[] = [];
    const columnRoles: ColumnRoleAssignment[] = [];
    for (const column of columns) {
      const headerText = detected.texts.get(column) ?? null;
      if (headerText) headerTexts.push(headerText);
      const classified = classifyColumnRole(headerText);
      columnRoles.push({
        columnNumber: column,
        columnLetter: columnLetterFromNumber(column),
        role: classified.role,
        alternatives: classified.alternatives,
        headerText,
        headerCellRef: detected.refs.get(column) ?? null,
        headerMerged: detected.merged.has(column),
        reliability: classified.role === "UNKNOWN" ? "LOW" : classified.reliability,
        limitations: headerText ? [] : ["no header text was found for this column, so no role was assigned"],
      });
    }

    const headerEnd = detected.header?.endRow ?? contentStart - 1;
    const signature = columns.map((column) => detected.texts.get(column) ?? "");
    const rowRoles: RowRoleAssignment[] = [];
    const counts: Partial<Record<RowRole, number>> = {};
    let dataRowCount = 0;
    for (const rowNumber of blockRows) {
      const row = rows.get(rowNumber);
      if (!row) continue;
      const ordered = columns.map((column) => row.get(column)).filter((cell): cell is SpreadsheetCellEvidence => Boolean(cell));
      const texts = ordered.map((cell) => cell.displayText);
      const types = ordered.map((cell) => cell.rawType);
      const mergedTitle = mergedTitleOf(row, columns);
      let role: RowRole;
      let evidence: string | null = null;
      let reason: string;
      let reliability: ObservationReliability;
      if (rowNumber >= contentStart && rowNumber <= headerEnd) {
        role = "HEADER";
        evidence = texts.join(" ").trim() || null;
        reason = "the row sits in the header band of the region";
        reliability = "HIGH";
      } else {
        const classified = classifyRowRole({ texts, types, mergedTitle: mergedTitle.merged, headerSignature: signature });
        role = classified.role;
        evidence = classified.evidence;
        reason = classified.reason;
        reliability = classified.reliability;
        // A wide merged heading that reads like a section is section context,
        // not a decorative title.
        if (role === "TITLE" && mergedTitle.cell && isSectionLikeText(mergedTitle.cell.displayText)) {
          role = "SECTION";
          reason = "the row is a wide merged heading that reads as a section or division";
        }
      }
      counts[role] = (counts[role] ?? 0) + 1;
      if (role === "DATA") dataRowCount += 1;
      rowRoles.push({
        rowNumber,
        role,
        cellRef: formatSheetRange(sheet.sheetName, rowNumber, columns[0] ?? 1, rowNumber, columns[columns.length - 1] ?? 1),
        evidenceText: evidence ? evidence.slice(0, 240) : null,
        reason,
        reliability,
        limitations: [],
      });
    }
    const rowRolesTruncated = rowRoles.length > MAX_ROW_ROLES_PER_REGION;
    const boundedRowRoles = rowRoles.slice(0, MAX_ROW_ROLES_PER_REGION);

    const classification = classifyTableRegion({ roles: columnRoles.map((entry) => entry.role), dataRowCount, headerTexts });
    const regionLimitations = [...new Set([
      ...(detected.header ? [] : ["no header band could be read from this region, so its columns were not assigned roles"]),
      ...(blockRows.length < block.rows.length ? [`the region was truncated to ${MAX_ROWS_PER_REGION} rows`] : []),
    ])].slice(0, MAX_LIMITATIONS_PER_RECORD);

    regions.push({
      id: `R-${sheet.sheetIndex}-${regions.length + 1}`,
      sheetName: sheet.sheetName,
      sheetIndex: sheet.sheetIndex,
      range: formatRange(block.startRow, columns[0]!, block.endRow, columns[columns.length - 1]!),
      cellRef: formatSheetRange(sheet.sheetName, block.startRow, columns[0]!, block.endRow, columns[columns.length - 1]!),
      startRow: block.startRow,
      endRow: block.endRow,
      startColumn: columns[0]!,
      endColumn: columns[columns.length - 1]!,
      header: detected.header
        ? {
          startRow: detected.header.startRow,
          endRow: detected.header.endRow,
          rowCount: detected.header.rowCount,
          cellRef: formatSheetRange(sheet.sheetName, detected.header.startRow, columns[0]!, detected.header.endRow, columns[columns.length - 1]!),
        }
        : null,
      classification,
      columnRoles,
      rowRoles: boundedRowRoles,
      rowRoleCounts: counts,
      rowRolesTruncated,
      dataRowCount,
      reliability: classification.reliability,
      limitations: regionLimitations,
    });
  }
  if (truncated) limitations.push(`only the first ${regionCap} table regions on this worksheet were analyzed`);
  return { regions, limitations: [...new Set(limitations)], truncated };
}
