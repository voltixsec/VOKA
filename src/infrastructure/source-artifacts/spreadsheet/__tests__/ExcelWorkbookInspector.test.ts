import { describe, expect, it } from "vitest";
import {
  CORRUPT_ZIP,
  NOT_A_ZIP,
  OLE2_XLS,
  WORD_MAIN,
  XLSB_MAIN,
  XLSM_MAIN,
  XLSX_MAIN,
  boqWorkbook,
  containerDeclaring,
  fidelityWorkbook,
  zipOf,
  formulaWorkbook,
  hiddenContentWorkbook,
  multiSheetWorkbook,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { detectSpreadsheetFormat, inspectXlsxWorkbook } from "../ExcelWorkbookInspector";

/**
 * Phase 2A-6: format detection and workbook evidence.
 *
 * These tests run against real .xlsx bytes produced by ExcelJS, so the parser
 * under test is the same one production uses.
 */

describe("XLSX format detection", () => {
  it("recognizes a real workbook from its container rather than its file name", async () => {
    const decision = detectSpreadsheetFormat({ bytes: await boqWorkbook(), filename: "BOQ.xlsx" });
    expect(decision.format).toBe("XLSX");
    expect(decision.supported).toBe(true);
    expect(decision.evidence.join(" ")).toContain("OOXML spreadsheet workbook part");
  });

  it("rejects bytes that are not a ZIP container at all", () => {
    const decision = detectSpreadsheetFormat({ bytes: NOT_A_ZIP, filename: "boq.xlsx" });
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("not begin with a ZIP container signature");
  });

  it("rejects a corrupt ZIP truthfully instead of guessing", () => {
    const decision = detectSpreadsheetFormat({ bytes: CORRUPT_ZIP });
    expect(decision.supported).toBe(false);
    expect(decision.reason.length).toBeGreaterThan(0);
  });

  it("names legacy .xls as unsupported rather than failing generically", () => {
    const decision = detectSpreadsheetFormat({ bytes: OLE2_XLS, filename: "boq.xls" });
    expect(decision.format).toBe("XLS");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("legacy binary .xls");
  });

  it("refuses macro-enabled .xlsm and never mentions executing macros", () => {
    const decision = detectSpreadsheetFormat({ bytes: containerDeclaring(XLSM_MAIN), filename: "boq.xlsm" });
    expect(decision.format).toBe("XLSM");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("macro-enabled");
  });

  it("refuses binary .xlsb", () => {
    const decision = detectSpreadsheetFormat({ bytes: containerDeclaring(XLSB_MAIN), filename: "boq.xlsb" });
    expect(decision.format).toBe("XLSB");
    expect(decision.supported).toBe(false);
  });

  it("refuses a Word document that was renamed to .xlsx", () => {
    const decision = detectSpreadsheetFormat({
      bytes: containerDeclaring(WORD_MAIN, ["word/document.xml"]),
      filename: "boq.xlsx",
    });
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("Word document");
  });

  it("reports a ZIP without an OOXML content-types part as unknown, never as a workbook", () => {
    // A ZIP that simply is not an OOXML package: the container parses, but
    // nothing in it declares a workbook structure.
    const decision = detectSpreadsheetFormat({ bytes: zipOf([{ name: "hello.txt", data: Buffer.from("hello", "utf8") }]) });
    expect(decision.supported).toBe(false);
    expect(decision.format).toBe("UNKNOWN");
    expect(decision.reason).toContain("content-types");
  });

  it("discloses a VBA project as evidence and still never opens it", () => {
    const decision = detectSpreadsheetFormat({ bytes: containerDeclaring(XLSX_MAIN, ["xl/vbaProject.bin"]), filename: "boq.xlsx" });
    expect(decision.supported).toBe(true);
    expect(decision.limitations.join(" ")).toContain("no macro was read or executed");
  });

  it("discloses external links as evidence and never follows them", () => {
    const decision = detectSpreadsheetFormat({
      bytes: containerDeclaring(XLSX_MAIN, ["xl/externalLinks/externalLink1.xml"]),
      filename: "boq.xlsx",
    });
    expect(decision.limitations.join(" ")).toContain("no external workbook link was followed");
  });
});

describe("workbook and worksheet evidence", () => {
  it("keeps every sheet separate in a multi-sheet workbook", async () => {
    const inspection = await inspectXlsxWorkbook(await multiSheetWorkbook());
    expect(inspection.sheetCount).toBe(7);
    expect(inspection.visibleSheetCount).toBe(6);
    expect(inspection.hiddenSheetCount).toBe(1);
    expect(inspection.worksheets.map((sheet) => sheet.sheetName)).toContain("Electrical");
  });

  it("preserves a hidden sheet as hidden evidence with an explicit limitation", async () => {
    const inspection = await inspectXlsxWorkbook(await multiSheetWorkbook());
    const hidden = inspection.worksheets.find((sheet) => sheet.sheetName === "Hidden Rates");
    expect(hidden?.visibility).toBe("HIDDEN");
    expect(hidden?.limitations.join(" ")).toContain("hidden");
    expect(inspection.limitations.join(" ")).toContain("hidden evidence");
  });

  it("preserves hidden rows and hidden columns", async () => {
    const inspection = await inspectXlsxWorkbook(await hiddenContentWorkbook());
    const sheet = inspection.worksheets[0]!;
    expect(sheet.hiddenRowCount).toBe(1);
    expect(sheet.hiddenColumnCount).toBe(1);
    const hiddenRowCell = sheet.cells.find((cell) => cell.cellAddress === "B3");
    expect(hiddenRowCell?.hiddenRow).toBe(true);
    expect(hiddenRowCell?.limitations.join(" ")).toContain("hidden row");
    const hiddenColumnCell = sheet.cells.find((cell) => cell.cellAddress === "E2");
    expect(hiddenColumnCell?.hiddenColumn).toBe(true);
  });

  it("records a merged section range once, with its anchor text", async () => {
    const inspection = await inspectXlsxWorkbook(await boqWorkbook());
    const merge = inspection.worksheets[0]!.mergedRanges.find((entry) => entry.range === "A3:F3");
    expect(merge?.cellRef).toBe("Electrical!A3:F3");
    expect(merge?.text).toBe("DIVISION 26 - ELECTRICAL");
  });

  it("never copies merged text into the child cells it spans", async () => {
    const inspection = await inspectXlsxWorkbook(await boqWorkbook());
    const sheet = inspection.worksheets[0]!;
    const anchors = sheet.cells.filter((cell) => cell.cellRef === "Electrical!A3");
    expect(anchors).toHaveLength(1);
    // Only the anchor carries the value: B3..F3 hold nothing of their own.
    expect(sheet.cells.some((cell) => cell.cellAddress === "B3")).toBe(false);
    expect(sheet.cells.find((cell) => cell.cellRef === "Electrical!A5")?.isMergeAnchor).toBe(false);
  });
});

describe("cell value fidelity", () => {
  it("preserves the raw value and the formatted display text together", async () => {
    const inspection = await inspectXlsxWorkbook(await fidelityWorkbook());
    const cellAt = (address: string) => inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === address);
    expect(cellAt("A2")?.rawValue).toBe("00123");
    expect(cellAt("A2")?.displayText).toBe("00123");
    expect(cellAt("B2")?.rawValue).toBe(123);
    expect(cellAt("B2")?.displayFormatted).toBe(true);
  });

  it("keeps leading zeros exactly as the workbook displays them", async () => {
    const inspection = await inspectXlsxWorkbook(await fidelityWorkbook());
    const padded = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "B2");
    expect(padded?.displayText).toBe("00123");
    const textCode = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "A2");
    expect(textCode?.rawType).toBe("TEXT");
  });

  it("does not turn a part code into a number", async () => {
    const inspection = await inspectXlsxWorkbook(await fidelityWorkbook());
    const part = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "A3");
    expect(part?.displayText).toBe("0007-A");
    expect(part?.rawType).toBe("TEXT");
    const scientific = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "F2");
    expect(scientific?.displayText).toBe("1E10");
  });

  it("renders a date with the workbook's own format", async () => {
    const inspection = await inspectXlsxWorkbook(await fidelityWorkbook());
    const date = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "D2");
    expect(date?.rawType).toBe("DATE");
    expect(date?.displayText).toBe("02/01/2026");
  });

  it("renders a percentage and a currency format as the workbook wrote them", async () => {
    const inspection = await inspectXlsxWorkbook(await fidelityWorkbook());
    const percent = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "C2");
    expect(percent?.displayText).toBe("12.50%");
    const currency = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "E2");
    expect(currency?.displayText).toBe("KD 1,250.000");
  });
});

describe("formula behavior", () => {
  it("preserves the formula expression verbatim", async () => {
    const inspection = await inspectXlsxWorkbook(await formulaWorkbook());
    const formula = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "D2");
    expect(formula?.formula).toBe("B2*C2");
    expect(formula?.rawType).toBe("FORMULA_RESULT");
  });

  it("preserves the workbook's cached result without evaluating anything", async () => {
    const inspection = await inspectXlsxWorkbook(await formulaWorkbook());
    const formula = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "D2");
    expect(formula?.cachedResult).toBe(50);
    expect(formula?.limitations.join(" ")).toContain("never recalculated");
  });

  it("keeps a formula with no cached result and says no result was stored", async () => {
    const inspection = await inspectXlsxWorkbook(await formulaWorkbook());
    const formula = inspection.worksheets[0]!.cells.find((cell) => cell.cellAddress === "D3");
    expect(formula?.formula).toBe("B3*C3");
    expect(formula?.rawType).toBe("FORMULA");
    expect(formula?.cachedResult).toBeNull();
    expect(formula?.limitations.join(" ")).toContain("no cached result");
  });

  it("never exposes a computed value for a formula the workbook did not calculate", async () => {
    const inspection = await inspectXlsxWorkbook(await formulaWorkbook());
    const cells = inspection.worksheets[0]!.cells;
    const uncalculated = cells.find((cell) => cell.cellAddress === "D3");
    // B3*C3 would be 21; VOKA must not invent it.
    expect(uncalculated?.rawValue).toBeNull();
    expect(cells.some((cell) => cell.cellAddress === "D3" && cell.cachedResult === 21)).toBe(false);
  });
});
