import { describe, expect, it } from "vitest";
import {
  boqWorkbook,
  currencyWorkbook,
  longBoqWorkbook,
  multiSheetWorkbook,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { analyzeXlsxBytes } from "@/src/infrastructure/source-artifacts/spreadsheet/SpreadsheetInspectionAnalyzer";
import {
  MAX_PROJECTED_BOQ_LINES,
  MAX_PROJECTED_CELLS,
  MAX_PROJECTED_REGIONS,
  MAX_PROJECTED_SHEETS,
  projectSpreadsheetAnalysis,
  renderSpreadsheetBrief,
} from "../SpreadsheetInspectionProjection";
import { projectSpreadsheetInspection } from "../ArtifactInspectionProjection";

/**
 * Phase 2A-6: bounded projection and truthful assistant language.
 *
 * The projection is the only thing an assistant ever sees, so these tests are
 * about two different risks: that a large workbook could flood the context, and
 * that a truthful reading could be phrased in a way that overclaims.
 */

async function summaryOf(bytes: Buffer) {
  const analysis = await analyzeXlsxBytes(bytes);
  return projectSpreadsheetInspection({ artifactId: "artifact-1", filename: "BOQ.xlsx", analysis });
}

describe("projection bounds", () => {
  it("bounds the sheets, regions, lines, and cells it exposes", async () => {
    const summary = await summaryOf(await multiSheetWorkbook());
    expect(summary.spreadsheet.sheets.length).toBeLessThanOrEqual(MAX_PROJECTED_SHEETS);
    expect(summary.spreadsheet.regions.length).toBeLessThanOrEqual(MAX_PROJECTED_REGIONS);
    expect(summary.spreadsheet.lines.length).toBeLessThanOrEqual(MAX_PROJECTED_BOQ_LINES);
    expect(summary.spreadsheet.citedCells.length).toBeLessThanOrEqual(MAX_PROJECTED_CELLS);
  });

  it("truncates a long BOQ honestly rather than silently dropping rows", async () => {
    const analysis = await analyzeXlsxBytes(await longBoqWorkbook(40));
    const projected = projectSpreadsheetAnalysis(analysis);
    expect(analysis.lines.length).toBeGreaterThan(MAX_PROJECTED_BOQ_LINES);
    expect(projected.lines).toHaveLength(MAX_PROJECTED_BOQ_LINES);
    // The full count survives so the truncation is visible, not hidden.
    expect(projected.lineCount).toBe(analysis.lines.length);
    expect(projected.truncated).toBe(true);
  });

  it("states the workbook channel's own governance", async () => {
    const summary = await summaryOf(await boqWorkbook());
    expect(summary.kind).toBe("XLSX");
    expect(summary.pageCount).toBeNull();
    expect(summary.governance.join(" ")).toContain("never recalculated");
    expect(summary.governance.join(" ")).toContain("no unit conversion, no currency conversion");
  });

  it("produces no governed candidates from workbook evidence", async () => {
    const summary = await summaryOf(await boqWorkbook());
    expect(summary.candidates).toHaveLength(0);
    expect(summary.conflicts).toHaveLength(0);
    expect(summary.observations).toHaveLength(0);
  });
});

describe("English brief", () => {
  it("describes the workbook and the table region truthfully", async () => {
    const summary = await summaryOf(await boqWorkbook());
    const brief = renderSpreadsheetBrief(summary, "en");
    expect(brief).toContain("BOQ.xlsx");
    expect(brief).toMatch(/structured BOQ-style table on sheet 'Electrical'/u);
    expect(brief).toMatch(/covering A\d+:F\d+/u);
  });

  it("states an observed quantity is not an approved engineering quantity", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "en");
    expect(brief).toMatch(/observed quantity of 120 with unit 'm'/u);
    expect(brief).toContain("has not been approved as an engineering quantity");
  });

  it("says it did not recalculate a formula", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "en");
    expect(brief).toContain("contains a formula");
    expect(brief).toContain("I did not recalculate the formula");
    expect(brief).not.toContain("recalculated and verified");
  });

  it("discloses truncation when the view is bounded", async () => {
    const analysis = await analyzeXlsxBytes(await longBoqWorkbook(40));
    const summary = projectSpreadsheetInspection({ artifactId: "a", filename: "Long.xlsx", analysis });
    expect(renderSpreadsheetBrief(summary, "en")).toContain("bounded part of this workbook");
  });

  it("says plainly that no governed record was created", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "en");
    expect(brief).toContain("No requirement, quotation line, bill of materials, or procurement record was created");
  });

  it("names an explicit currency without converting it", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await currencyWorkbook()), "en");
    expect(brief).toContain("states the currency explicitly");
    expect(brief).toContain("no currency conversion");
  });

  it("treats hidden sheets as hidden evidence", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await multiSheetWorkbook()), "en");
    expect(brief).toContain("hidden");
  });
});

describe("Arabic brief", () => {
  it("describes the workbook and region in Arabic", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "ar");
    expect(brief).toContain("جدول كميات");
    expect(brief).toContain("Electrical");
  });

  it("states an observed quantity is not approved, in Arabic", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "ar");
    expect(brief).toContain("كمية مرصودة");
    expect(brief).toContain("لم تُعتمد هذه الكمية كمية هندسية");
  });

  it("says it did not recalculate a formula, in Arabic", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "ar");
    expect(brief).toContain("لم أعد حساب الصيغة");
  });

  it("says plainly that no governed record was created, in Arabic", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "ar");
    expect(brief).toContain("لم يُنشأ أي متطلب");
  });
});

describe("no enumeration leakage", () => {
  it("never prints a raw role, classification, or reliability token into the brief", async () => {
    const summary = await summaryOf(await boqWorkbook());
    for (const locale of ["en", "ar"] as const) {
      const brief = renderSpreadsheetBrief(summary, locale);
      // The file name is user data and may legitimately contain any word, so
      // it is removed before the token check.
      const prose = brief.split(summary.filename).join(" ");
      for (const token of ["ITEM_NUMBER", "DESCRIPTION", "QUANTITY", "PRICE_SCHEDULE", "OBSERVED_NOT_APPROVED", "FORMULA_RESULT", "GENERIC_TABLE", "SECTION_OR_DIVISION"]) {
        expect(prose).not.toContain(token);
      }
      // Uppercase status and reliability words must never appear as bare tokens.
      expect(prose).not.toMatch(/\b(HIGH|MEDIUM|LOW)\b/u);
      expect(prose).not.toMatch(/\b(VISIBLE|HIDDEN|VERY_HIDDEN|DATA|TOTAL|NOTE)\b/u);
      // BOQ survives only as the plain phrase, never as a bare classification.
      expect(prose).not.toMatch(/\bBOQ\b(?!-style)/u);
    }
  });

  it("narrates only regions it could classify, and counts the rest", async () => {
    const brief = renderSpreadsheetBrief(await summaryOf(await boqWorkbook()), "en");
    expect(brief).toContain("could not classify confidently");
    expect(brief).not.toContain("undetermined type");
  });

  it("keeps structured tokens out of the user-facing projected line values", async () => {
    const summary = await summaryOf(await boqWorkbook());
    for (const line of summary.spreadsheet.lines) {
      expect(line.quantity === null || /^[\d.,]+$/u.test(line.quantity)).toBe(true);
    }
  });
});
