import type {
  BoqLineCandidate,
  ColumnRole,
  ObservationReliability,
  SheetVisibility,
  SpreadsheetAnalysis,
  TableRegionClassification,
} from "@/src/domain/source-artifact";
import type { ArtifactInspectionStatus, ArtifactInspectionSummary } from "./ArtifactInspectionProjection";

/**
 * Kept local rather than imported from the shared projection module: this
 * module is imported by it at runtime, and a two-way runtime import would
 * create a cycle. The value matches the shared cap.
 */
const MAX_PROJECTED_LIMITATIONS_LOCAL = 8;

/**
 * Phase 2A-6: bounded, governed projection of an inspected workbook.
 *
 * The deterministic inspection may hold tens of thousands of cells. The
 * assistant never sees that: this module distils it into a small, reviewable
 * record — workbook summary, sheet summaries, the strongest table regions, a
 * bounded set of observed line candidates, exact citations, and an explicit
 * statement of everything that was truncated.
 *
 * Hard rules:
 * - no raw enumeration is ever printed into user-facing prose. The brief
 *   translates every classification, role, and reliability into plain words;
 * - every line candidate stays OBSERVED. The projection cannot approve a
 *   quantity, select a product, or create a commercial or engineering record;
 * - a formula is described as a formula the workbook contains, with the
 *   workbook's own stored result. The brief never says VOKA recalculated,
 *   verified, or agreed with it;
 * - truncation is stated, never hidden.
 */

export const MAX_PROJECTED_SHEETS = 8;
export const MAX_PROJECTED_REGIONS = 6;
export const MAX_PROJECTED_BOQ_LINES = 8;
export const MAX_PROJECTED_CELLS = 12;
export const MAX_PROJECTED_MERGED_RANGES = 6;
export const MAX_PROJECTED_COLUMN_ROLES = 12;
export const MAX_PROJECTED_CURRENCY = 4;

export const CLASSIFICATION_LABEL_SPREADSHEET: Record<TableRegionClassification, { ar: string; en: string }> = {
  BOQ: { en: "BOQ-style table", ar: "جدول كميات" },
  PRICE_SCHEDULE: { en: "price schedule", ar: "جدول أسعار" },
  SCHEDULE: { en: "schedule", ar: "جدول" },
  GENERIC_TABLE: { en: "table", ar: "جدول عام" },
  UNKNOWN: { en: "table of undetermined type", ar: "جدول غير محدد النوع" },
};

export const COLUMN_ROLE_LABEL: Record<ColumnRole, { ar: string; en: string }> = {
  ITEM_NUMBER: { en: "item number", ar: "رقم البند" },
  DESCRIPTION: { en: "description", ar: "الوصف" },
  UNIT: { en: "unit", ar: "الوحدة" },
  QUANTITY: { en: "quantity", ar: "الكمية" },
  RATE: { en: "rate", ar: "سعر الوحدة" },
  AMOUNT: { en: "amount", ar: "المبلغ" },
  BRAND: { en: "brand", ar: "الماركة" },
  MANUFACTURER: { en: "manufacturer", ar: "المصنع" },
  MODEL_OR_REFERENCE: { en: "model/reference", ar: "الموديل أو المرجع" },
  REMARKS: { en: "remarks", ar: "ملاحظات" },
  SECTION_OR_DIVISION: { en: "section/division", ar: "القسم أو التصنيف" },
  UNKNOWN: { en: "unassigned column", ar: "عمود غير محدد" },
};

const VISIBILITY_LABEL: Record<SheetVisibility, { ar: string; en: string }> = {
  VISIBLE: { en: "visible", ar: "ظاهرة" },
  HIDDEN: { en: "hidden", ar: "مخفية" },
  VERY_HIDDEN: { en: "very hidden", ar: "مخفية تماماً" },
};

const RELIABILITY_WORD: Record<ObservationReliability, { ar: string; en: string }> = {
  HIGH: { en: "high", ar: "عالية" },
  MEDIUM: { en: "medium", ar: "متوسطة" },
  LOW: { en: "low", ar: "منخفضة" },
};

export type ProjectedSpreadsheetSheet = {
  name: string;
  index: number;
  visibility: SheetVisibility;
  usedRange: string | null;
  rowCount: number;
  columnCount: number;
  regionCount: number;
  hiddenRowCount: number;
  hiddenColumnCount: number;
};

export type ProjectedSpreadsheetRegion = {
  id: string;
  sheetName: string;
  range: string;
  cellRef: string;
  classification: TableRegionClassification;
  reliability: ObservationReliability;
  dataRowCount: number;
  headerRef: string | null;
  columnRoles: Array<{ column: string; role: ColumnRole; header: string | null }>;
  limitations: string[];
};

export type ProjectedBoqLine = {
  id: string;
  sheetName: string;
  rowNumber: number;
  cellRef: string;
  itemNumber: string | null;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  quantityNumber: number | null;
  rate: string | null;
  amount: string | null;
  brand: string | null;
  manufacturer: string | null;
  modelOrReference: string | null;
  remarks: string | null;
  sectionContext: string | null;
  hasFormula: boolean;
  hiddenRow: boolean;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedSpreadsheet = {
  attempted: boolean;
  used: boolean;
  sheetCount: number;
  visibleSheetCount: number;
  hiddenSheetCount: number;
  sheets: ProjectedSpreadsheetSheet[];
  regions: ProjectedSpreadsheetRegion[];
  regionCount: number;
  lines: ProjectedBoqLine[];
  lineCount: number;
  currency: Array<{ code: string | null; token: string; cellRef: string }>;
  /** Bounded set of exact cell references backing the projected lines. */
  citedCells: string[];
  mergedRanges: Array<{ cellRef: string; text: string }>;
  truncated: boolean;
  limitations: string[];
};

/**
 * Governance statements for the workbook channel. They replace the generic
 * document statements because a workbook reading makes different promises: it
 * read cells, and it did not calculate, convert, or approve anything.
 */
export const GOVERNANCE_STATEMENTS_SPREADSHEET = [
  "observed values are not approved, verified, or selected",
  "workbook formulas were preserved as written and never recalculated; a stored result is the workbook's own cached value, not a value VOKA computed",
  "quantities, rates, and amounts are observed workbook literals: no unit conversion, no currency conversion, and no arithmetic check was performed",
] as const;

export function emptyProjectedSpreadsheet(): ProjectedSpreadsheet {
  return {
    attempted: false,
    used: false,
    sheetCount: 0,
    visibleSheetCount: 0,
    hiddenSheetCount: 0,
    sheets: [],
    regions: [],
    regionCount: 0,
    lines: [],
    lineCount: 0,
    currency: [],
    citedCells: [],
    mergedRanges: [],
    truncated: false,
    limitations: [],
  };
}

function textOf(literal: BoqLineCandidate["quantity"]): string | null {
  if (!literal) return null;
  const display = literal.displayText?.trim();
  return display ? display : null;
}

/** Projects the deterministic analysis into the bounded assistant-facing record. */
export function projectSpreadsheetAnalysis(analysis: SpreadsheetAnalysis | null): ProjectedSpreadsheet {
  if (!analysis) return emptyProjectedSpreadsheet();
  const workbook = analysis.workbook;
  const regions = analysis.regions.slice(0, MAX_PROJECTED_REGIONS);
  const lines = analysis.lines.slice(0, MAX_PROJECTED_BOQ_LINES);
  const citedCells: string[] = [];
  const mergedRanges: Array<{ cellRef: string; text: string }> = [];
  for (const sheet of workbook.worksheets) {
    for (const merge of sheet.mergedRanges) {
      if (mergedRanges.length >= MAX_PROJECTED_MERGED_RANGES) break;
      if (!merge.text.trim()) continue;
      mergedRanges.push({ cellRef: merge.cellRef, text: merge.text });
    }
  }
  for (const line of lines) {
    for (const ref of line.cellRefs) {
      if (citedCells.length >= MAX_PROJECTED_CELLS) break;
      citedCells.push(ref);
    }
  }
  return {
    attempted: true,
    used: workbook.worksheets.length > 0,
    sheetCount: workbook.sheetCount,
    visibleSheetCount: workbook.visibleSheetCount,
    hiddenSheetCount: workbook.hiddenSheetCount,
    sheets: workbook.worksheets.slice(0, MAX_PROJECTED_SHEETS).map((sheet) => ({
      name: sheet.sheetName,
      index: sheet.sheetIndex,
      visibility: sheet.visibility,
      usedRange: sheet.usedRange,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      regionCount: sheet.regions.length,
      hiddenRowCount: sheet.hiddenRowCount,
      hiddenColumnCount: sheet.hiddenColumnCount,
    })),
    regions: regions.map((region) => ({
      id: region.id,
      sheetName: region.sheetName,
      range: region.range,
      cellRef: region.cellRef,
      classification: region.classification.value,
      reliability: region.classification.reliability,
      dataRowCount: region.dataRowCount,
      headerRef: region.header?.cellRef ?? null,
      columnRoles: region.columnRoles.slice(0, MAX_PROJECTED_COLUMN_ROLES).map((assignment) => ({
        column: assignment.columnLetter,
        role: assignment.role,
        header: assignment.headerText,
      })),
      limitations: region.limitations.slice(0, MAX_PROJECTED_LIMITATIONS_LOCAL),
    })),
    regionCount: analysis.regions.length,
    lines: lines.map((line) => ({
      id: line.id,
      sheetName: line.sheetName,
      rowNumber: line.rowNumber,
      cellRef: line.cellRef,
      itemNumber: textOf(line.itemNumber),
      description: textOf(line.description),
      unit: textOf(line.unit),
      quantity: textOf(line.quantity),
      quantityNumber: line.quantityNumber,
      rate: textOf(line.rate),
      amount: textOf(line.amount),
      brand: textOf(line.brand),
      manufacturer: textOf(line.manufacturer),
      modelOrReference: textOf(line.modelOrReference),
      remarks: textOf(line.remarks),
      sectionContext: line.sectionContext,
      hasFormula: line.hasFormula,
      hiddenRow: line.hiddenRow,
      reliability: line.reliability,
      limitations: line.limitations.slice(0, MAX_PROJECTED_LIMITATIONS_LOCAL),
    })),
    lineCount: analysis.lines.length,
    currency: analysis.currency.slice(0, MAX_PROJECTED_CURRENCY).map((entry) => ({ code: entry.code, token: entry.token, cellRef: entry.cellRef })),
    citedCells,
    mergedRanges,
    truncated: analysis.truncated || analysis.regions.length > regions.length || analysis.lines.length > lines.length,
    limitations: analysis.limitations.slice(0, MAX_PROJECTED_LIMITATIONS_LOCAL),
  };
}

// ---------------------------------------------------------------------------
// Plain-language brief (English and Arabic)
// ---------------------------------------------------------------------------

function pluralSheets(count: number, locale: "ar" | "en"): string {
  if (locale === "ar") return count === 1 ? "ورقة واحدة" : count === 2 ? "ورقتان" : `${count} أوراق`;
  return count === 1 ? "1 sheet" : `${count} sheets`;
}

function sheetSummarySentence(spreadsheet: ProjectedSpreadsheet, locale: "ar" | "en"): string {
  const visible = spreadsheet.visibleSheetCount;
  const hidden = spreadsheet.hiddenSheetCount;
  if (locale === "ar") {
    if (hidden === 0) return `يحتوي الملف على ${pluralSheets(visible, locale)}، وكلها ظاهرة.`;
    return `يحتوي الملف على ${pluralSheets(visible, locale)} ظاهرة و${pluralSheets(hidden, locale)} مخفية، وقد فحصت المخفية كدليل مخفي.`;
  }
  if (hidden === 0) return `The workbook has ${pluralSheets(visible, locale)}, all visible.`;
  return `The workbook has ${pluralSheets(visible, locale)} and ${pluralSheets(hidden, locale)} hidden, and I inspected the hidden ones as hidden evidence.`;
}

function regionSentence(region: ProjectedSpreadsheetRegion, ar: boolean): string {
  const label = CLASSIFICATION_LABEL_SPREADSHEET[region.classification][ar ? "ar" : "en"];
  return ar
    ? `وجدت ${label} في الورقة '${region.sheetName}' ضمن النطاق ${region.range}.`
    : `I found a structured ${label} on sheet '${region.sheetName}' covering ${region.range}.`;
}

function lineSentence(line: ProjectedBoqLine, ar: boolean): string | null {
  if (line.quantity && line.unit) {
    return ar
      ? `أستطيع قراءة كمية مرصودة قدرها ${line.quantity} بوحدة '${line.unit}' في الصف ${line.rowNumber} من الورقة '${line.sheetName}'. لم تُعتمد هذه الكمية كمية هندسية.`
      : `I can read an observed quantity of ${line.quantity} with unit '${line.unit}' on row ${line.rowNumber} of sheet '${line.sheetName}'. This has not been approved as an engineering quantity.`;
  }
  if (line.description) {
    return ar
      ? `أستطيع قراءة بند مرصود وصفه '${line.description}' في الصف ${line.rowNumber} من الورقة '${line.sheetName}'. لم يُعتمد كبند كميات.`
      : `I can read an observed item described as '${line.description}' on row ${line.rowNumber} of sheet '${line.sheetName}'. It has not been approved as a BOQ line.`;
  }
  return null;
}

function formulaSentence(line: ProjectedBoqLine, ar: boolean): string | null {
  if (!line.hasFormula) return null;
  return ar
    ? `يحتوي الملف على صيغة في ${line.cellRef} مع نتيجة مخزّنة في الملف. لم أعد حساب الصيغة.`
    : `The workbook contains a formula in ${line.cellRef} and a stored workbook result. I did not recalculate the formula.`;
}

function hiddenSheetSentence(sheetName: string, ar: boolean): string {
  return ar
    ? `هذه الورقة '${sheetName}' مخفية في الملف، لذلك أتعامل مع محتواها كدليل مخفي.`
    : `This sheet '${sheetName}' is hidden in the workbook, so I am treating its contents as hidden evidence.`;
}

const TRUNCATION_SENTENCE = {
  en: "I inspected a bounded part of this workbook, so what follows is a truncated view rather than the whole file.",
  ar: "فحصت جزءاً محدداً من هذا الملف، لذا ما يلي عرض مقتطع وليس الملف كاملاً.",
};

const NO_TAKEOFF_SENTENCE = {
  en: "No requirement, quotation line, bill of materials, or procurement record was created from this workbook.",
  ar: "لم يُنشأ أي متطلب أو بند عرض سعر أو جدول مواد أو سجل توريد من هذا الملف.",
};

const OBSERVED_ONLY_SENTENCE = {
  en: "These are observed workbook values only, not approved quantities and not selected products.",
  ar: "هذه قيم مرصودة من الملف فقط، وليست كميات معتمدة ولا منتجات مختارة.",
};

const NO_TABLE_SENTENCE = {
  en: "I could not find a table structure in this workbook that I could read confidently, so I have not described any item lines.",
  ar: "لم أتمكن من العثور على بنية جدول يمكنني قراءتها بثقة في هذا الملف، لذا لم أصف أي بنود.",
};

/**
 * Renders the truthful workbook brief the assistant may say out loud.
 *
 * Every classification, role, visibility, and reliability value is translated
 * into plain words: no enumeration token is ever printed into the prose.
 */
export function renderSpreadsheetBrief(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
  const ar = locale === "ar";
  const spreadsheet = summary.spreadsheet;
  const parts: string[] = [];
  parts.push(ar
    ? `قرأت الملف "${summary.filename}" (${statusWord(summary.status, ar)}).`
    : `I read "${summary.filename}" (${statusWord(summary.status, ar)}).`);
  parts.push(sheetSummarySentence(spreadsheet, locale));

  const hiddenSheet = spreadsheet.sheets.find((sheet) => sheet.visibility !== "VISIBLE");
  if (hiddenSheet) parts.push(hiddenSheetSentence(hiddenSheet.name, ar));

  // Only regions VOKA could classify are narrated: describing a block as a
  // "table of undetermined type" tells a user nothing and reads like a system
  // message. The unclassified blocks are still in the structured projection,
  // and their count is stated so nothing is quietly dropped.
  const namedRegions = spreadsheet.regions.filter((region) => region.classification !== "UNKNOWN");
  for (const region of namedRegions.slice(0, 3)) parts.push(regionSentence(region, ar));
  const unclassified = spreadsheet.regions.length - namedRegions.length;
  if (unclassified > 0) {
    parts.push(ar
      ? `وهناك ${unclassified} من كتل الجداول الأخرى لم أستطع تصنيفها بثقة.`
      : `There ${unclassified === 1 ? "is" : "are"} ${unclassified} other table block${unclassified === 1 ? "" : "s"} I could not classify confidently.`);
  }
  if (!spreadsheet.regions.length && spreadsheet.sheetCount > 0) parts.push(NO_TABLE_SENTENCE[locale]);

  for (const line of spreadsheet.lines.slice(0, 3)) {
    const sentence = lineSentence(line, ar);
    if (sentence) parts.push(sentence);
  }
  const described = spreadsheet.lines.slice(0, 3).filter((line) => line.quantity || line.description).length;
  const remaining = spreadsheet.lineCount - described;
  if (remaining > 0) {
    parts.push(ar
      ? `وهناك ${remaining} من البنود المرصودة الأخرى لم أعرضها هنا.`
      : `There are ${remaining} more observed line candidates I have not listed here.`);
  }

  const formulaLine = spreadsheet.lines.find((line) => line.hasFormula);
  if (formulaLine) {
    const sentence = formulaSentence(formulaLine, ar);
    if (sentence) parts.push(sentence);
  }

  if (spreadsheet.currency.length) {
    const entry = spreadsheet.currency[0]!;
    parts.push(ar
      ? `يذكر الملف العملة صراحةً (${entry.token}) في ${entry.cellRef}؛ لم أحوّل أي عملة.`
      : `The workbook states the currency explicitly (${entry.token}) at ${entry.cellRef}; I performed no currency conversion.`);
  }

  if (spreadsheet.truncated) parts.push(TRUNCATION_SENTENCE[locale]);
  parts.push(NO_TAKEOFF_SENTENCE[locale]);
  if (spreadsheet.lines.length) parts.push(OBSERVED_ONLY_SENTENCE[locale]);

  const limitation = spreadsheet.limitations[0];
  if (limitation) parts.push(ar ? `قيود: ${limitation}` : `Limitation: ${limitation}`);
  return parts.join(" ");
}

function statusWord(status: ArtifactInspectionStatus, ar: boolean): string {
  const map: Record<ArtifactInspectionStatus, { ar: string; en: string }> = {
    INSPECTED: { ar: "تم الفحص", en: "inspected" },
    INSPECTED_NO_MACHINE_READABLE_TEXT: { ar: "تم فحص البنية بدون نص مقروء آلياً", en: "inspected with no machine-readable text" },
    NOT_INSPECTED: { ar: "لم يتم الفحص", en: "not inspected" },
    UNAVAILABLE: { ar: "الفحص غير متاح", en: "unavailable" },
    ENCRYPTED: { ar: "مشفر", en: "encrypted" },
  };
  return map[status][ar ? "ar" : "en"];
}

export { RELIABILITY_WORD as SPREADSHEET_RELIABILITY_WORD, VISIBILITY_LABEL as SPREADSHEET_VISIBILITY_LABEL };
