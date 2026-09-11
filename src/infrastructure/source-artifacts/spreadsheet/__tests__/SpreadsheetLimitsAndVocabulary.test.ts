import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  MAX_CELLS_INSPECTED,
  MAX_TABLE_REGIONS_PER_SHEET,
  MAX_USED_COLUMNS_PER_SHEET,
  MAX_USED_ROWS_PER_SHEET,
  MAX_WORKBOOK_BYTES,
  MAX_WORKSHEETS,
  MAX_MERGED_RANGES_INSPECTED,
  MAX_BOQ_LINES_TOTAL,
  classifyColumnRole,
  classifyRowRole,
  detectExplicitCurrency,
  isColumnRole,
  isRowRole,
  isTableRegionClassification,
  numericViewOf,
} from "@/src/domain/source-artifact";
import { analyzeXlsxBytes } from "../SpreadsheetInspectionAnalyzer";
import { buildWorkbook } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";

/**
 * Phase 2A-6: bounds and vocabulary.
 *
 * The limits exist so a hostile or simply huge workbook cannot expand memory or
 * runtime without bound; the vocabulary tests exist so the English and Arabic
 * header and row-role synonyms behave the way the specification describes.
 */

describe("production limits", () => {
  it("publishes defensible bounds", () => {
    expect(MAX_WORKBOOK_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_WORKSHEETS).toBeGreaterThan(0);
    expect(MAX_USED_ROWS_PER_SHEET).toBeGreaterThan(0);
    expect(MAX_USED_COLUMNS_PER_SHEET).toBeGreaterThan(0);
    expect(MAX_CELLS_INSPECTED).toBeGreaterThan(0);
    expect(MAX_TABLE_REGIONS_PER_SHEET).toBeGreaterThan(0);
    expect(MAX_MERGED_RANGES_INSPECTED).toBeGreaterThan(0);
    expect(MAX_BOQ_LINES_TOTAL).toBeGreaterThan(0);
  });

  it("caps the cells it inspects and discloses the truncation", async () => {
    const bytes = await buildWorkbook((workbook) => {
      const sheet = workbook.addWorksheet("Huge");
      for (let row = 1; row <= 400; row += 1) {
        for (let column = 1; column <= 20; column += 1) sheet.getCell(row, column).value = `${row}-${column}`;
      }
    });
    const analysis = await analyzeXlsxBytes(bytes, { limits: { maxCellsInspected: 500 } });
    expect(analysis.workbook.cellsInspected).toBeLessThanOrEqual(500);
    expect(analysis.workbook.truncated).toBe(true);
    expect(analysis.truncated).toBe(true);
    expect(analysis.limitations.join(" ")).toContain("workbook cell cap");
  });

  it("caps the worksheets it inspects and says how many there really were", async () => {
    const bytes = await buildWorkbook((workbook) => {
      for (let index = 0; index < 6; index += 1) workbook.addWorksheet(`Sheet${index}`).getCell("A1").value = "Item";
    });
    const analysis = await analyzeXlsxBytes(bytes, { limits: { maxWorksheets: 2 } });
    expect(analysis.workbook.sheetCount).toBe(6);
    expect(analysis.workbook.worksheets).toHaveLength(2);
    expect(analysis.workbook.limitations.join(" ")).toContain("only the first 2 of 6 worksheets");
  });

  it("refuses a workbook above the size limit instead of opening it", async () => {
    const bytes = await buildWorkbook((workbook) => {
      workbook.addWorksheet("BOQ").getCell("A1").value = "Item";
    });
    await expect(analyzeXlsxBytes(bytes, { limits: { maxWorkbookBytes: 10 } })).rejects.toThrow(/above the 10 byte inspection limit/u);
  });

  it("caps the table regions analyzed per sheet", async () => {
    const bytes = await buildWorkbook((workbook) => {
      const sheet = workbook.addWorksheet("Many");
      // Six two-row blocks separated by blank rows.
      for (let block = 0; block < 6; block += 1) {
        const start = block * 3 + 1;
        sheet.getCell(start, 1).value = "Item";
        sheet.getCell(start, 2).value = "Description";
        sheet.getCell(start, 3).value = "Qty";
        sheet.getCell(start + 1, 1).value = block + 1;
        sheet.getCell(start + 1, 2).value = `Item ${block + 1}`;
        sheet.getCell(start + 1, 3).value = block + 1;
      }
    });
    const analysis = await analyzeXlsxBytes(bytes, { limits: { maxTableRegionsPerSheet: 3 } });
    const sheet = analysis.workbook.worksheets[0]!;
    expect(sheet.regions.length).toBeLessThanOrEqual(3);
    expect(sheet.limitations.join(" ")).toContain("table regions");
  });
});

describe("column role vocabulary", () => {
  it("reads commercial and catalogue columns in English", () => {
    expect(classifyColumnRole("Brand").role).toBe("BRAND");
    expect(classifyColumnRole("Make").role).toBe("BRAND");
    expect(classifyColumnRole("Manufacturer").role).toBe("MANUFACTURER");
    expect(classifyColumnRole("Mfr").role).toBe("MANUFACTURER");
    expect(classifyColumnRole("Model").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("Model No").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("Reference").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("Ref").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("Remarks").role).toBe("REMARKS");
    expect(classifyColumnRole("Notes").role).toBe("REMARKS");
    expect(classifyColumnRole("Division").role).toBe("SECTION_OR_DIVISION");
  });

  it("reads the same columns in Arabic", () => {
    expect(classifyColumnRole("الماركة").role).toBe("BRAND");
    expect(classifyColumnRole("العلامة التجارية").role).toBe("BRAND");
    expect(classifyColumnRole("المصنع").role).toBe("MANUFACTURER");
    expect(classifyColumnRole("الموديل").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("الطراز").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("المرجع").role).toBe("MODEL_OR_REFERENCE");
    expect(classifyColumnRole("ملاحظات").role).toBe("REMARKS");
    expect(classifyColumnRole("القسم").role).toBe("SECTION_OR_DIVISION");
  });

  it("prefers the most specific synonym and keeps the weaker one as an alternative", () => {
    const classified = classifyColumnRole("Item Description");
    expect(classified.role).toBe("DESCRIPTION");
    expect(classified.alternatives).toContain("ITEM_NUMBER");
  });

  it("leaves an unrecognized header unassigned", () => {
    expect(classifyColumnRole("Zebra").role).toBe("UNKNOWN");
    expect(classifyColumnRole(null).role).toBe("UNKNOWN");
    expect(classifyColumnRole("").alternatives).toEqual([]);
  });

  it("exposes a closed vocabulary", () => {
    expect(isColumnRole("QUANTITY")).toBe(true);
    expect(isColumnRole("QUANTITIES")).toBe(false);
    expect(isRowRole("SUBTOTAL")).toBe(true);
    expect(isRowRole("HEADER")).toBe(true);
    expect(isRowRole("FOOTER")).toBe(false);
    expect(isTableRegionClassification("PRICE_SCHEDULE")).toBe(true);
    expect(isTableRegionClassification("INVOICE")).toBe(false);
  });
});

describe("row role vocabulary", () => {
  it("recognizes English total and subtotal markers", () => {
    expect(classifyRowRole({ texts: ["Total"] }).role).toBe("TOTAL");
    expect(classifyRowRole({ texts: ["Grand Total"] }).role).toBe("TOTAL");
    expect(classifyRowRole({ texts: ["Subtotal"] }).role).toBe("SUBTOTAL");
    expect(classifyRowRole({ texts: ["Carried Forward"] }).role).toBe("SUBTOTAL");
    expect(classifyRowRole({ texts: ["Brought Forward"] }).role).toBe("SUBTOTAL");
  });

  it("recognizes Arabic total and subtotal markers", () => {
    expect(classifyRowRole({ texts: ["المجموع"] }).role).toBe("TOTAL");
    expect(classifyRowRole({ texts: ["الإجمالي"] }).role).toBe("TOTAL");
    expect(classifyRowRole({ texts: ["الإجمالي العام"] }).role).toBe("TOTAL");
    expect(classifyRowRole({ texts: ["منقول"] }).role).toBe("SUBTOTAL");
    expect(classifyRowRole({ texts: ["مرحّل"] }).role).toBe("SUBTOTAL");
    expect(classifyRowRole({ texts: ["المجموع الفرعي"] }).role).toBe("SUBTOTAL");
  });

  it("classifies notes and blank rows", () => {
    expect(classifyRowRole({ texts: ["Note: all rates exclude tax"] }).role).toBe("NOTE");
    expect(classifyRowRole({ texts: [] }).role).toBe("BLANK");
  });

  it("recognizes a division banner as a section", () => {
    expect(classifyRowRole({ texts: ["DIVISION 26 - ELECTRICAL"] }).role).toBe("SECTION");
    expect(classifyRowRole({ texts: ["أعمال الكهرباء"] }).role).toBe("SECTION");
  });

  it("does not call an item row a section", () => {
    expect(classifyRowRole({ texts: ["1", "Cable", "m", "120"], types: ["NUMBER", "TEXT", "TEXT", "NUMBER"] }).role).toBe("DATA");
  });
});

describe("quantity and currency primitives", () => {
  it("keeps a non-numeric quantity as text with no numeric view", async () => {
    const bytes = await buildWorkbook((workbook) => {
      const sheet = workbook.addWorksheet("BOQ");
      ["Item", "Description", "Unit", "Qty"].forEach((header, index) => {
        sheet.getCell(1, index + 1).value = header;
      });
      sheet.getCell(2, 1).value = 1;
      sheet.getCell(2, 2).value = "Supply and install";
      sheet.getCell(2, 3).value = "lot";
      sheet.getCell(2, 4).value = "By contractor";
      sheet.getCell(3, 1).value = 2;
      sheet.getCell(3, 2).value = "Contingency";
      sheet.getCell(3, 3).value = "lot";
      sheet.getCell(3, 4).value = "TBC";
    });
    const analysis = await analyzeXlsxBytes(bytes);
    const lines = analysis.lines;
    expect(lines[0]?.quantity?.displayText).toBe("By contractor");
    expect(lines[0]?.quantityNumber).toBeNull();
    expect(lines[1]?.quantity?.displayText).toBe("TBC");
    expect(lines[1]?.quantityNumber).toBeNull();
  });

  it("reads a thousands-separated quantity as a number without reformatting it", () => {
    expect(numericViewOf({ type: "TEXT", value: "1,250", displayText: "1,250", displayFormatted: false, numberFormat: null, formula: null, cachedResult: null, cachedResultType: null, limitations: [] })).toBe(1250);
    expect(numericViewOf({ type: "TEXT", value: "TBC", displayText: "TBC", displayFormatted: false, numberFormat: null, formula: null, cachedResult: null, cachedResultType: null, limitations: [] })).toBeNull();
    expect(numericViewOf(null)).toBeNull();
  });

  it("detects only explicit currency and never guesses one", () => {
    expect(detectExplicitCurrency("Rate (USD)")?.code).toBe("USD");
    expect(detectExplicitCurrency("Amount KWD")?.code).toBe("KWD");
    expect(detectExplicitCurrency("KD 1,250.000")?.code).toBe("KWD");
    expect(detectExplicitCurrency("د.ك 125")?.code).toBe("KWD");
    expect(detectExplicitCurrency("$ 40")?.code).toBe("USD");
    // No currency is inferable from these, so none is reported.
    expect(detectExplicitCurrency("Rate")).toBeNull();
    expect(detectExplicitCurrency("Amount")).toBeNull();
    expect(detectExplicitCurrency("Kuwait")).toBeNull();
    expect(detectExplicitCurrency("")).toBeNull();
  });
});
