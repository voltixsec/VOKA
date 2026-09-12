import { describe, expect, it } from "vitest";
import {
  MAX_PROJECTED_IFC_CANDIDATES,
  MAX_PROJECTED_IFC_CITATIONS,
  MAX_PROJECTED_IFC_ELEMENTS,
  emptyProjectedIfc,
  projectIfcAnalysis,
  renderIfcBrief,
} from "../IfcInspectionProjection";
import { projectIfcInspection, renderInspectionBrief } from "../ArtifactInspectionProjection";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc";
import {
  conflictingIfcModel,
  fullIfcModel,
  ifc4x3Model,
  largeIfcModel,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8 test matrix items 53-62: bounded assistant projection and
 * truthful bilingual briefs.
 */

function projected(source = fullIfcModel()) {
  return projectIfcInspection({
    artifactId: "artifact-1",
    filename: "seafront.ifc",
    analysis: analyzeIfcBytes(Buffer.from(source, "utf8"), { filename: "seafront.ifc" }),
  });
}

describe("IFC projection bounds", () => {
  it("53 bounds elements, candidates, and citations", () => {
    const summary = projectIfcInspection({
      artifactId: "a",
      filename: "big.ifc",
      analysis: analyzeIfcBytes(Buffer.from(largeIfcModel(40), "utf8"), { limits: { maxRetainedElements: 40 } }),
    });
    expect(summary.ifc.elements.length).toBeLessThanOrEqual(MAX_PROJECTED_IFC_ELEMENTS);
    expect(summary.ifc.candidates.length).toBeLessThanOrEqual(MAX_PROJECTED_IFC_CANDIDATES);
    expect(summary.ifc.citedLocators.length).toBeLessThanOrEqual(MAX_PROJECTED_IFC_CITATIONS);
    for (const locator of summary.ifc.citedLocators) expect(locator.startsWith("IFC:")).toBe(true);
  });

  it("54 returns an empty projection when analysis is null", () => {
    expect(projectIfcAnalysis(null)).toEqual(emptyProjectedIfc());
  });

  it("55 never carries a page number", () => {
    const summary = projected();
    expect(summary.kind).toBe("IFC");
    expect(summary.pageCount).toBeNull();
    expect(summary.observations).toEqual([]);
    expect(summary.candidates).toEqual([]);
  });
});

describe("English IFC brief", () => {
  it("56 names schema, building, storey, space, typed element, and declared quantity", () => {
    const brief = renderInspectionBrief(projected(), "en");
    expect(brief).toContain("schema IFC4");
    expect(brief).toMatch(/2 storeys/u);
    expect(brief).toContain("Lobby");
    expect(brief).toContain("SD-01");
    expect(brief).toContain("Smoke Detector Type");
    expect(brief).toContain("Fire Alarm");
    expect(brief).toContain("GrossFloorArea");
    expect(brief).toContain("42.5");
    expect(brief).toContain("did not calculate");
    expect(brief).toContain("milli metre");
    expect(brief).toContain("Siemens");
    expect(brief).toContain("does not create a supplier");
    expect(brief).toContain("Concrete");
    expect(brief).toContain("external document which was not opened");
    expect(brief).toContain("No equipment was counted");
    expect(brief).not.toMatch(/page \d/iu);
  });

  it("57 keeps conflicting readings visible", () => {
    const brief = renderInspectionBrief(projected(conflictingIfcModel()), "en");
    expect(brief).toContain("Heat Detector");
    expect(brief).toContain("Smoke Detector");
    expect(brief).toContain("did not prefer one over another");
  });

  it("58 discloses IFC4X3 generic inspection", () => {
    const brief = renderInspectionBrief(projected(ifc4x3Model()), "en");
    expect(brief).toContain("IFC4X3_ADD2");
  });

  it("59 discloses truncation", () => {
    const summary = projectIfcInspection({
      artifactId: "a",
      filename: "big.ifc",
      analysis: analyzeIfcBytes(Buffer.from(largeIfcModel(30), "utf8"), { limits: { maxRetainedElements: 5 } }),
    });
    const brief = renderIfcBrief(summary, "en");
    expect(summary.ifc.truncated).toBe(true);
    expect(brief).toContain("truncated view rather than the whole file");
  });
});

describe("Arabic IFC brief", () => {
  it("60 renders a truthful Arabic brief without leaking enum tokens", () => {
    const brief = renderInspectionBrief(projected(), "ar");
    expect(brief).toContain("IFC4");
    expect(brief).toContain("طابق");
    expect(brief).toMatch(/فراغ/u);
    expect(brief).toContain("لم أحسب");
    expect(brief).toContain("لم يُحصر");
    expect(brief).not.toContain("BUILDING_STOREY");
    expect(brief).not.toContain("OBSERVED_NOT_APPROVED");
    expect(brief).not.toContain("SPATIALLY_CONTAINED_IN");
  });

  it("61 translates baseline limitations into Arabic", () => {
    const brief = renderInspectionBrief(projected(), "ar");
    expect(brief).toMatch(/قيود:/u);
    expect(brief).not.toContain("ingestion metrics");
  });
});

describe("IFC governance on the projection", () => {
  it("62 states observed-only governance and empty requirement candidates", () => {
    const summary = projected();
    expect(summary.governance.join(" ")).toContain("calculated from geometry");
    expect(summary.governance.join(" ")).toContain("never inferred or converted");
    expect(summary.governance.join(" ")).toContain("no equipment was counted");
    expect(summary.candidates).toEqual([]);
  });
});
