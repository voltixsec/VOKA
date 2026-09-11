import { describe, expect, it } from "vitest";
import { OBSERVATION_STATUS, extractObservations, type ObservedFact } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "../PdfTextExtractor";
import { BOQ_SHEET, DRAWING_SHEET, OCR_LAYER_SHEET, TEXT_SHEET, buildOrphanTextPdf, buildPdf } from "./fixtures/pdfFixtures";

function observe(pages: Parameters<typeof buildPdf>[0], options: Parameters<typeof buildPdf>[1] = {}) {
  const inspection = inspectPdfBytes(buildPdf(pages, options));
  return { inspection, result: extractObservations(inspection.pages) };
}

const ofType = (observations: ObservedFact[], type: ObservedFact["type"]) => observations.filter((item) => item.type === type);

describe("observed engineering/document facts (2A-1B)", () => {
  it("observes an explicit drawing/sheet number with exact page provenance", () => {
    const { result } = observe([DRAWING_SHEET]);
    const sheets = ofType(result.observations, "DRAWING_OR_SHEET_NUMBER");
    expect(sheets.map((item) => item.value)).toContain("ME-101");
    const sheet = sheets.find((item) => item.value === "ME-101")!;
    expect(sheet).toMatchObject({ pageNumber: 1, attribution: "PAGE_TREE", status: "OBSERVED_NOT_APPROVED", reliability: "HIGH" });
    expect(sheet.evidence.locator).toBe("page 1, line 3");
    expect(sheet.evidence.lineNumber).toBe(3);
    expect(sheet.evidence.snippet).toContain("DRAWING NO: ME-101");
    // The sheet number printed in "SHEET 3 OF 12" is observed separately, with its own locator.
    const sheetIndex = sheets.find((item) => item.value === "3");
    expect(sheetIndex?.evidence.locator).toBe("page 1, line 4");
  });

  it("observes a revision only when the revision text is literally present", () => {
    const withRevision = observe([DRAWING_SHEET]).result;
    expect(ofType(withRevision.observations, "REVISION").map((item) => item.value)).toEqual(["B"]);
    const withoutRevision = observe([BOQ_SHEET]).result;
    expect(ofType(withoutRevision.observations, "REVISION")).toEqual([]);
    // A revision-schedule style header is not a revision value.
    const header = extractObservations([{ pageNumber: 1, text: "REV DATE DESCRIPTION APPROVED", characterCount: 28, attribution: "PAGE_TREE" }]);
    expect(ofType(header.observations, "REVISION")).toEqual([]);
  });

  it("observes BOQ item, quantity, and unit as literal text without approval semantics", () => {
    const { result } = observe([BOQ_SHEET]);
    const quantity = ofType(result.observations, "QUANTITY").find((item) => item.value === "2")!;
    expect(quantity.status).toBe(OBSERVATION_STATUS);
    expect(quantity.reliability).toBe("MEDIUM");
    expect(quantity.evidence.snippet).toContain("2 nos");
    expect(quantity.limitations.join(" ")).toMatch(/not calculated, verified, or approved/u);
    expect(ofType(result.observations, "UNIT").map((item) => item.value)).toEqual(["nos", "nos", "m"]);
    expect(ofType(result.observations, "ITEM_NUMBER").map((item) => item.value)).toEqual(["1.1", "1.2", "1.3"]);
    // Observed values are copied, never summed: no total is produced from the rows.
    expect(result.observations.some((item) => /total|subtotal|sum/iu.test(item.value))).toBe(false);
    // No governed/approval surface is attached to any observation.
    for (const observation of result.observations) {
      expect(Object.keys(observation).sort()).toEqual(["attribution", "evidence", "limitations", "pageNumber", "reliability", "status", "type", "value"]);
      expect(observation.status).toBe("OBSERVED_NOT_APPROVED");
    }
  });

  it("never turns hidden/invisible text into a confirmed observation", () => {
    const { result } = observe([OCR_LAYER_SHEET]);
    expect(result.observations).toEqual([]);
    const text = result.limitations.join(" ");
    expect(text).toContain("invisible text layer");
    expect(text).toContain("was not used for observations");
    expect(JSON.stringify(result.observations)).not.toContain("A-201");
  });

  it("keeps pageNumber null and attribution UNATTRIBUTED for recovered text without a page", () => {
    const inspection = inspectPdfBytes(buildOrphanTextPdf(["DRAWING NO: A-201 REV: C", "1.1 Fire pump set 2 nos"]));
    const result = extractObservations(inspection.pages);
    expect(result.observations.length).toBeGreaterThan(0);
    for (const observation of result.observations) {
      expect(observation.pageNumber).toBeNull();
      expect(observation.attribution).toBe("UNATTRIBUTED");
      expect(observation.evidence.locator.startsWith("unattributed page, line ")).toBe(true);
    }
    const sheet = ofType(result.observations, "DRAWING_OR_SHEET_NUMBER").find((item) => item.value === "A-201")!;
    expect(sheet.evidence.locator).toBe("unattributed page, line 1");
    expect(sheet.limitations.join(" ")).toContain("page attribution is unproven");
  });

  it("copies project/document titles and spec text verbatim from visible lines", () => {
    const { result } = observe([DRAWING_SHEET]);
    expect(ofType(result.observations, "PROJECT_TITLE").map((item) => item.value)).toEqual(["SEAFRONT TOWER"]);
    expect(ofType(result.observations, "DOCUMENT_TITLE").map((item) => item.value)).toEqual(["LEVEL 6 HVAC LAYOUT"]);
    expect(ofType(result.observations, "SECTION_OR_DIVISION").map((item) => item.value)).toEqual(["23 31 13"]);
    expect(ofType(result.observations, "EQUIPMENT_TAG").map((item) => item.value)).toEqual(["AHU-01", "FCU-12", "FCU-13"]);
    expect(ofType(result.observations, "MODEL_OR_REFERENCE").map((item) => item.value)).toContain("SMACNA 2005");
    for (const observation of result.observations) {
      expect(observation.evidence.snippet.length).toBeGreaterThan(0);
      expect(observation.pageNumber).toBe(1);
    }
  });

  it("does not invent observations from prose that carries no labelled facts", () => {
    const { result } = observe([TEXT_SHEET]);
    expect(result.observations).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("does not read observations out of an encrypted PDF", () => {
    const { result } = observe([BOQ_SHEET], { encrypt: true });
    expect(result.observations).toEqual([]);
  });

  it("deduplicates the same observation from the same line and keeps the bound honest", () => {
    const { result } = observe([BOQ_SHEET, BOQ_SHEET]);
    const keys = result.observations.map((item) => `${item.type}|${item.value}|${item.pageNumber}|${item.evidence.lineNumber}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.observations.length).toBeLessThanOrEqual(400);
    expect(result.observations.some((item) => item.pageNumber === 1)).toBe(true);
    expect(result.observations.some((item) => item.pageNumber === 2)).toBe(true);
  });
});
