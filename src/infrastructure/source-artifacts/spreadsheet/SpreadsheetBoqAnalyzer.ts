import {
  MAX_BOQ_LINES_PER_SHEET,
  MAX_BOQ_LINES_TOTAL,
  MAX_CELL_REFS_PER_LINE,
  MAX_LIMITATIONS_PER_RECORD,
  MAX_SECTION_CONTEXT_CHARACTERS,
  SPREADSHEET_LINE_BASELINE_LIMITATION,
  detectExplicitCurrency,
  formatSheetRange,
  isLineBearingClassification,
  numericViewOf,
  type BoqLineCandidate,
  type ColumnRole,
  type ColumnRoleAssignment,
  type MergedRangeEvidence,
  type ObservationReliability,
  type ObservedCurrencyEvidence,
  type SpreadsheetCellEvidence,
  type SpreadsheetLiteral,
  type TableRegion,
  type WorkbookInspection,
  type WorksheetInspection,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-6: observed structured BOQ line candidates.
 *
 * This module turns the DATA rows of a line-bearing table region into observed
 * structured line candidates. It is the last deterministic step before
 * projection, and the most governance-sensitive one: everything here is a
 * reading of the workbook, not a decision about the project.
 *
 * Hard rules:
 * - only DATA rows become line candidates. Titles, headers, sections, notes,
 *   subtotals, and totals are classified and kept as evidence, and are never
 *   emitted as item lines;
 * - a quantity stays a workbook literal. A numeric view may be stored beside it
 *   for review, but nothing is promoted to an approved engineering quantity;
 * - units are preserved verbatim. No conversion, no UOM resolution;
 * - currency is recorded only when the workbook states it explicitly, and no
 *   conversion is ever performed;
 * - a formula cell contributes its expression and the workbook's cached result.
 *   VOKA never evaluates, recalculates, or verifies it;
 * - sheets are never merged. Two tables with identical headers on two sheets
 *   stay two sets of evidence, each with its own sheet provenance;
 * - inherited section context is always marked as inherited, with the exact
 *   range it came from, so merged context can never be mistaken for a value
 *   that sits on the item row itself;
 * - nothing here creates a Requirement, a QuotationLine, a BOM item, or any
 *   procurement object. There is no code path from a line candidate into
 *   governed state.
 */

function literalOf(cell: SpreadsheetCellEvidence | undefined): SpreadsheetLiteral | null {
  if (!cell) return null;
  return {
    type: cell.rawType,
    value: cell.rawValue,
    displayText: cell.displayText,
    displayFormatted: cell.displayFormatted,
    numberFormat: cell.numberFormat,
    formula: cell.formula,
    cachedResult: cell.cachedResult,
    cachedResultType: cell.cachedResultType,
    limitations: [...cell.limitations],
  };
}

function roleColumn(region: TableRegion, roles: ColumnRole[]): ColumnRoleAssignment | null {
  for (const role of roles) {
    const assignment = region.columnRoles.find((entry) => entry.role === role);
    if (assignment) return assignment;
  }
  return null;
}

function mergeFor(sheet: WorksheetInspection, rowNumber: number, anchorRef: string | null): MergedRangeEvidence | null {
  if (!anchorRef) return null;
  return sheet.mergedRanges.find((merge) => merge.anchorRef === anchorRef && merge.startRow === rowNumber) ?? null;
}

/**
 * Builds the observed structured line candidates for one worksheet.
 *
 * The walk is strictly in row order so a section heading only ever provides
 * context to the DATA rows that follow it inside the same region, and never to
 * rows on another sheet or in another region.
 */
export function analyzeWorksheetBoqLines(sheet: WorksheetInspection, regions: TableRegion[]): { lines: BoqLineCandidate[]; currency: ObservedCurrencyEvidence[] } {
  const lines: BoqLineCandidate[] = [];
  const currency: ObservedCurrencyEvidence[] = [];
  const cellsByRow = new Map<number, Map<number, SpreadsheetCellEvidence>>();
  for (const cell of sheet.cells) {
    let row = cellsByRow.get(cell.rowNumber);
    if (!row) {
      row = new Map();
      cellsByRow.set(cell.rowNumber, row);
    }
    row.set(cell.columnNumber, cell);
  }

  for (const region of regions) {
    if (!isLineBearingClassification(region.classification.value)) continue;
    const itemColumn = roleColumn(region, ["ITEM_NUMBER"]);
    const descriptionColumn = roleColumn(region, ["DESCRIPTION"]);
    const unitColumn = roleColumn(region, ["UNIT"]);
    const quantityColumn = roleColumn(region, ["QUANTITY"]);
    const rateColumn = roleColumn(region, ["RATE"]);
    const amountColumn = roleColumn(region, ["AMOUNT"]);
    const brandColumn = roleColumn(region, ["BRAND"]);
    const manufacturerColumn = roleColumn(region, ["MANUFACTURER"]);
    const modelColumn = roleColumn(region, ["MODEL_OR_REFERENCE", "MODEL_OR_REFERENCE"]);
    const remarksColumn = roleColumn(region, ["REMARKS"]);

    // Currency is read from explicit statements only: a header such as
    // "Rate (USD)" or a cell that spells out a currency token.
    for (const assignment of region.columnRoles) {
      if (assignment.role !== "RATE" && assignment.role !== "AMOUNT") continue;
      const found = detectExplicitCurrency(assignment.headerText);
      if (found?.code) {
        currency.push({
          code: found.code,
          token: found.token!,
          cellRef: assignment.headerCellRef ?? region.cellRef,
          source: `header of the ${assignment.role} column`,
          limitations: [`${found.evidence}; no conversion was performed`],
        });
      }
    }

    let sectionContext: string | null = null;
    let sectionContextRef: string | null = null;

    for (const rowRole of region.rowRoles) {
      if (rowRole.role === "SECTION" || rowRole.role === "TITLE") {
        const row = cellsByRow.get(rowRole.rowNumber);
        const anchor = row ? [...row.values()].find((cell) => cell.isMergeAnchor) : undefined;
        const text = (rowRole.evidenceText ?? "").trim();
        if (text) {
          sectionContext = text.slice(0, MAX_SECTION_CONTEXT_CHARACTERS);
          const merge = mergeFor(sheet, rowRole.rowNumber, anchor?.cellRef ?? null);
          sectionContextRef = merge?.cellRef
            ?? (row ? formatSheetRange(sheet.sheetName, rowRole.rowNumber, region.startColumn, rowRole.rowNumber, region.endColumn) : null);
        }
        continue;
      }
      // A subtotal or total ends the run of item lines it summarizes; the
      // section context is not carried across it into the next block.
      if (rowRole.role === "SUBTOTAL" || rowRole.role === "TOTAL") {
        sectionContext = null;
        sectionContextRef = null;
        continue;
      }
      if (rowRole.role !== "DATA") continue;
      if (lines.length >= MAX_BOQ_LINES_PER_SHEET) break;

      const row = cellsByRow.get(rowRole.rowNumber);
      if (!row) continue;
      const cellAt = (assignment: ColumnRoleAssignment | null): SpreadsheetCellEvidence | undefined =>
        assignment ? row.get(assignment.columnNumber) : undefined;

      const description = cellAt(descriptionColumn);
      const quantityCell = cellAt(quantityColumn);
      const quantity = literalOf(quantityCell);
      const rateCell = cellAt(rateColumn);
      const amountCell = cellAt(amountColumn);
      const rowCells = [...row.values()];
      const hasFormula = rowCells.some((cell) => cell.formula !== null);
      const hiddenRow = rowCells.some((cell) => cell.hiddenRow);
      const limitations = [...new Set([
        SPREADSHEET_LINE_BASELINE_LIMITATION,
        ...(sectionContext ? ["the section context below was inherited from a heading row, not read from this item row"] : []),
        ...(hiddenRow ? ["the row is hidden in the workbook"] : []),
        ...(hasFormula ? ["the row carries at least one formula, which was preserved and never recalculated"] : []),
        ...rowCells.flatMap((cell) => cell.limitations),
      ])].slice(0, MAX_LIMITATIONS_PER_RECORD);

      const reliability: ObservationReliability = hiddenRow || hasFormula ? "MEDIUM" : "HIGH";
      lines.push({
        id: `L-${sheet.sheetIndex}-${rowRole.rowNumber}`,
        sheetName: sheet.sheetName,
        sheetIndex: sheet.sheetIndex,
        regionId: region.id,
        rowNumber: rowRole.rowNumber,
        cellRef: formatSheetRange(sheet.sheetName, rowRole.rowNumber, region.startColumn, rowRole.rowNumber, region.endColumn),
        itemNumber: literalOf(cellAt(itemColumn)),
        description: literalOf(description),
        unit: literalOf(cellAt(unitColumn)),
        quantity,
        quantityNumber: numericViewOf(quantity),
        rate: literalOf(rateCell),
        amount: literalOf(amountCell),
        brand: literalOf(cellAt(brandColumn)),
        manufacturer: literalOf(cellAt(manufacturerColumn)),
        modelOrReference: literalOf(cellAt(modelColumn)),
        remarks: literalOf(cellAt(remarksColumn)),
        sectionContext,
        sectionContextRef,
        hasFormula,
        cellRefs: rowCells.map((cell) => cell.cellRef).slice(0, MAX_CELL_REFS_PER_LINE),
        hiddenRow,
        status: "OBSERVED_NOT_APPROVED",
        reliability,
        limitations,
      });

      // Explicit currency token found on a value cell is evidence too, and it
      // is recorded with the exact cell it came from.
      for (const cell of [rateCell, amountCell]) {
        if (!cell) continue;
        const found = detectExplicitCurrency(cell.displayText);
        if (found?.code) {
          currency.push({
            code: found.code,
            token: found.token!,
            cellRef: cell.cellRef,
            source: `text of the ${cell === rateCell ? "rate" : "amount"} cell`,
            limitations: [`${found.evidence}; no conversion was performed`],
          });
        }
      }
    }
  }
  return { lines, currency };
}

/**
 * Runs BOQ line analysis across every worksheet of a workbook.
 *
 * Each sheet keeps its own provenance end to end: line candidates are never
 * merged across sheets, even when two sheets share identical headers, because
 * a BOQ section is where it sits, not what it looks like.
 */
export function analyzeWorkbookBoqLines(workbook: WorkbookInspection): { lines: BoqLineCandidate[]; currency: ObservedCurrencyEvidence[] } {
  const lines: BoqLineCandidate[] = [];
  const currency: ObservedCurrencyEvidence[] = [];
  let truncated = false;
  for (const sheet of workbook.worksheets) {
    if (lines.length >= MAX_BOQ_LINES_TOTAL) {
      truncated = true;
      break;
    }
    const result = analyzeWorksheetBoqLines(sheet, sheet.regions);
    for (const line of result.lines) {
      if (lines.length >= MAX_BOQ_LINES_TOTAL) {
        truncated = true;
        break;
      }
      lines.push(line);
    }
    currency.push(...result.currency);
  }
  if (truncated) {
    workbook.limitations.push(`the workbook reached the ${MAX_BOQ_LINES_TOTAL} line-candidate cap, so later lines were not analyzed`);
    workbook.truncated = true;
  }
  return { lines, currency: dedupeCurrency(currency) };
}

function dedupeCurrency(entries: ObservedCurrencyEvidence[]): ObservedCurrencyEvidence[] {
  const seen = new Set<string>();
  const output: ObservedCurrencyEvidence[] = [];
  for (const entry of entries) {
    const key = `${entry.code}|${entry.token}|${entry.cellRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}
