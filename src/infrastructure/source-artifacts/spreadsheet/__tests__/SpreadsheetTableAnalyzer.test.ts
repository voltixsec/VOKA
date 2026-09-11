import { describe, expect, it } from "vitest";
import {
  ambiguousHeaderWorkbook,
  arabicBoqWorkbook,
  boqWorkbook,
  multiRegionWorkbook,
  threeRowHeaderWorkbook,
  twoRowHeaderWorkbook,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { analyzeXlsxBytes } from "../SpreadsheetInspectionAnalyzer";

/**
 * Phase 2A-6: table-region detection, column roles, and row roles.
 *
 * The rules under test are the ones that stop a workbook from being misread: a
 * repeated header must not become an item, a total must not become a quantity,
 * and an ambiguous header must stay ambiguous.
 */

async function regionsOf(bytes: Buffer) {
  const analysis = await analyzeXlsxBytes(bytes);
  return analysis.workbook.worksheets.flatMap((sheet) => sheet.regions);
}

describe("table region detection", () => {
  it("finds more than one region on a sheet and separates them by a blank row", async () => {
    const regions = await regionsOf(await multiRegionWorkbook());
    const tables = regions.filter((region) => region.classification.value !== "UNKNOWN");
    expect(tables.length).toBeGreaterThanOrEqual(2);
    expect(tables[0]?.startRow).toBe(1);
    expect(tables[1]?.startRow).toBe(4);
    // The blank row 3 is the boundary: it belongs to neither region.
    expect(tables[0]?.endRow).toBeLessThan(tables[1]!.startRow);
  });

  it("does not treat a lone note row as a table", async () => {
    const regions = await regionsOf(await multiRegionWorkbook());
    expect(regions.some((region) => region.startRow === 7)).toBe(false);
  });

  it("classifies a real BOQ as a BOQ from its structure, not its file name", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const boq = regions.find((region) => region.classification.value === "BOQ");
    expect(boq).toBeDefined();
    expect(boq?.classification.reliability).toBe("HIGH");
    expect(boq?.classification.evidence.join(" ")).toContain("description");
  });
});

describe("header handling", () => {
  it("reads a two-row header by combining each column's own cells", async () => {
    const regions = await regionsOf(await twoRowHeaderWorkbook());
    const region = regions[0]!;
    expect(region.header?.rowCount).toBe(2);
    const roles = Object.fromEntries(region.columnRoles.map((entry) => [entry.columnLetter, entry.role]));
    expect(roles.A).toBe("ITEM_NUMBER");
    expect(roles.B).toBe("DESCRIPTION");
    expect(roles.C).toBe("UNIT");
    expect(roles.D).toBe("QUANTITY");
  });

  it("reads a three-row header and no deeper", async () => {
    const regions = await regionsOf(await threeRowHeaderWorkbook());
    const region = regions[0]!;
    expect(region.header?.rowCount).toBeLessThanOrEqual(3);
    const roles = Object.fromEntries(region.columnRoles.map((entry) => [entry.columnLetter, entry.role]));
    expect(roles.C).toBe("QUANTITY");
    expect(roles.D).toBe("UNIT");
  });

  it("keeps merged heading rows out of the header band", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const boq = regions.find((region) => region.classification.value === "BOQ")!;
    // Row 3 is the merged division banner; the header is row 4 alone.
    expect(boq.header?.startRow).toBe(4);
    expect(boq.header?.rowCount).toBe(1);
  });
});

describe("row roles", () => {
  it("classifies a repeated header as a header, never as data", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const second = regions.find((region) => region.startRow === 8);
    const headerRow = second?.rowRoles.find((entry) => entry.rowNumber === 8);
    expect(headerRow?.role).toBe("HEADER");
    expect(second?.rowRoleCounts.DATA).toBe(1);
  });

  it("never lets a subtotal or total become an item line", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const totals = regions.flatMap((region) => region.rowRoles).filter((entry) => ["SUBTOTAL", "TOTAL"].includes(entry.role));
    expect(totals.length).toBeGreaterThanOrEqual(2);
    expect(totals.some((entry) => entry.role === "SUBTOTAL")).toBe(true);
    expect(totals.some((entry) => entry.role === "TOTAL")).toBe(true);
    // Totals block produced no DATA rows at all.
    const totalsRegion = regions.find((region) => region.rowRoles.some((entry) => entry.role === "TOTAL"))!;
    expect(totalsRegion.dataRowCount).toBe(0);
  });

  it("classifies a merged division banner as a section row", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const boq = regions.find((region) => region.classification.value === "BOQ")!;
    const banner = boq.rowRoles.find((entry) => entry.rowNumber === 3);
    expect(banner?.role).toBe("SECTION");
  });
});

describe("column roles", () => {
  it("reads English BOQ headers", async () => {
    const regions = await regionsOf(await boqWorkbook());
    const boq = regions.find((region) => region.classification.value === "BOQ")!;
    const roles = Object.fromEntries(boq.columnRoles.map((entry) => [entry.columnLetter, entry.role]));
    expect(roles).toMatchObject({
      A: "ITEM_NUMBER",
      B: "DESCRIPTION",
      C: "UNIT",
      D: "QUANTITY",
      E: "RATE",
      F: "AMOUNT",
    });
  });

  it("reads Arabic BOQ headers", async () => {
    const regions = await regionsOf(await arabicBoqWorkbook());
    const boq = regions.find((region) => region.classification.value === "BOQ");
    expect(boq).toBeDefined();
    const roles = Object.fromEntries(boq!.columnRoles.map((entry) => [entry.columnLetter, entry.role]));
    expect(roles).toMatchObject({
      A: "ITEM_NUMBER",
      B: "DESCRIPTION",
      C: "UNIT",
      D: "QUANTITY",
      E: "RATE",
      F: "AMOUNT",
    });
  });

  it("leaves a genuinely ambiguous header ambiguous instead of guessing", async () => {
    const regions = await regionsOf(await ambiguousHeaderWorkbook());
    const region = regions[0]!;
    const ambiguous = region.columnRoles.find((entry) => entry.columnLetter === "A");
    expect(ambiguous?.role).toBe("UNKNOWN");
    expect(ambiguous?.alternatives).toEqual(expect.arrayContaining(["ITEM_NUMBER", "UNIT"]));
    expect(ambiguous?.reliability).toBe("LOW");
  });

  it("records a column with no header as unassigned rather than inventing a role", async () => {
    const regions = await regionsOf(await twoRowHeaderWorkbook());
    const unassigned = regions[0]!.columnRoles.find((entry) => entry.headerText === null);
    if (unassigned) {
      expect(unassigned.role).toBe("UNKNOWN");
      expect(unassigned.limitations.join(" ")).toContain("no header text");
    }
  });
});
