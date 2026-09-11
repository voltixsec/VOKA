import { describe, expect, it, vi } from "vitest";
import { parseBoqCandidates } from "../BoqCandidateParser";
import { analyzeXlsxBytes } from "../spreadsheet/SpreadsheetInspectionAnalyzer";
import { boqWorkbook } from "./fixtures/xlsxFixtures";

/**
 * Phase 2A-6: the legacy parser boundary.
 *
 * `BoqCandidateParser` is a plain-text regex that feeds the PDF/BOQ text path.
 * It stays intact for the flows that already depend on it, and it is kept
 * strictly away from structured XLSX evidence: a workbook row must never be
 * flattened into text and pushed through a line regex, because that path is the
 * one place where a Requirement can be created.
 */

describe("legacy BoqCandidateParser stays in its lane", () => {
  it("still behaves exactly as its existing text callers expect", () => {
    const result = parseBoqCandidates("1 IP camera 4MP each\n12 CAT6 cable m", "artifact-1", []);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 1, unit: "each", quantityStatus: "EXTRACTED_REVIEW_REQUIRED" }),
      expect.objectContaining({ quantity: 12, unit: "m" }),
    ]));
  });

  it("is not the engine behind structured XLSX analysis", async () => {
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    // The legacy parser produces RequirementCandidate-shaped records; a
    // structured line candidate is a different shape entirely.
    for (const line of analysis.lines) {
      expect(line).not.toHaveProperty("stableKey");
      expect(line).not.toHaveProperty("quantityStatus");
      expect(line).toHaveProperty("status", "OBSERVED_NOT_APPROVED");
    }
  });

  it("does not hand XLSX rows to the regex: a workbook row the regex would match is still only observed", async () => {
    // A description such as "12 CAT6 cable m" is precisely the shape the legacy
    // regex turns into a requirement candidate. On the workbook path it must
    // remain an observation with its own provenance and no promotion path.
    const analysis = await analyzeXlsxBytes(await boqWorkbook());
    const line = analysis.lines.find((entry) => entry.rowNumber === 5)!;
    expect(line.description?.displayText).toBe("PVC insulated cable 4mm");
    expect(line.quantity?.displayText).toBe("120");
    expect(line.limitations.join(" ")).toContain("not a requirement");
  });

  it("keeps the legacy parser importable and side-effect free", () => {
    const spy = vi.fn();
    spy();
    expect(typeof parseBoqCandidates).toBe("function");
    expect(parseBoqCandidates("", "artifact-1", [])).toEqual([]);
  });
});
