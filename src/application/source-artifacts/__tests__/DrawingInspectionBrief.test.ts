import { describe, expect, it } from "vitest";
import { normalizeDrawingDrafts, type ObservedFact } from "@/src/domain/source-artifact";
import { projectArtifactInspection, renderInspectionBrief, type ArtifactAnalysisInput } from "../ArtifactInspectionProjection";

/**
 * Phase 2A-4: the governed brief for drawing semantic readings. EN + AR,
 * truthful about what ran, what did not, and what was NOT done.
 */

function drawingFact(type: string, value: string, pageNumber: number | null = 4, confidence: number | null = 0.9): ObservedFact {
  return normalizeDrawingDrafts(
    [{ type, description: value, confidence, region: null, limitations: [] }],
    { providerId: "test-provider", artifactId: "artifact-1", pageNumber, attribution: pageNumber === null ? "UNATTRIBUTED" : "PAGE_TREE", surface: "PAGE" },
  ).observations[0]!;
}

function pdfInspection(text = "DRAWING NO: M-201 REV: B") {
  return {
    format: "PDF" as const,
    text,
    pages: [],
    document: { pageCount: 12, pageAttributionReliable: true, encrypted: false, producer: null, creator: null, title: null, limitations: [] },
  };
}

function analysisWith(observations: ObservedFact[], drawing: ArtifactAnalysisInput["drawing"], limitations: string[] = []): ArtifactAnalysisInput {
  return {
    inspection: pdfInspection(),
    classification: null,
    observations,
    limitations,
    vision: { attempted: drawing?.attempted === true || observations.some((o) => o.visualOrigin), providerId: "test-provider" },
    drawing,
  };
}

describe("drawing inspection brief (EN)", () => {
  it("says what the drawing reading found and what it did NOT do", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "m-201.pdf",
      kind: "PDF",
      analysis: analysisWith(
        [drawingFact("DRAWING_NUMBER", "M-201"), drawingFact("REVISION", "B"), drawingFact("EQUIPMENT_REFERENCE", "AHU-01"), drawingFact("SYMBOL_CANDIDATE", "circle with a cross")],
        { attempted: true, pages: [4], outcome: "RAN" },
      ),
    });
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain("I inspected drawing page 4 visually for drawing semantics.");
    expect(brief).toContain("not measurements and not a quantity takeoff");
    expect(brief).toContain("Observed on drawings: drawing no.: M-201 (p4); revision: B (p4); equipment reference: AHU-01 (p4)");
    expect(brief).toContain("no symbol was counted and no quantity takeoff or BOM was produced");
    expect(brief).toContain("observed values only, not approved quantities and not selected products");
  });

  it("never prints raw enum tokens, statuses, or provenance codes", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "m-201.pdf",
      kind: "PDF",
      analysis: analysisWith(
        [drawingFact("PRINTED_SCALE", "1:100"), drawingFact("LEGEND_ENTRY", "FD = fire damper"), drawingFact("ROOM_OR_ZONE", "MEP ROOM 3")],
        { attempted: true, pages: [4], outcome: "RAN" },
      ),
    });
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toMatch(/printed scale: 1:100/iu);
    for (const token of ["DRAWING_NUMBER", "PRINTED_SCALE", "SYMBOL_CANDIDATE", "LEGEND_ENTRY", "EQUIPMENT_REFERENCE", "ROOM_OR_ZONE", "TITLE_BLOCK_PARTY", "OBSERVED_NOT_APPROVED", "OBSERVED_PENDING", "PAGE_TREE", "UNATTRIBUTED", "DRAWING_SEMANTICS", "NO_QUALIFIED_PAGES", "NOT_CONFIGURED", "PROVIDER_UNAVAILABLE", "VISION", "COMPLETED"]) {
      expect(brief).not.toContain(token);
    }
  });

  it("names an unattributed drawing page instead of inventing a number (M17)", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "orphan.pdf",
      kind: "PDF",
      analysis: analysisWith([drawingFact("SHEET_NUMBER", "1 of 1", null)], { attempted: true, pages: [null], outcome: "RAN" }),
    });
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain("an unattributed drawing page");
    expect(brief).not.toMatch(/drawing page \d/u);
  });

  it("says plainly when drawing vision did not run and why (M18)", () => {
    const notConfigured = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "set.pdf", kind: "PDF", analysis: analysisWith([], { attempted: false, pages: [1, 2], outcome: "NOT_CONFIGURED" }, ["drawing semantic vision is not configured in this runtime, so qualified drawing pages were not read visually"]),
    }), "en");
    expect(notConfigured).toContain("Drawing vision is not configured in this runtime, so qualified drawing pages were not read visually.");
    expect(notConfigured).not.toContain("Observed on drawings");

    const noEvidence = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "texty.pdf", kind: "PDF", analysis: analysisWith([], { attempted: false, pages: [], outcome: "NO_QUALIFIED_PAGES" }),
    }), "en");
    expect(noEvidence).toContain("No page carried credible drawing evidence, so drawing vision was not run; the pages need review.");

    const providerDown = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "set.pdf", kind: "PDF", analysis: analysisWith([], { attempted: false, pages: [1], outcome: "PROVIDER_UNAVAILABLE" }),
    }), "en");
    expect(providerDown).toContain("The drawing vision provider is unavailable, so qualified drawing pages were not read visually.");

    const ranEmpty = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "set.pdf", kind: "PDF", analysis: analysisWith([], { attempted: true, pages: [1], outcome: "RAN" }),
    }), "en");
    expect(ranEmpty).toContain("The drawing reading was attempted on the qualified pages but produced no usable drawing observations.");
  });

  it("low-confidence drawing output gets its own review sentence (M19)", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "blur.pdf",
      kind: "PDF",
      analysis: analysisWith([drawingFact("DRAWING_NUMBER", "M-2O1 or M-201", 4, 0.2)], { attempted: true, pages: [4], outcome: "RAN" }),
    });
    expect(summary.drawing.lowConfidence).toBe(true);
    expect(renderInspectionBrief(summary, "en")).toContain("Some drawing observations are low confidence; verify them against the sheet itself.");
  });

  it("conflicts with governed state are voiced without replacing anything", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "set.pdf",
      kind: "PDF",
      analysis: analysisWith([drawingFact("PROJECT_NAME", "DESERT GATE MEGAPLEX")], { attempted: true, pages: [4], outcome: "RAN" }),
      governedFacts: [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }],
    });
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain('the governed value is "Al Hamra Tower"');
    expect(brief).toContain('the file shows "DESERT GATE MEGAPLEX"');
    expect(brief).toContain("not replaced automatically");
  });
});

describe("drawing inspection brief (AR)", () => {
  it("is truthful in Arabic with the same boundaries", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "m-201.pdf",
      kind: "PDF",
      analysis: analysisWith(
        [drawingFact("DRAWING_NUMBER", "M-201"), drawingFact("REVISION", "B"), drawingFact("EQUIPMENT_REFERENCE", "AHU-01")],
        { attempted: true, pages: [4], outcome: "RAN" },
      ),
    });
    const brief = renderInspectionBrief(summary, "ar");
    expect(brief).toContain("فحصت صفحة الرسم 4 بصرياً لاستخلاص دلالات الرسم");
    expect(brief).toContain("وليست قياسات ولا حصراً للكميات");
    expect(brief).toContain("ما رُصد في الرسومات: رقم اللوحة: M-201 (ص 4)؛ المراجعة: B (ص 4)");
    expect(brief).toContain("لم يُعَدّ أي رمز ولم يُنتَج حصر كميات أو جدول مواد");
    expect(brief).not.toContain("Observed on drawings");
  });

  it("states non-availability and unattributed pages in Arabic too", () => {
    const notConfigured = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "set.pdf", kind: "PDF", analysis: analysisWith([], { attempted: false, pages: [1], outcome: "NOT_CONFIGURED" }),
    }), "ar");
    expect(notConfigured).toContain("غير مُهيّأ في هذه البيئة");

    const unattributed = renderInspectionBrief(projectArtifactInspection({
      artifactId: "artifact-1", filename: "orphan.pdf", kind: "PDF", analysis: analysisWith([drawingFact("SHEET_NUMBER", "1 of 1", null)], { attempted: true, pages: [null], outcome: "RAN" }),
    }), "ar");
    expect(unattributed).toContain("صفحة رسم غير منسوبة");
    expect(unattributed).not.toMatch(/صفحة الرسم \d/u);
  });

  it("never leaks enums or English tokens in the Arabic brief", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "set.pdf",
      kind: "PDF",
      analysis: analysisWith([drawingFact("TITLE_BLOCK_PARTY", "CONSULTANT: ABC"), drawingFact("DETAIL_REFERENCE", "5/DET-2")], { attempted: true, pages: [4], outcome: "RAN" }),
    });
    const brief = renderInspectionBrief(summary, "ar");
    for (const token of ["TITLE_BLOCK_PARTY", "DETAIL_REFERENCE", "OBSERVED_NOT_APPROVED", "DRAWING_SEMANTICS", "PROVIDER_UNAVAILABLE"]) {
      expect(brief).not.toContain(token);
    }
    expect(brief).toContain("نص إطار العنوان");
    expect(brief).toContain("مرجع تفصيلي");
  });
});

describe("drawing observations governance at the projection boundary", () => {
  it("no drawing type has a promotion path and the approval whitelist is untouched", async () => {
    const { governedFactKeyFor } = await import("../ArtifactCandidateFacts");
    const { DRAWING_OBSERVATION_TYPES } = await import("@/src/domain/source-artifact");
    for (const type of DRAWING_OBSERVATION_TYPES) {
      expect(governedFactKeyFor(type)).toBeNull();
    }
    // the only governed key in the whitelist is still exactly one
    expect(governedFactKeyFor("PROJECT_TITLE")).toBe("project.name");
  });

  it("every projected drawing observation keeps both provenance chains visible", () => {
    const summary = projectArtifactInspection({
      artifactId: "artifact-1",
      filename: "set.pdf",
      kind: "PDF",
      analysis: analysisWith(
        [
          { type: "REVISION", value: "REV B", status: "OBSERVED_NOT_APPROVED", pageNumber: 4, attribution: "PAGE_TREE", reliability: "HIGH", evidence: { snippet: "REV: B", locator: "page 4, line 2", lineNumber: 2 }, limitations: [] },
          drawingFact("REVISION", "REV C"),
        ],
        { attempted: true, pages: [4], outcome: "RAN" },
      ),
    });
    const revisions = summary.observations.filter((item) => item.type === "REVISION");
    expect(revisions.map((item) => item.value)).toEqual(["REV B", "REV C"]);
    expect(revisions[0]!.visualOrigin).toBeUndefined();
    expect(revisions[1]!.visualOrigin).toMatchObject({ source: "VISION" });
    for (const candidate of summary.candidates.filter((item) => item.observationType === "REVISION")) {
      expect(candidate.status).toBe("OBSERVED_PENDING_APPROVAL");
      expect(candidate.factKey).toBeNull();
    }
  });
});
