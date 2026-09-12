import { describe, expect, it } from "vitest";
import { inspectIfcDocument } from "../IfcDocumentInspector";
import { analyzeIfcBytes } from "../IfcInspectionAnalyzer";
import { IfcInspectionError } from "../IfcFormat";
import {
  conflictingIfcModel,
  dwgBytes,
  fullIfcModel,
  largeIfcModel,
  rvtBytes,
  zipBytes,
} from "../../__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8 test matrix items 45-55: bounds, semantic candidates, governance.
 */
describe("IFC bounds", () => {
  it("45 truncates retained product entities at the safety cap", () => {
    const inspection = inspectIfcDocument(Buffer.from(largeIfcModel(40), "utf8"), {
      limits: { maxRetainedElements: 10 },
    });
    expect(inspection.elements.length).toBe(10);
    expect(inspection.truncated).toBe(true);
    expect(inspection.limitations.join(" ")).toContain("remainder were counted as an ingestion metric");
  });

  it("46 does not explode or recurse through relationship cycles", () => {
    const inspection = inspectIfcDocument(Buffer.from(fullIfcModel(), "utf8"));
    expect(inspection.elements.length).toBeGreaterThan(0);
    expect(inspection.format).toBe("IFC_SPF");
  });
});

describe("IFC semantic candidates", () => {
  it("47 proposes a conservative candidate from entity class, name, and type", () => {
    const analysis = analyzeIfcBytes(Buffer.from(fullIfcModel(), "utf8"));
    const smoke = analysis.candidates.find((candidate) => candidate.label === "Smoke Detector");
    expect(smoke).toBeDefined();
    expect(smoke!.status).toBe("OBSERVED_NOT_APPROVED");
    expect(smoke!.sources.length).toBeGreaterThanOrEqual(2);
    expect(smoke!.limitations.join(" ")).toContain("never promoted");
  });

  it("48 keeps conflicting readings of the same evidence without choosing", () => {
    const analysis = analyzeIfcBytes(Buffer.from(conflictingIfcModel(), "utf8"));
    const smoke = analysis.candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    const heat = analysis.candidates.find((candidate) => candidate.label === "Heat Detector")!;
    expect(smoke).toBeDefined();
    expect(heat).toBeDefined();
    expect(smoke.conflictsWith).toContain(heat.id);
    expect(heat.conflictsWith).toContain(smoke.id);
  });

  it("49 never counts equipment from candidates", () => {
    const analysis = analyzeIfcBytes(Buffer.from(fullIfcModel(), "utf8"));
    expect(JSON.stringify(analysis.candidates)).not.toMatch(/equipmentCount|takeoff/iu);
  });
});

describe("IFC unsupported formats on the inspector", () => {
  it("50 rejects RVT at the inspector with a truthful error", () => {
    expect(() => inspectIfcDocument(rvtBytes(), { filename: "model.ifc" })).toThrow(IfcInspectionError);
    try {
      inspectIfcDocument(rvtBytes(), { filename: "model.ifc" });
    } catch (error) {
      expect((error as IfcInspectionError).code).toContain("RVT");
      expect((error as IfcInspectionError).message).toContain("Revit");
    }
  });

  it("51 rejects IFCZIP without unzipping", () => {
    expect(() => inspectIfcDocument(zipBytes(), { filename: "model.ifczip" })).toThrow(IfcInspectionError);
  });

  it("52 rejects DWG named .ifc", () => {
    expect(() => inspectIfcDocument(dwgBytes(), { filename: "model.ifc" })).toThrow(IfcInspectionError);
  });
});
