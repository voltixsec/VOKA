import { describe, expect, it } from "vitest";
import {
  DERIVATION_METHOD_LABELS,
  emptyProjectedProprietaryOriginal,
  projectDerivationLineage,
  renderDerivationLineageSentence,
  renderDerivationStatusMessage,
  renderProprietaryOriginalGuidance,
} from "../DerivationProjection";
import type { ArtifactInspectionSummary } from "../ArtifactInspectionProjection";

/**
 * Phase 2A-9 test matrix items 51-56 (projection + bilingual behavior) at the
 * pure-projection level: bounded lineage, no enum leakage, real Arabic.
 */

function summaryWith(kind: "DWG" | "RVT", overrides: Partial<ArtifactInspectionSummary> = {}): ArtifactInspectionSummary {
  return {
    artifactId: "a-1",
    filename: kind === "DWG" ? "site.dwg" : "tower.rvt",
    kind,
    status: "UNAVAILABLE",
    pageCount: null,
    classification: null,
    pageClassifications: [],
    observations: [],
    observationCount: 0,
    candidates: [],
    conflicts: [],
    limitations: [],
    excerpt: null,
    excerptTruncated: false,
    governance: [],
    ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
    vision: { attempted: false, used: false, providers: [], lowConfidence: false },
    drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
    geometry: { attempted: false, used: false, pages: [], pageSpaceOnly: true, primitives: [], dimensionTexts: [], dimensionLines: [], dimensionAssociations: [], scaleCandidates: [], legends: [], symbolCandidates: [], symbolToLegend: [], symbolToEquipment: [], conflicts: [], limitations: [], truncated: false },
    spreadsheet: { attempted: false, used: false, sheets: [], sheetCount: 0, limitations: [], governance: [] },
    dxf: { attempted: false, used: false, versionCode: null, versionLabel: null, layers: [], blocks: [], spaces: [], candidates: [], candidateCount: 0, texts: [], dimensions: [], inserts: [], externalReferences: [], modelSpaceEntityCount: 0, paperSpaceEntityCount: 0, entityCount: 0, citedLocators: [], limitations: [], truncated: false, declaredUnits: null, unitsName: null },
    ifc: { attempted: false, used: false, schema: null, schemaFamily: null, projectName: null, projectLocator: null, siteNames: [], buildingNames: [], storeys: [], storeyCount: 0, spaces: [], spaceCount: 0, systems: [], systemCount: 0, elements: [], elementCount: 0, types: [], properties: [], propertyCount: 0, quantities: [], quantityCount: 0, materials: [], units: [], documentReferences: [], classifications: [], candidates: [], candidateCount: 0, citedLocators: [], limitations: [], truncated: false },
    proprietaryOriginal: { ...emptyProjectedProprietaryOriginal(), format: kind },
    derivationLineage: null,
    ...overrides,
  } as ArtifactInspectionSummary;
}

describe("proprietary original guidance (2A-9)", () => {
  it("52/56 EN and AR guidance is truthful, versioned, and enum-free", () => {
    const dwg = summaryWith("DWG", { proprietaryOriginal: { attempted: false, used: false, format: "DWG", versionCode: "AC1032", versionLabel: "AutoCAD 2018", verified: true, limitations: [] } });
    const en = renderProprietaryOriginalGuidance(dwg, "en");
    expect(en).toContain("binary DWG drawing");
    expect(en).toContain("AC1032");
    expect(en).toContain("Export it as ASCII DXF");
    expect(en).not.toMatch(/DWG_TO_DXF|USER_PROVIDED|NOT_CONFIGURED/);
    const ar = renderProprietaryOriginalGuidance(dwg, "ar");
    expect(ar).toMatch(/[\u0600-\u06FF]/);
    expect(ar).toContain("AC1032");
    expect(ar).toContain("ASCII DXF");
    expect(ar).not.toContain("Export it as ASCII DXF and attach");
    const rvt = summaryWith("RVT");
    expect(renderProprietaryOriginalGuidance(rvt, "en")).toContain("Export it as IFC");
    expect(renderProprietaryOriginalGuidance(rvt, "ar")).toContain("IFC");
  });
});

describe("derivation lineage projection (2A-9)", () => {
  const derivation = {
    derivationKind: "RVT_TO_IFC" as const,
    derivationMethod: "USER_PROVIDED_EXPORT" as const,
    originalArtifactId: "original-rvt",
    derivedArtifactId: "derived-ifc",
    sourceFormat: "RVT",
    derivedFormat: "IFC",
    fidelityLimitations: Array.from({ length: 9 }, (_, index) => `limitation ${index}`),
    completedAt: new Date("2026-09-14T00:00:00Z"),
  };

  it("projects bounded lineage without provider internals", () => {
    const lineage = projectDerivationLineage({ derivation, originalFilename: "tower.rvt" });
    expect(lineage).toMatchObject({ derived: true, originalFilename: "tower.rvt", method: "USER_PROVIDED_EXPORT", sourceFormat: "RVT", derivedFormat: "IFC" });
    expect(lineage!.limitations.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(lineage)).not.toContain("converterId");
  });

  it("returns null lineage without a derived artifact", () => {
    expect(projectDerivationLineage({ derivation: { ...derivation, derivedArtifactId: null }, originalFilename: "tower.rvt" })).toBeNull();
  });

  it("54/55 renders the lineage sentence honestly per method, in both languages", () => {
    const lineage = projectDerivationLineage({ derivation, originalFilename: "tower.rvt" })!;
    const en = renderDerivationLineageSentence(lineage, "en");
    expect(en).toBe("This IFC was provided as an export derived from the original Revit model 'tower.rvt'.");
    expect(en).not.toContain("converted by VOKA");
    const ar = renderDerivationLineageSentence(lineage, "ar");
    expect(ar).toContain("نسخة مُصدَّرة");
    expect(ar).toContain("tower.rvt");
    const automated = projectDerivationLineage({ derivation: { ...derivation, derivationMethod: "AUTOMATED_CONVERSION" }, originalFilename: "tower.rvt" })!;
    expect(renderDerivationLineageSentence(automated, "en")).toContain("automated conversion");
    expect(renderDerivationLineageSentence(automated, "en")).toContain("not guaranteed to be lossless");
    expect(renderDerivationLineageSentence(automated, "ar")).toContain("غير مضمون");
    expect(DERIVATION_METHOD_LABELS.USER_PROVIDED_EXPORT.en).not.toContain("AUTOMATED");
  });
});

describe("bilingual derivation status wording (2A-9 §25)", () => {
  const base = { sourceFormat: "DWG" as const, derivedFormat: "DXF" as const, originalFilename: "site.dwg", locale: "en" as const };

  it("reports NOT_CONFIGURED as no-conversion-performed, naming the export path", () => {
    const en = renderDerivationStatusMessage({ ...base, status: "NOT_CONFIGURED", reason: "no conversion provider is configured" });
    expect(en).toContain("No conversion was performed");
    expect(en).toContain("export an ASCII DXF");
    expect(en).toContain("Reason: no conversion provider is configured");
    const ar = renderDerivationStatusMessage({ ...base, status: "NOT_CONFIGURED", locale: "ar" });
    expect(ar).toMatch(/[\u0600-\u06FF]/);
    expect(ar).toContain("لم تُنفّذ عملية التحويل");
    expect(ar).not.toContain("No conversion was performed");
  });

  it("reports REJECTED and FAILED without claiming any stored output", () => {
    const rejected = renderDerivationStatusMessage({ ...base, status: "REJECTED" });
    expect(rejected).toContain("rejected");
    expect(rejected).toContain("no output was stored");
    const failed = renderDerivationStatusMessage({ ...base, status: "FAILED", reason: "converter crashed" });
    expect(failed).toContain("failed");
    expect(failed).toContain("no derived file was created");
    const arRejected = renderDerivationStatusMessage({ ...base, status: "REJECTED", locale: "ar" });
    expect(arRejected).toContain("رُفض ناتج التحويل");
  });

  it("never leaks a raw status token in any language", () => {
    for (const status of ["PENDING", "RUNNING", "AWAITING_USER_EXPORT", "SUCCEEDED", "FAILED", "NOT_CONFIGURED", "REJECTED"] as const) {
      for (const locale of ["en", "ar"] as const) {
        const message = renderDerivationStatusMessage({ ...base, status, locale });
        expect(message).not.toContain("NOT_CONFIGURED");
        expect(message).not.toContain("USER_PROVIDED_EXPORT");
        expect(message).not.toContain("AUTOMATED_CONVERSION");
      }
    }
  });
});
