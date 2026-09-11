import { describe, expect, it } from "vitest";
import { ARTIFACT_CANDIDATE_STATUS, governedFactKeyFor, promoteArtifactCandidate, proposeArtifactCandidates } from "@/src/application/source-artifacts";
import { projectArtifactInspection, renderInspectionBrief, MAX_EXCERPT_CHARACTERS, MAX_PROJECTED_OBSERVATIONS } from "@/src/application/source-artifacts";
import { analyzePdfBytes } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";
import { BOQ_SHEET, DRAWING_SHEET, OCR_LAYER_SHEET, SCANNED_SHEET, buildOrphanTextPdf, buildPdf } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/pdfFixtures";
import type { AnalyzedPdfInspection } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";

function analyzed(bytes: Uint8Array): AnalyzedPdfInspection {
  return analyzePdfBytes(bytes);
}

const base = { artifactId: "artifact-1", filename: "tender.pdf", kind: "PDF" as const };

describe("governed artifact inspection projection (2A-1C)", () => {
  it("projects an inspected PDF with classification, provenance, and bounded content", () => {
    const summary = projectArtifactInspection({ ...base, analysis: analyzed(buildPdf([BOQ_SHEET])) });
    expect(summary.status).toBe("INSPECTED");
    expect(summary.classification?.value).toBe("BOQ_OR_SCHEDULE");
    expect(summary.classification?.reliability).toBe("HIGH");
    expect(summary.classification?.limitations.length).toBeGreaterThan(0);
    expect(summary.observations.length).toBeGreaterThan(0);
    for (const observation of summary.observations) {
      expect(observation.status).toBe("OBSERVED_NOT_APPROVED");
      expect(observation.locator).toMatch(/^page 1, line \d+$/u);
      expect(observation.pageNumber).toBe(1);
    }
    // The document text is never dumped: only a bounded excerpt is carried.
    expect(summary.excerpt?.length ?? 0).toBeLessThanOrEqual(MAX_EXCERPT_CHARACTERS);
    expect(summary.observations.length).toBeLessThanOrEqual(MAX_PROJECTED_OBSERVATIONS);
    expect(summary.governance.join(" ")).toContain("not approved");
    expect(JSON.stringify(summary)).not.toContain("PdfContentInterpreter");
  });

  it("says the artifact was not inspected when no analysis exists", () => {
    const summary = projectArtifactInspection({ ...base, analysis: null });
    expect(summary.status).toBe("NOT_INSPECTED");
    expect(summary.observations).toEqual([]);
    expect(summary.classification).toBeNull();
    expect(renderInspectionBrief(summary, "en")).toContain("has not been inspected");
    expect(renderInspectionBrief(summary, "ar")).toContain("لم يُفحص");
  });

  it("tells the user OCR/image understanding is unavailable for image-only pages", () => {
    const summary = projectArtifactInspection({ ...base, analysis: analyzed(buildPdf([SCANNED_SHEET])) });
    expect(summary.status).toBe("INSPECTED_NO_MACHINE_READABLE_TEXT");
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain("OCR");
    expect(brief).not.toContain("approved");
    expect(summary.limitations.join(" ")).toContain("image-only");
  });

  it("keeps observed quantities unapproved and without a promotion path", () => {
    const summary = projectArtifactInspection({ ...base, analysis: analyzed(buildPdf([BOQ_SHEET])) });
    const quantity = summary.candidates.find((candidate) => candidate.observationType === "QUANTITY");
    expect(quantity).toBeDefined();
    expect(quantity!.status).toBe(ARTIFACT_CANDIDATE_STATUS);
    expect(quantity!.status).not.toBe("APPROVED");
    expect(governedFactKeyFor("QUANTITY")).toBeNull();
    expect(quantity!.factKey).toBeNull();
    expect(quantity!.limitations.join(" ")).toContain("not calculated");
    expect(promoteArtifactCandidate(quantity!, { userMessage: "approve it", now: "2026-09-11T00:00:00.000Z" })).toBeNull();
  });

  it("never turns observed model or equipment text into a selected product", () => {
    const summary = projectArtifactInspection({ ...base, analysis: analyzed(buildPdf([DRAWING_SHEET])) });
    const model = summary.candidates.find((candidate) => candidate.observationType === "MODEL_OR_REFERENCE")!;
    const tag = summary.candidates.find((candidate) => candidate.observationType === "EQUIPMENT_TAG")!;
    expect(model.factKey).toBeNull();
    expect(tag.factKey).toBeNull();
    expect(Object.values({ model: model.factKey, tag: tag.factKey }).every((key) => key === null)).toBe(true);
    expect(renderInspectionBrief(summary, "en")).not.toMatch(/selected product|product selected|system complete/iu);
  });

  it("records a conflict without overwriting governed state", () => {
    const governedFacts = [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" as const }];
    const summary = projectArtifactInspection({ ...base, analysis: analyzed(buildPdf([DRAWING_SHEET])), governedFacts });
    expect(summary.conflicts.length).toBe(1);
    expect(summary.conflicts[0]).toMatchObject({ key: "project.name", governedValue: "Al Hamra Tower", governedProvenance: "USER_EXPLICIT", observedValue: "SEAFRONT TOWER" });
    // Governed input is untouched: the projection never mutates what the workspace holds.
    expect(governedFacts[0]).toEqual({ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
    const candidate = summary.candidates.find((item) => item.observationType === "PROJECT_TITLE")!;
    expect(candidate.factKey).toBe("project.name");
    expect(candidate.status).toBe(ARTIFACT_CANDIDATE_STATUS);
    expect(promoteArtifactCandidate(candidate, { userMessage: "what is in the file?", now: "2026-09-11T00:00:00.000Z" })).toBeNull();
    expect(promoteArtifactCandidate(candidate, { userMessage: "approve SEAFRONT TOWER as the project", now: "2026-09-11T00:00:00.000Z" })).toEqual({ key: "project.name", value: "SEAFRONT TOWER", provenance: "USER_EXPLICIT", evidence: "SEAFRONT TOWER" });
  });

  it("creates no candidates from hidden/invisible text", () => {
    const analysis = analyzed(buildPdf([OCR_LAYER_SHEET]));
    expect(analysis.observations).toEqual([]);
    const summary = projectArtifactInspection({ ...base, analysis });
    expect(summary.candidates).toEqual([]);
    expect(summary.observations).toEqual([]);
    expect(summary.limitations.join(" ")).toContain("invisible text layer");
  });

  it("preserves pageNumber null for unattributed observations and candidates", () => {
    const analysis = analyzed(buildOrphanTextPdf(["DRAWING NO: A-201 REV: C", "1.1 Fire pump set 2 nos"]));
    const summary = projectArtifactInspection({ ...base, analysis });
    expect(summary.observations.length).toBeGreaterThan(0);
    for (const observation of summary.observations) {
      expect(observation.pageNumber).toBeNull();
      expect(observation.locator.startsWith("unattributed page")).toBe(true);
    }
    for (const candidate of summary.candidates) {
      expect(candidate.pageNumber).toBeNull();
      expect(candidate.attribution).toBe("UNATTRIBUTED");
    }
  });

  it("retains both sides when two observations disagree on one governed key", () => {
    const first = proposeArtifactCandidates({ artifactId: "a", observations: analyzed(buildPdf([DRAWING_SHEET])).observations });
    const second = proposeArtifactCandidates({ artifactId: "a", observations: analyzed(buildPdf([{ width: 595, height: 842, lines: ["PROJECT: OTHER TOWER"] }])).observations, existing: first.candidates });
    const titles = second.candidates.filter((candidate) => candidate.observationType === "PROJECT_TITLE");
    expect(titles.map((candidate) => candidate.value).sort()).toEqual(["OTHER TOWER", "SEAFRONT TOWER"]);
    expect(titles.every((candidate) => candidate.status === ARTIFACT_CANDIDATE_STATUS)).toBe(true);
  });
});
