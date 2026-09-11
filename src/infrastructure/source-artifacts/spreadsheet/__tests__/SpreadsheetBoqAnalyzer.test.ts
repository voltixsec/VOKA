import { describe, expect, it } from "vitest";
import {
  arabicBoqWorkbook,
  boqWorkbook,
  currencyWorkbook,
  multiSheetWorkbook,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { OBSERVATION_STATUS } from "@/src/domain/source-artifact";
import { analyzeXlsxBytes } from "../SpreadsheetInspectionAnalyzer";

/**
 * Phase 2A-6: observed structured BOQ line candidates.
 *
 * These tests are the governance backstop for the whole phase: they prove that
 * a line candidate is a reading of a workbook and nothing more — no approved
 * quantity, no converted unit, no inferred currency, and no object of any kind
 * in governed state.
 */

describe("structured line candidates", () => {
  it("builds a line candidate from a data row with its exact row range", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 5);
    expect(line).toBeDefined();
    expect(line?.sheetName).toBe("Electrical");
    expect(line?.cellRef).toBe("Electrical!A5:F5");
    expect(line?.description?.displayText).toBe("PVC insulated cable 4mm");
  });

  it("carries observed quantity, unit, rate, and amount as workbook literals", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 9)!;
    expect(line.quantity?.displayText).toBe("10");
    expect(line.quantityNumber).toBe(10);
    expect(line.unit?.displayText).toBe("pcs");
    expect(line.rate?.displayText).toBe("8");
    expect(line.amount?.displayText).toBe("80");
  });

  it("marks every line as observed and not approved", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    expect(analysis.lines.length).toBeGreaterThan(0);
    for (const line of analysis.lines) expect(line.status).toBe(OBSERVATION_STATUS);
    for (const line of analysis.lines) {
      expect(line.limitations.join(" ")).toContain("not a requirement");
    }
  });

  it("never turns a subtotal, total, or repeated header into a line", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const rowNumbers = analysis.lines.map((line) => line.rowNumber);
    expect(rowNumbers).not.toContain(8);
    expect(rowNumbers).not.toContain(11);
    expect(rowNumbers).not.toContain(12);
  });

  it("keeps a quantity observed without promoting it", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 5)!;
    // A numeric view exists for review, but the literal stays authoritative
    // and the baseline limitation restates that nothing was approved.
    expect(line.quantityNumber).toBe(120);
    expect(line.quantity?.type).toBe("NUMBER");
    expect(line.quantity?.displayText).toBe("120");
    expect(line.limitations.join(" ")).toContain("not a requirement");
    expect(line.limitations.join(" ")).toContain("or approved quantity");
  });

  it("preserves a unit verbatim and never converts it", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const units = analysis.lines.map((line) => line.unit?.displayText);
    expect(units).toContain("m");
    expect(units).toContain("pcs");
    // No conversion: metres were not turned into millimetres or feet.
    expect(units.every((unit) => !unit || ["m", "pcs"].includes(unit))).toBe(true);
  });

  it("inherits section context conservatively, named with the range it came from", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 5)!;
    expect(line.sectionContext).toBe("DIVISION 26 - ELECTRICAL");
    expect(line.sectionContextRef).toBe("Electrical!A3:F3");
    // The inherited context is disclosed, so it can never be read as a value
    // that sits on the item row itself.
    expect(line.limitations.join(" ")).toContain("inherited from a heading row");
  });

  it("does not carry section context across a totals block", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const afterTotals = analysis.lines.filter((line) => line.rowNumber > 12);
    for (const line of afterTotals) expect(line.sectionContext).toBeNull();
  });

  it("supports Arabic BOQ headers and Arabic section context", async () => {
    const analysis = await analyzeXlsxBytes(await arabicBoqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 3);
    expect(line?.description?.displayText).toBe("كابل نحاسي 4 مم");
    expect(line?.unit?.displayText).toBe("م");
    expect(line?.quantityNumber).toBe(150);
    expect(line?.sectionContext).toBe("أعمال الكهرباء");
  });

  it("never merges rows across sheets, even when headers match", async () => {
    const analysis = await analyzeXlsxBytes(await multiSheetWorkbook());
    const sheets = new Set(analysis.lines.map((line) => line.sheetName));
    expect(sheets.size).toBeGreaterThan(1);
    for (const line of analysis.lines) {
      expect(line.cellRef.startsWith(`${line.sheetName}!`)).toBe(true);
    }
  });

  it("flags a formula row without claiming to have evaluated it", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 5)!;
    expect(line.hasFormula).toBe(true);
    expect(line.amount?.formula).toBe("D5*E5");
    expect(line.amount?.cachedResult).toBe(300);
    expect(line.limitations.join(" ")).toContain("never recalculated");
  });
});

describe("currency", () => {
  it("records a currency the workbook states explicitly, with its exact cell", async () => {
    const analysis = await analyzeXlsxBytes(await currencyWorkbook());
    expect(analysis.currency.length).toBeGreaterThan(0);
    expect(analysis.currency[0]?.code).toBe("USD");
    expect(analysis.currency[0]?.cellRef).toBe("BOQ!C1");
  });

  it("never infers a currency from a header that does not state one", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    // The workbook declares no currency anywhere, so none may be reported.
    expect(analysis.currency).toHaveLength(0);
  });

  it("performs no conversion: the code is recorded, no amount is recomputed", async () => {
    const analysis = await analyzeXlsxBytes(await currencyWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 2)!;
    expect(line.rate?.displayText).toBe("5");
    expect(line.amount?.displayText).toBe("50");
    for (const entry of analysis.currency) {
      expect(entry.limitations.join(" ")).toContain("no conversion");
    }
  });
});

describe("provenance", () => {
  it("keeps page numbers out of spreadsheet evidence entirely", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const serialized = JSON.stringify(analysis);
    // A workbook has no pages: no page number may appear anywhere in the model.
    expect(serialized).not.toContain("\"pageNumber\"");
    for (const line of analysis.lines) {
      expect(line.cellRef).toMatch(/!A\d+:F\d+$/u);
    }
  });

  it("gives each line bounded cell-level references", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 9)!;
    expect(line.cellRefs.length).toBeGreaterThan(0);
    expect(line.cellRefs.every((ref) => ref.startsWith("Electrical!"))).toBe(true);
  });
});
