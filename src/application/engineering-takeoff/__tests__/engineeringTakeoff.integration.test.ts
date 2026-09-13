/**
 * Phase 2A-11 — integration tests for engineering takeoff + governed BOM.
 *
 * These are INTEGRATION tests, not unit tests with mocks. Each one drives the
 * real services through the real domain rules and persists through the real
 * in-memory engineering store, so what is verified is the governance behaviour
 * of the phase rather than a stub's expectations.
 *
 * The 22 required scenarios are covered, plus the tenant-isolation and
 * no-promotion guarantees.
 */

import { describe, expect, it } from "vitest";
import {
  activeDecisionFor,
  advancingClock,
  buildHandoff,
  buildHarness,
  claimFor,
  clusterFor,
  COMPANY_A,
  COMPANY_B,
  fixedClock,
  identityFor,
  membershipFor,
  occurrence,
  perCompanyHandoffReader,
  TEST_NOW,
} from "./harness";
import { buildEngineeringBomHandoff, ENGINEERING_HANDOFF_VERSION, BOM_HANDOFF_NOT_EXPOSED_FIELDS, latestApprovedBomHandoff } from "../EngineeringBomHandoff";
import { buildBomRow, computeBomCompleteness, computeBomCompletenessWithCoverage, ENGINEERING_PROHIBITED_CONCEPTS } from "@/src/domain/engineering-takeoff";

// ---------------------------------------------------------------------------

async function openScope(harness: ReturnType<typeof buildHarness>, overrides: Partial<{ companyId: string; name: string; scopeKind: "MATERIAL_TAKEOFF" }> = {}) {
  return harness.takeoff.openTakeoffScope({
    companyId: overrides.companyId ?? COMPANY_A,
    name: overrides.name ?? "CCTV material takeoff",
    scopeKind: overrides.scopeKind ?? "MATERIAL_TAKEOFF",
    comparisonScopeId: "cmp-scope-1",
    createdByUserId: "user-1",
  });
}

// ===========================================================================
// 1 & 2. Source quantities become CANDIDATES, never approvals
// ===========================================================================

describe("Phase 2A-11 — source quantities are candidates, never approvals", () => {
  it("1. a STATED quantity produces a candidate with origin STATED and no approved-value field", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CCTV-CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT", quantityOrigin: "STATED" })],
        subjectClusters: [clusterFor({ subjectClusterId: "cluster-1", matchKey: "CCTV-CAM-01", memberClaimIds: ["claim-1"] })],
      }),
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0]!;
    expect(candidate.origin).toBe("STATED");
    expect(candidate.basis).toBe("SOURCE_CLAIM");
    expect(candidate.value).toBe(24);
    expect(candidate.unitDimension).toBe("COUNT");
    // A candidate is NOT an approval: it carries no approved-value field and its
    // readiness is not APPROVED.
    expect(candidate).not.toHaveProperty("approvedValue");
    expect(candidate.readiness).not.toBe("APPROVED");

    // Nothing was approved merely by deriving it.
    const decisions = await harness.store.listDecisions({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    expect(decisions).toHaveLength(0);
  });

  it("2. a DECLARED_MODEL quantity produces a candidate with origin DECLARED_MODEL, not an approval", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-ifc-1", subjectMatchKey: "AHU-01", subjectKeyNamespace: "TYPE_NAME", valueLiteral: "IfcAirTerminal 5", sourceNumericView: 5, unit: "ea", unitDimension: "COUNT", quantityOrigin: "DECLARED_MODEL", sourceArtifactId: "artifact-ifc-1" })],
      }),
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.origin).toBe("DECLARED_MODEL");
    expect(result.candidates[0]!.value).toBe(5);
    expect(result.candidates[0]!.readiness).not.toBe("APPROVED");
  });

  it("a source quantity stated only as text yields a candidate with NO numeric value rather than a guessed one", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-text", subjectMatchKey: "CCTV-CAM-02", valueLiteral: "twenty four units", sourceNumericView: null })],
      }),
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });

    expect(result.candidates[0]!.value).toBeNull();
    expect(result.candidates[0]!.readinessReasons.join(" ")).toContain("no numeric view");
  });
});

// ===========================================================================
// 3 & 4. Eligible counting: DXF and IFC
// ===========================================================================

describe("Phase 2A-11 — eligible counting", () => {
  it("3. counts eligible DXF model-space occurrences only", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1" }),
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#2" }),
        occurrence({ family: "DXF", sourceType: "CIRCLE", locator: "msp#3" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(3);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.origin).toBe("COUNTED");
    expect(result.candidates[0]!.basis).toBe("OCCURRENCE_COUNT");
    expect(result.candidates[0]!.value).toBe(3);
  });

  it("4. counts eligible IFC occurrence instances, and an IfcType plus five instances is FIVE occurrences", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        // The type object itself.
        occurrence({ family: "IFC", sourceType: "IfcDoorType", locator: "ifc#type-1", definitionGroupKey: "type-1" }),
        // Five instances of that type.
        occurrence({ family: "IFC", sourceType: "IfcDoor", locator: "ifc#1", definitionGroupKey: "type-1" }),
        occurrence({ family: "IFC", sourceType: "IfcDoor", locator: "ifc#2", definitionGroupKey: "type-1" }),
        occurrence({ family: "IFC", sourceType: "IfcDoor", locator: "ifc#3", definitionGroupKey: "type-1" }),
        occurrence({ family: "IFC", sourceType: "IfcDoor", locator: "ifc#4", definitionGroupKey: "type-1" }),
        occurrence({ family: "IFC", sourceType: "IfcDoor", locator: "ifc#5", definitionGroupKey: "type-1" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "IFC", artifactIds: ["artifact-dxf-1"] });

    // Five, NOT six. The type object is excluded.
    expect(result.ledger.countedOccurrences).toBe(5);
    expect(result.ledger.excludedOccurrences).toBe(1);
    expect(result.candidates[0]!.value).toBe(5);
  });
});

// ===========================================================================
// 5. Structural exclusions
// ===========================================================================

describe("Phase 2A-11 — counting exclusions", () => {
  it("5a. excludes title blocks, legends, annotation symbols, paper space, block definitions, and XREF metadata", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "LINE", locator: "tb#1", insideTitleBlock: true }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "legend#1", insideLegend: true }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "ann#1", annotation: true }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "ps#1", modelSpace: false }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "blk#1", blockDefinition: true }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "xref#1", xrefMetadata: true }),
        occurrence({ family: "DXF", sourceType: "DIMENSION", locator: "dim#1" }),
        occurrence({ family: "DXF", sourceType: "TEXT", locator: "txt#1" }),
        // Only this one is eligible.
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#ok" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.excludedOccurrences).toBe(8);
  });

  it("5b. excludes IFC type objects, property sets, quantity sets, materials, classifications, systems, spatial containers, relationships, and documents", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "IFC", sourceType: "IfcWindowType", locator: "ifc#type" }),
        occurrence({ family: "IFC", sourceType: "IfcPropertySet", locator: "ifc#pset" }),
        occurrence({ family: "IFC", sourceType: "IfcElementQuantity", locator: "ifc#qset" }),
        occurrence({ family: "IFC", sourceType: "IfcMaterial", locator: "ifc#mat" }),
        occurrence({ family: "IFC", sourceType: "IfcClassification", locator: "ifc#cls" }),
        occurrence({ family: "IFC", sourceType: "IfcSystem", locator: "ifc#sys" }),
        occurrence({ family: "IFC", sourceType: "IfcBuildingStorey", locator: "ifc#storey" }),
        occurrence({ family: "IFC", sourceType: "IfcSpace", locator: "ifc#space" }),
        occurrence({ family: "IFC", sourceType: "IfcSite", locator: "ifc#site" }),
        occurrence({ family: "IFC", sourceType: "IfcBuilding", locator: "ifc#building" }),
        occurrence({ family: "IFC", sourceType: "IfcRelContainedInSpatialStructure", locator: "ifc#rel" }),
        occurrence({ family: "IFC", sourceType: "IfcDocumentReference", locator: "ifc#doc" }),
        // Only this one is an eligible instance.
        occurrence({ family: "IFC", sourceType: "IfcWindow", locator: "ifc#win-1" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "IFC", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.excludedOccurrences).toBe(12);
  });

  it("excludes a PARTIAL-coverage source rather than counting it as a complete population", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1", sourceCoverage: "PARTIAL" }),
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#2", sourceCoverage: "COMPLETE" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.limitations.join(" ")).toContain("truncated");
  });

  // REGRESSION: the source-native entity names must be what decides eligibility.
  // An earlier classifier matched symbolic placeholders instead of the real IFC
  // and DXF names, so every real type object, property set, and relationship fell
  // through to the COUNTABLE branch and the "IfcType + 5 = 5" guarantee was
  // silently false. These two tests pin the real-name behaviour directly.
  it("regression: real IFC type/scaffolding names are excluded, not counted, even without an enumerated table entry", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        // Names deliberately chosen to be real IFC entities, mixed case, so a
        // case- or table-dependent classifier is caught.
        occurrence({ family: "IFC", sourceType: "IfcDoorType", locator: "ifc#1" }),
        occurrence({ family: "IFC", sourceType: "IFCPROPERTYSET", locator: "ifc#2" }),
        occurrence({ family: "IFC", sourceType: "IfcRelContainedInSpatialStructure", locator: "ifc#3" }),
        occurrence({ family: "IFC", sourceType: "IFCBUILDINGSTOREY", locator: "ifc#4" }),
        // An unenumerated type object must STILL be excluded by the `...Type` rule.
        occurrence({ family: "IFC", sourceType: "IfcCableCarrierFittingType", locator: "ifc#5" }),
        // A namespace-qualified name must normalize to the same conclusion.
        occurrence({ family: "IFC", sourceType: "IFC4:IfcDuctSegmentType", locator: "ifc#6" }),
        // The single real instance.
        occurrence({ family: "IFC", sourceType: "IfcCableCarrierFitting", locator: "ifc#7" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "IFC", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.excludedOccurrences).toBe(6);
    const excluded = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, included: false, limit: 100 });
    // Every excluded IFC item must name a class-appropriate reason.
    for (const entry of excluded) expect(entry.exclusionReason).not.toBeNull();
    expect(excluded.find((entry) => entry.locator === "ifc#1")!.occurrenceClass).toBe("TYPE_OBJECT");
    expect(excluded.find((entry) => entry.locator === "ifc#5")!.occurrenceClass).toBe("TYPE_OBJECT");
    expect(excluded.find((entry) => entry.locator === "ifc#6")!.occurrenceClass).toBe("TYPE_OBJECT");
    expect(excluded.find((entry) => entry.locator === "ifc#2")!.occurrenceClass).toBe("PROPERTY_SET");
    expect(excluded.find((entry) => entry.locator === "ifc#3")!.occurrenceClass).toBe("RELATIONSHIP_OBJECT");
    expect(excluded.find((entry) => entry.locator === "ifc#4")!.occurrenceClass).toBe("SPATIAL_CONTAINER");
  });

  it("regression: real DXF entity names are classified by their entity type, and paper space outranks that classification", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "MTEXT", locator: "dxf#1" }),
        occurrence({ family: "DXF", sourceType: "ATTDEF", locator: "dxf#2" }),
        occurrence({ family: "DXF", sourceType: "ALIGNEDDIMENSION", locator: "dxf#3" }),
        occurrence({ family: "DXF", sourceType: "DIMSTYLE", locator: "dxf#4" }),
        // A dimension placed on a SHEET must report paper space, not a dimension,
        // because the exclusion reason has to describe the true cause.
        occurrence({ family: "DXF", sourceType: "LINEAR", locator: "dxf#5", modelSpace: false }),
        // The single countable model-space entity.
        occurrence({ family: "DXF", sourceType: "LWPOLYLINE", locator: "dxf#6" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.excludedOccurrences).toBe(5);
    const excluded = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, included: false, limit: 100 });
    expect(excluded.find((entry) => entry.locator === "dxf#1")!.occurrenceClass).toBe("TEXT_LABEL");
    expect(excluded.find((entry) => entry.locator === "dxf#2")!.occurrenceClass).toBe("TEXT_LABEL");
    expect(excluded.find((entry) => entry.locator === "dxf#3")!.occurrenceClass).toBe("DIMENSION_ENTITY");
    expect(excluded.find((entry) => entry.locator === "dxf#4")!.occurrenceClass).toBe("STYLE_DEFINITION");
    expect(excluded.find((entry) => entry.locator === "dxf#5")!.occurrenceClass).toBe("PAPER_SPACE_ENTITY");
  });

  // REGRESSION: a real DXF export does not guarantee case or namespace
  // consistency, so the allow-list must not reject `Insert` while admitting
  // `INSERT`, which would make counting depend on how a parser cased things.
  it("regression: the DXF allow-list is case- and namespace-insensitive", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "Insert", locator: "dxf#1" }),
        occurrence({ family: "DXF", sourceType: "AcDb:LWPOLYLINE", locator: "dxf#2" }),
        occurrence({ family: "DXF", sourceType: "circle", locator: "dxf#3" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(3);
  });

  // REGRESSION: multi-instance subjects must not be collapsed. The dedup pass is
  // about the same physical thing appearing in an original and its conversion,
  // NOT about a subject appearing several times legitimately.
  it("regression: several distinct occurrences of ONE subject in ONE artifact are all counted", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1", subjectMatchKey: "CAM-01" }),
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#2", subjectMatchKey: "CAM-01" }),
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#3", subjectMatchKey: "CAM-01" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    expect(result.ledger.countedOccurrences).toBe(3);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.value).toBe(3);
  });

  it("stores every considered occurrence — included and excluded — with its locator, class, reason, and rule version", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1" }),
        occurrence({ family: "DXF", sourceType: "LINE", locator: "tb#1", insideTitleBlock: true }),
      ],
    });
    const scope = await openScope(harness);
    await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    const entries = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.locator).toBeTruthy();
      expect(entry.occurrenceClass).toBeTruthy();
      expect(entry.countingRuleVersion).toContain("2a-11.counting.v1");
    }
    const excluded = entries.find((entry) => !entry.included)!;
    expect(excluded.exclusionReason).toBeTruthy();
    // No unexplained aggregate exists: every counted number is backed by rows.
    const included = entries.filter((entry) => entry.included);
    expect(included).toHaveLength(1);
  });
});

// ===========================================================================
// 6. Derivation-family deduplication
// ===========================================================================

describe("Phase 2A-11 — derivation family deduplication", () => {
  it("6. never double counts a DWG original and its derived DXF", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [
        // The original proprietary DWG...
        occurrence({ artifactId: "artifact-dwg", derivationFamilyRootArtifactId: "artifact-dwg", family: "DXF", sourceType: "INSERT", locator: "orig#1" }),
        // ...and the derived DXF of the SAME family and subject.
        occurrence({ artifactId: "artifact-dxf", derivationFamilyRootArtifactId: "artifact-dwg", family: "DXF", sourceType: "INSERT", locator: "derived#1" }),
      ],
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dwg", "artifact-dxf"] });

    expect(result.ledger.countedOccurrences).toBe(1);
    expect(result.ledger.derivationFamilyRoots).toEqual(["artifact-dwg"]);
    const entries = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    const duplicate = entries.find((entry) => entry.locator === "derived#1")!;
    expect(duplicate.included).toBe(false);
    expect(duplicate.exclusionReason).toBe("DERIVATION_FAMILY_DUPLICATE");
  });
});

// ===========================================================================
// 7. Conflicting sources produce no automatic winner
// ===========================================================================

describe("Phase 2A-11 — cross-source reconciliation", () => {
  it("7. two sources stating different values record a conflict and pick no winner", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [
          claimFor({ claimId: "claim-boq", subjectMatchKey: "TAPE-01", subjectKeyNamespace: "EQUIPMENT_TAG", valueLiteral: "100", sourceNumericView: 100, unit: "m", unitDimension: "LENGTH", sourceArtifactId: "artifact-boq", derivationFamilyRootArtifactId: "artifact-boq" }),
          claimFor({ claimId: "claim-dwg", subjectMatchKey: "TAPE-01", subjectKeyNamespace: "EQUIPMENT_TAG", valueLiteral: "120", sourceNumericView: 120, unit: "m", unitDimension: "LENGTH", sourceArtifactId: "artifact-dwg", derivationFamilyRootArtifactId: "artifact-dwg" }),
        ],
      }),
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });

    expect(result.candidates).toHaveLength(2);
    const conflicts = await harness.store.listConflicts({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    expect(conflicts.length).toBeGreaterThan(0);
    // The dispute is recorded and demands an explicit decision. No winner, no
    // resolved value, no preference anywhere.
    expect(conflicts[0]!.requiresExplicitDecision).toBe(true);
    expect(conflicts[0]!).not.toHaveProperty("selectedCandidateId");
    expect(conflicts[0]!).not.toHaveProperty("resolvedValue");
  });

  it("never averages or takes the highest value automatically", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [
          claimFor({ claimId: "c1", subjectMatchKey: "PIPE-01", valueLiteral: "10", sourceNumericView: 10, unit: "m", unitDimension: "LENGTH", sourceArtifactId: "a1", derivationFamilyRootArtifactId: "a1" }),
          claimFor({ claimId: "c2", subjectMatchKey: "PIPE-01", valueLiteral: "30", sourceNumericView: 30, unit: "m", unitDimension: "LENGTH", sourceArtifactId: "a2", derivationFamilyRootArtifactId: "a2" }),
        ],
      }),
    });
    const scope = await openScope(harness);
    const result = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });

    // Both values are preserved as separate candidates. No 20 (average), no 30 (max).
    expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual([10, 30]);
  });
});

// ===========================================================================
// 8 & 9. Explicit approval and decision history
// ===========================================================================

describe("Phase 2A-11 — governed quantity decisions", () => {
  async function candidateSetup() {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CCTV-CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" })],
        subjectClusters: [clusterFor({ subjectClusterId: "cluster-1", matchKey: "CCTV-CAM-01", memberClaimIds: ["claim-1"] })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    return { harness, scope, candidate: derived.candidates[0]! };
  }

  it("8. an explicit decision approves a quantity and marks its origin APPROVED_ENGINEERING", async () => {
    const { harness, scope, candidate } = await candidateSetup();
    const result = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CCTV-CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "the tender schedule is the controlled quantity document for this scope",
      selectedCandidateId: candidate.candidateId,
      consideredCandidateIds: [candidate.candidateId],
    });

    expect(result.decision.quantityOrigin).toBe("APPROVED_ENGINEERING");
    expect(result.decision.approvedValue).toBe(24);
    expect(result.decision.state).toBe("APPROVED");
    expect(result.decision.actorUserId).toBe("user-1");
    expect(result.decision.rationale).toBeTruthy();
    expect(result.superseded).toBeNull();
  });

  it("8b. a decision requires an actor and a rationale — there is no anonymous approval", async () => {
    const { harness, scope, candidate } = await candidateSetup();
    await expect(harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CCTV-CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "",
      rationale: "",
      consideredCandidateIds: [candidate.candidateId],
    })).rejects.toThrow();
  });

  it("8c. a decision cannot cite a candidate from another scope or company", async () => {
    const { harness, scope } = await candidateSetup();
    await expect(harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CCTV-CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "attempting to cite a candidate from elsewhere",
      consideredCandidateIds: ["candidate-from-another-scope"],
    })).rejects.toThrow(/not a candidate in this company and takeoff scope/);
  });

  it("9. a revised decision supersedes the previous one WITHOUT overwriting its approved value", async () => {
    const { harness, scope, candidate } = await candidateSetup();

    const first = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CCTV-CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 24,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "initial approval from the tender schedule",
      selectedCandidateId: candidate.candidateId,
      consideredCandidateIds: [candidate.candidateId],
    });

    const second = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CCTV-CAM-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 26,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "CORRECTED_BY_HUMAN",
      actorUserId: "user-2",
      rationale: "the reviewer found two additional cameras on the revised sheet",
      consideredCandidateIds: [candidate.candidateId],
    });

    expect(second.decision.decisionVersion).toBe(2);
    expect(second.superseded).not.toBeNull();
    expect(second.superseded!.decisionId).toBe(first.decision.decisionId);
    expect(second.superseded!.state).toBe("SUPERSEDED");

    const history = await harness.decisions.decisionHistory({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CCTV-CAM-01" });
    expect(history).toHaveLength(2);
    // The ORIGINAL approved value survives untouched. This is the whole point.
    expect(history[0]!.approvedValue).toBe(24);
    expect(history[0]!.state).toBe("SUPERSEDED");
    expect(history[0]!.supersededByDecisionId).toBe(second.decision.decisionId);
    expect(history[1]!.approvedValue).toBe(26);
    expect(history[1]!.state).toBe("APPROVED");

    // The current decision is the newer one.
    const current = await harness.decisions.currentDecision({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CCTV-CAM-01" });
    expect(current!.approvedValue).toBe(26);

    // An attempted in-place mutation of the historical value is DETECTED.
    const mutation = await harness.decisions.detectAttemptedMutation({
      companyId: COMPANY_A,
      incoming: { ...first.decision, approvedValue: 99 },
    });
    expect(mutation.mutated).toBe(true);
    expect(mutation.fields).toContain("approvedValue");
  });
});

// ===========================================================================
// 10 & 11. Deterministic calculation and UOM refusal
// ===========================================================================

describe("Phase 2A-11 — governed calculations", () => {
  it("10. a calculation is deterministic: identical inputs yield an identical id and result", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const scope = await openScope(harness);

    const request = {
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "WALL-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL" as const,
      ruleId: "rectangular_area",
      ruleVersion: "2a-11.calculation.v1/rectangular_area",
      inputs: [
        { inputName: "length", source: "EVIDENCE_CLAIM" as const, sourceReferenceId: "claim-l", value: 12, unitLiteral: "m" },
        { inputName: "width", source: "EVIDENCE_CLAIM" as const, sourceReferenceId: "claim-w", value: 3, unitLiteral: "m" },
      ],
      resultUnitLiteral: "m2",
      actorUserId: "user-1",
    };

    const first = await harness.calculations.runCalculation(request);
    const second = await harness.calculations.runCalculation(request);

    expect(first.blocked).toBe(false);
    expect(first.resultValue).toBe(36);
    expect(first.resultDimension).toBe("AREA");
    // Determinism: same logical request, same id.
    expect(second.calculationId).toBe(first.calculationId);
    expect(second.inputDigest).toBe(first.inputDigest);
  });

  it("10b. rounding is published per rule: spacing floors, coverage ceilings", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const scope = await openScope(harness);

    const spacing = await harness.calculations.runCalculation({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "LIGHT-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      ruleId: "linear_quantity_with_spacing",
      ruleVersion: "2a-11.calculation.v1/linear_quantity_with_spacing",
      inputs: [
        { inputName: "length", source: "EVIDENCE_CLAIM", sourceReferenceId: "claim-l", value: 10.5, unitLiteral: "m" },
        { inputName: "spacing", source: "EVIDENCE_CLAIM", sourceReferenceId: "claim-s", value: 2, unitLiteral: "m" },
      ],
      resultUnitLiteral: "ea",
      actorUserId: "user-1",
    });
    // 10.5 / 2 = 5.25 -> floors to 5.
    expect(spacing.resultValue).toBe(5);

    const coverage = await harness.calculations.runCalculation({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "PAINT-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      ruleId: "proportional_coverage",
      ruleVersion: "2a-11.calculation.v1/proportional_coverage",
      inputs: [
        { inputName: "area", source: "EVIDENCE_CLAIM", sourceReferenceId: "claim-a", value: 10, unitLiteral: "m2" },
        { inputName: "coverageRate", source: "EVIDENCE_CLAIM", sourceReferenceId: "claim-r", value: 1.5, unitLiteral: "ea" },
      ],
      resultUnitLiteral: "ea",
      actorUserId: "user-1",
    });
    // 10 * 1.5 = 15 exactly.
    expect(coverage.resultValue).toBe(15);
  });

  it("refuses a calculation whose inputs are dimensionally wrong instead of producing a wrong number", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const scope = await openScope(harness);

    const result = await harness.calculations.runCalculation({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "BAD-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      ruleId: "rectangular_area",
      ruleVersion: "2a-11.calculation.v1/rectangular_area",
      inputs: [
        // VOLUME where LENGTH is required.
        { inputName: "length", source: "EVIDENCE_CLAIM", sourceReferenceId: "c1", value: 12, unitLiteral: "m3" },
        { inputName: "width", source: "EVIDENCE_CLAIM", sourceReferenceId: "c2", value: 3, unitLiteral: "m" },
      ],
      resultUnitLiteral: "m2",
      actorUserId: "user-1",
    });

    expect(result.blocked).toBe(true);
    expect(result.resultValue).toBeNull();
    expect(result.blockedReasons.join(" ")).toContain("requires LENGTH");
  });

  it("blocks a calculation with an unresolved input and holds NO result — no default substitution", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const scope = await openScope(harness);

    const result = await harness.calculations.runCalculation({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "BLOCKED-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      ruleId: "rectangular_area",
      ruleVersion: "2a-11.calculation.v1/rectangular_area",
      inputs: [
        { inputName: "length", source: "EVIDENCE_CLAIM", sourceReferenceId: "c1", value: 12, unitLiteral: "m" },
        // The width was never stated anywhere — unresolved, NOT defaulted.
        { inputName: "width", source: "EVIDENCE_CLAIM", sourceReferenceId: "c2", unresolved: true, unresolvedReason: "no governed record states the width" },
      ],
      resultUnitLiteral: "m2",
      actorUserId: "user-1",
    });

    expect(result.blocked).toBe(true);
    expect(result.resultValue).toBeNull();
    expect(result.blockedReasons.length).toBeGreaterThan(0);

    // The unresolved input is persisted as UNRESOLVED, not as a number.
    const inputs = await harness.calculations.listInputs({ companyId: COMPANY_A, calculationId: result.calculationId });
    const unresolved = inputs.find((input) => input.inputName === "width")!;
    expect(unresolved.resolved).toBe(false);
    expect(unresolved.inputValue).toBeNull();
    expect(unresolved.unresolvedReason).toBeTruthy();
  });

  it("refuses an unknown formula rule rather than evaluating an arbitrary expression", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const scope = await openScope(harness);

    await expect(harness.calculations.runCalculation({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "X-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      ruleId: "arbitrary_llm_math",
      ruleVersion: "v1",
      inputs: [],
      resultUnitLiteral: "m2",
      actorUserId: "user-1",
    })).rejects.toThrow(/not a governed engineering formula/);
  });
});

// ===========================================================================
// 12. Engineering adjustments preserve the base
// ===========================================================================

describe("Phase 2A-11 — engineering adjustments", () => {
  async function approvedSetup() {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CABLE-01", valueLiteral: "100", sourceNumericView: 100, unit: "m", unitDimension: "LENGTH" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      approvedValue: 100,
      approvedUnitLiteral: "m",
      approvedUnitDimension: "LENGTH",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved from the cable schedule",
      selectedCandidateId: derived.candidates[0]!.candidateId,
      consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });
    return { harness, scope, decision: decision.decision };
  }

  it("12. records wastage as a SEPARATE adjustment and never mutates the base approved quantity", async () => {
    const { harness, scope, decision } = await approvedSetup();

    const result = await harness.adjustments.recordAdjustment({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      adjustmentType: "WASTAGE",
      mode: "PERCENTAGE",
      adjustmentFactor: 5,
      rationale: "site convention allows 5% cable wastage",
      baseDecisionId: decision.decisionId,
      unitLiteral: "m",
      actorUserId: "user-1",
    });

    expect(result.baseValue).toBe(100);
    expect(result.adjustedValue).toBe(105);
    expect(result.adjustment.baseDecisionId).toBe(decision.decisionId);

    // The base decision is UNCHANGED. This is the invariant.
    const reloaded = await harness.decisions.findDecision({ companyId: COMPANY_A, decisionId: decision.decisionId });
    expect(reloaded!.approvedValue).toBe(100);

    // The adjustment is persisted separately, with its own rule and version.
    const adjustments = await harness.adjustments.listAdjustments({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]!.ruleVersion).toContain("2a-11.adjustment.v1");
    expect(adjustments[0]!.baseValue).toBe(100);
    expect(adjustments[0]!.adjustedValue).toBe(105);
  });

  it("12b. a SPARE_ALLOWANCE requires explicit approval and is BLOCKED without it", async () => {
    const { harness, scope, decision } = await approvedSetup();

    const result = await harness.adjustments.recordAdjustment({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      adjustmentType: "SPARE_ALLOWANCE",
      mode: "PERCENTAGE",
      adjustmentFactor: 10,
      rationale: "spare allowance requested by the client",
      baseDecisionId: decision.decisionId,
      unitLiteral: "m",
      actorUserId: "user-1",
      // No approver supplied.
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.adjustment.blocked).toBe(true);
    expect(result.adjustedValue).toBeNull();
    expect(result.adjustment.blockedReasons.join(" ")).toContain("must be approved");
  });

  it("12c. an adjustment may not extend a non-approved decision", async () => {
    const { harness, scope, decision } = await approvedSetup();
    // Supersede the decision so it is no longer APPROVED.
    await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      approvedValue: 110,
      approvedUnitLiteral: "m",
      approvedUnitDimension: "LENGTH",
      decisionBasis: "CORRECTED_BY_HUMAN",
      actorUserId: "user-2",
      rationale: "corrected after a revised schedule",
      consideredCandidateIds: (await harness.store.listCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 })).map((candidate) => candidate.candidateId),
    });

    await expect(harness.adjustments.recordAdjustment({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      adjustmentType: "WASTAGE",
      mode: "PERCENTAGE",
      adjustmentFactor: 5,
      rationale: "attempting to extend a superseded decision",
      baseDecisionId: decision.decisionId,
      unitLiteral: "m",
      actorUserId: "user-1",
    })).rejects.toThrow(/superseded/);
  });
});

// ===========================================================================
// 13 & 14. Material vs service separation, and the tender-model constraint
// ===========================================================================

describe("Phase 2A-11 — material/service and specification boundaries", () => {
  it("13. an INSTALLATION_ONLY service becomes a SERVICE_OR_WORK row, not a fake product quantity", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-svc", subjectMatchKey: "INSTALL-CCTV", valueLiteral: "1", sourceNumericView: 1, unit: "ea", unitDimension: "COUNT" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "INSTALL-CCTV",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "SERVICE_OR_WORK",
      approvedValue: 1,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "the tender prices installation as a single work item",
      consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      engineeringScope: "CCTV installation",
      decisionIds: (await harness.decisions.listDecisions({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId })).map((decision) => decision.decisionId),
      actorUserId: "user-1",
      reason: "first BOM for the CCTV package",
    });

    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]!.requirementKind).toBe("SERVICE_OR_WORK");
    expect(version.rows[0]!.requirementNature).toBe("PERFORMED_SERVICE");
    expect(version.rows[0]!.isApprovedRow).toBe(true);
  });

  it("14. a tender 'Manufacturer X / Model Y' is preserved as a SPECIFICATION constraint and creates no product selection or supplier", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-eq", subjectMatchKey: "NVR-01", valueLiteral: "2", sourceNumericView: 2, unit: "ea", unitDimension: "COUNT" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "NVR-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 2,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved from the equipment schedule",
      consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      engineeringScope: "CCTV head end",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "BOM with tender specification",
      constraints: {
        [decision.decision.decisionId]: [
          { kind: "MANUFACTURER", value: "Manufacturer X", sourceClaimId: "claim-eq", locator: "boq#12", isSpecificationOnly: true },
          { kind: "NAMED_TENDER_MODEL", value: "Model Y", sourceClaimId: "claim-eq", locator: "boq#12", isSpecificationOnly: true },
        ],
      },
    });

    const row = version.rows[0]!;
    expect(row.constraints).toHaveLength(2);
    expect(row.constraints.every((constraint) => constraint.isSpecificationOnly)).toBe(true);
    // No selection or supplier reference exists on the row, by construction.
    const serialized = JSON.stringify(row).toLowerCase();
    expect(serialized).not.toContain("productselection");
    expect(serialized).not.toContain("supplierid");
    expect(serialized).not.toContain("catalogitem");
  });
});

// ===========================================================================
// 15 & 16. Product-agnostic BOM and no auto-ProductSelection
// ===========================================================================

describe("Phase 2A-11 — product-agnostic Engineering BOM", () => {
  it("15. a BOM is produced WITHOUT any selected catalog product", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CABLE-TRAY-01", valueLiteral: "50", sourceNumericView: 50, unit: "m", unitDimension: "LENGTH" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "CABLE-TRAY-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "MATERIAL",
      approvedValue: 50,
      approvedUnitLiteral: "m",
      approvedUnitDimension: "LENGTH",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved from the takeoff",
      consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      engineeringScope: "Cable containment",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "BOM with a generic engineering subject and no product selection",
      engineeringSubjects: { [decision.decision.decisionId]: "Cable tray, perforated, hot-dip galvanised" },
    });

    // The BOM exists and is usable with NO catalog product chosen anywhere.
    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]!.engineeringSubject).toContain("Cable tray");
    expect(version.rows[0]!.isApprovedRow).toBe(true);
  });

  it("16. no ProductSelection, CatalogItem, or Supplier record is created anywhere in the flow", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "X-01", valueLiteral: "10", sourceNumericView: 10, unit: "ea", unitDimension: "COUNT" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      subjectMatchKey: "X-01",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT",
      approvedValue: 10,
      approvedUnitLiteral: "ea",
      approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE",
      actorUserId: "user-1",
      rationale: "approved",
      consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });
    await harness.bom.createBomVersion({
      companyId: COMPANY_A,
      takeoffScopeId: scope.takeoffScopeId,
      engineeringScope: "scope",
      decisionIds: [decision.decision.decisionId],
      actorUserId: "user-1",
      reason: "BOM",
    });

    // The in-memory store implements ONLY the engineering surface. There is no
    // method on it that could have created a commercial or procurement record.
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(harness.store));
    for (const concept of ENGINEERING_PROHIBITED_CONCEPTS) {
      const hit = methods.find((method) => method.toLowerCase().includes(concept.toLowerCase().replace(/_/g, "")));
      expect(hit, `the engineering store must expose no method for ${concept}`).toBeUndefined();
    }
  });
});

// ===========================================================================
// 17 & 18. BOM version immutability and partial completeness
// ===========================================================================

describe("Phase 2A-11 — Engineering BOM versioning", () => {
  async function twoDecisionSetup() {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [
          claimFor({ claimId: "claim-1", subjectMatchKey: "CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" }),
          claimFor({ claimId: "claim-2", subjectMatchKey: "NVR-01", valueLiteral: "2", sourceNumericView: 2, unit: "ea", unitDimension: "COUNT" }),
        ],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    return { harness, scope, candidates: derived.candidates };
  }

  it("17. an APPROVED BOM version is immutable: a change produces a NEW version referencing the old one", async () => {
    const { harness, scope, candidates } = await twoDecisionSetup();
    const cam = candidates.find((candidate) => candidate.subjectMatchKey === "CAM-01")!;
    const nvr = candidates.find((candidate) => candidate.subjectMatchKey === "NVR-01")!;

    const camDecision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 24, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [cam.candidateId],
    });
    const nvrDecision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "NVR-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 2, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [nvr.candidateId],
    });

    const v1 = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [camDecision.decision.decisionId, nvrDecision.decision.decisionId],
      actorUserId: "user-1", reason: "first version",
    });
    const approvedV1 = await harness.bom.approveBomVersion({ companyId: COMPANY_A, bomVersionId: v1.version.bomVersionId, approvedByUserId: "user-1" });
    expect(approvedV1.state).toBe("APPROVED");
    expect(approvedV1.completeness).toBe("APPROVED");

    // The stored rows of the approved version cannot be rewritten.
    await expect(harness.store.saveBomRows({ companyId: COMPANY_A, bomVersionId: v1.version.bomVersionId, rows: [] }))
      .rejects.toThrow(/immutable/);

    // A change creates a NEW version that points at the old one.
    const v2 = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [camDecision.decision.decisionId, nvrDecision.decision.decisionId],
      actorUserId: "user-2", reason: "a row changed", changeNote: "NVR quantity revised",
    });
    expect(v2.version.versionNumber).toBe(2);
    expect(v2.version.previousVersionId).toBe(v1.version.bomVersionId);

    // The ORIGINAL approved version and its rows are untouched.
    const reloadedV1 = await harness.bom.findBomVersion({ companyId: COMPANY_A, bomVersionId: v1.version.bomVersionId });
    expect(reloadedV1!.state).toBe("APPROVED");
    const v1Rows = await harness.bom.listRows({ companyId: COMPANY_A, bomVersionId: v1.version.bomVersionId });
    expect(v1Rows).toHaveLength(2);
    expect(v1Rows.find((row) => row.quantityDecisionId === camDecision.decision.decisionId)!.approvedQuantity).toBe(24);

    // An attempted mutation of the approved version is DETECTED.
    const mutation = await harness.bom.detectAttemptedMutation({
      companyId: COMPANY_A,
      bomVersionId: v1.version.bomVersionId,
      candidateHeader: { engineeringScope: "silently changed" },
    });
    expect(mutation.mutated).toBe(true);
    expect(mutation.fields).toContain("engineeringScope");
  });

  it("18. an approved SUBSET is never presented as a complete BOM (required-subject coverage)", async () => {
    const { harness, scope, candidates } = await twoDecisionSetup();
    const cam = candidates.find((candidate) => candidate.subjectMatchKey === "CAM-01")!;

    // Only ONE of the TWO required subjects is approved; the other (NVR-01) has
    // governed candidates but no decision at all.
    const camDecision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 24, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [cam.candidateId],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [camDecision.decision.decisionId],
      actorUserId: "user-1", reason: "partial version",
    });

    // One approved decision produces exactly one row, and that row IS approved.
    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]!.isApprovedRow).toBe(true);

    // THE DEFINITIVE ASSERTION: a one-row version in a scope that requires TWO
    // subjects is NOT a complete BOM, because the required subject set governs
    // completeness — not the rows that happen to exist.
    expect(version.version.completeness).not.toBe("APPROVED");
    expect(version.version.completeness).toBe("REVIEW_REQUIRED");
    expect(version.version.unresolvedRequiredSubjectCount).toBe(1);

    // NVR-01 must remain visible as an OMITTED required subject in the persisted
    // manifest, not silently dropped.
    const manifest = await harness.store.listRequiredSubjects({
      companyId: COMPANY_A,
      bomVersionId: version.version.bomVersionId,
    });
    expect(manifest).toHaveLength(2);
    const carried = manifest.find((subject) => subject.subjectMatchKey === "CAM-01")!;
    const omitted = manifest.find((subject) => subject.subjectMatchKey === "NVR-01")!;
    expect(carried.resolution).toBe("CARRIED_BY_ROW");
    expect(carried.bomRowId).not.toBeNull();
    expect(omitted.resolution).toBe("CANDIDATE_WITHOUT_DECISION");
    expect(omitted.bomRowId).toBeNull();
    expect(omitted.reason).toBeTruthy();
    expect(version.skippedDecisionIds).toEqual([]);

    // The decisive property, asserted over the REAL row model: an approved row
    // alongside a row that still needs review is PARTIALLY_APPROVED, and never
    // APPROVED.
    const approvedRow = version.rows[0]!;
    const reviewRequiredRow = buildBomRow({
      bomVersionId: version.version.bomVersionId,
      companyId: COMPANY_A,
      position: 2,
      engineeringSubject: "NVR-01",
      decision: { ...camDecision.decision, decisionId: "eqd-review-required", subjectMatchKey: "NVR-01" },
      adjustments: [],
      constraints: [],
      systemContext: null,
      locationContext: null,
      approvedQuantity: 2,
      unitLiteral: "ea",
      unitDimension: "COUNT",
      sourceArtifactIds: [],
      derivationFamilyRootArtifactIds: [],
      occurrenceLedgerEntryIds: [],
      // The row itself is not approved yet.
      readiness: "REVIEW_REQUIRED",
      readinessReasons: ["this decision still needs an engineering approval"],
      limitations: [],
      createdAt: TEST_NOW,
    });
    expect(reviewRequiredRow.isApprovedRow).toBe(false);

    const mixed = computeBomCompleteness([approvedRow, reviewRequiredRow]);
    expect(mixed.completeness).toBe("PARTIALLY_APPROVED");
    expect(mixed.approvedRowCount).toBe(1);
    expect(mixed.reviewRequiredRowCount).toBe(1);

    // Rows alone are not the whole story. Even a version whose every row is
    // approved cannot be a complete BOM while a required subject is omitted.
    const coverageAware = computeBomCompletenessWithCoverage({
      rows: [approvedRow],
      requiredSubjects: manifest.map((subject) => ({
        subjectMatchKey: subject.subjectMatchKey,
        subjectKeyNamespace: subject.subjectKeyNamespace,
        subjectLabel: subject.subjectLabel,
        requirementKind: subject.requirementKind,
        resolution: subject.resolution,
        resolvedByDecisionId: subject.resolvedByDecisionId,
        bomRowId: subject.bomRowId,
        reason: subject.reason,
      })),
    });
    expect(coverageAware.completeness).toBe("REVIEW_REQUIRED");
    expect(coverageAware.unresolvedSubjectCount).toBe(1);
    // With no governed subject set the row-only verdict still stands, so a
    // version built without a manifest is not silently re-judged.
    expect(computeBomCompleteness([approvedRow]).completeness).toBe("APPROVED");

    // An EMPTY BOM is INCOMPLETE, not vacuously approved.
    const empty = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [], actorUserId: "user-1", reason: "empty",
    });
    expect(empty.version.completeness).toBe("INCOMPLETE");
  });

  it("a superseded decision is SKIPPED from a new BOM version rather than carried as current truth", async () => {
    const { harness, scope, candidates } = await twoDecisionSetup();
    const cam = candidates.find((candidate) => candidate.subjectMatchKey === "CAM-01")!;

    const first = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 24, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [cam.candidateId],
    });
    const second = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 26, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "CORRECTED_BY_HUMAN", actorUserId: "user-2", rationale: "revised", consideredCandidateIds: [cam.candidateId],
    });

    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [first.decision.decisionId, second.decision.decisionId],
      actorUserId: "user-1", reason: "after revision",
    });

    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]!.approvedQuantity).toBe(26);
    expect(version.skippedDecisionIds).toContain(first.decision.decisionId);
  });
});

// ===========================================================================
// 19. Tenant isolation
// ===========================================================================

describe("Phase 2A-11 — tenant isolation", () => {
  it("19a. a scope, its candidates, its occurrences, its decisions, and its BOM are invisible across companies", async () => {
    const handoffA = buildHandoff({ companyId: COMPANY_A, quantityClaims: [claimFor({ claimId: "a1", companyId: COMPANY_A, subjectMatchKey: "A-01", valueLiteral: "5", sourceNumericView: 5, unit: "ea", unitDimension: "COUNT" })] });
    const handoffB = buildHandoff({ companyId: COMPANY_B, quantityClaims: [claimFor({ claimId: "b1", companyId: COMPANY_B, subjectMatchKey: "B-01", valueLiteral: "7", sourceNumericView: 7, unit: "ea", unitDimension: "COUNT" })] });
    const harness = buildHarness({ handoffReader: perCompanyHandoffReader({ [COMPANY_A]: handoffA, [COMPANY_B]: handoffB }), clock: advancingClock() });

    const scopeA = await harness.takeoff.openTakeoffScope({ companyId: COMPANY_A, name: "A scope", scopeKind: "MATERIAL_TAKEOFF", comparisonScopeId: "cmp-scope-1", createdByUserId: "user-a" });
    await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scopeA.takeoffScopeId });

    // Company B cannot see company A's scope at all.
    expect(await harness.store.findScope({ companyId: COMPANY_B, takeoffScopeId: scopeA.takeoffScopeId })).toBeNull();
    expect(await harness.store.listCandidates({ companyId: COMPANY_B, takeoffScopeId: scopeA.takeoffScopeId, limit: 100 })).toHaveLength(0);
    expect(await harness.store.listOccurrences({ companyId: COMPANY_B, takeoffScopeId: scopeA.takeoffScopeId, limit: 100 })).toHaveLength(0);
    expect(await harness.store.listDecisions({ companyId: COMPANY_B, takeoffScopeId: scopeA.takeoffScopeId, limit: 100 })).toHaveLength(0);
    expect(await harness.store.listBomVersions({ companyId: COMPANY_B, takeoffScopeId: scopeA.takeoffScopeId, limit: 100 })).toHaveLength(0);

    // Company A sees its own data.
    expect(await harness.store.findScope({ companyId: COMPANY_A, takeoffScopeId: scopeA.takeoffScopeId })).not.toBeNull();
  });

  it("19b. a decision recorded under one company never appears for another", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [claimFor({ claimId: "c1", subjectMatchKey: "Z-01", valueLiteral: "3", sourceNumericView: 3, unit: "ea", unitDimension: "COUNT" })] }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "Z-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 3, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });

    expect(await harness.decisions.findDecision({ companyId: COMPANY_B, decisionId: decision.decision.decisionId })).toBeNull();
    expect(await harness.decisions.currentDecision({ companyId: COMPANY_B, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "Z-01" })).toBeNull();
  });

  it("19c. the authenticated company context wins: a caller cannot write a scope under another company", async () => {
    const harness = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    // The scope is opened with the AUTHENTICATED company and is stored under it.
    const scope = await openScope(harness, { companyId: COMPANY_A });
    expect(scope.companyId).toBe(COMPANY_A);
    // A company-B read of that id returns nothing, so a cross-tenant write path
    // has no scope to attach to.
    expect(await harness.store.findScope({ companyId: COMPANY_B, takeoffScopeId: scope.takeoffScopeId })).toBeNull();
    await expect(harness.takeoff.deriveCandidates({ companyId: COMPANY_B, takeoffScopeId: scope.takeoffScopeId }))
      .rejects.toThrow(/does not exist for this company/);
  });
});

// ===========================================================================
// 20. Persisted 2A-12 handoff
// ===========================================================================

describe("Phase 2A-11 — Phase 2A-12 read contract", () => {
  async function approvedBomSetup() {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" })],
        subjectClusters: [clusterFor({ subjectClusterId: "cluster-1", matchKey: "CAM-01", memberClaimIds: ["claim-1"] })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 24, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved from the tender schedule",
      selectedCandidateId: derived.candidates[0]!.candidateId, consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });
    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [decision.decision.decisionId], actorUserId: "user-1", reason: "BOM for 2A-12",
    });
    await harness.bom.approveBomVersion({ companyId: COMPANY_A, bomVersionId: version.version.bomVersionId, approvedByUserId: "user-1" });
    return { harness, scope, decision: decision.decision, version: version.version };
  }

  it("20. builds a persisted 2A-12 contract with the FULL lineage chain and no mutable parser structures", async () => {
    const { harness, version } = await approvedBomSetup();

    const handoff = await buildEngineeringBomHandoff({ store: harness.store }, { companyId: COMPANY_A, bomVersionId: version.bomVersionId });

    expect(handoff.contractVersion).toBe(ENGINEERING_HANDOFF_VERSION);
    expect(handoff.rows).toHaveLength(1);
    const row = handoff.rows[0]!;
    expect(row.approvedQuantity).toBe(24);
    expect(row.quantityOrigin).toBe("APPROVED_ENGINEERING");

    // Lineage: BOM row -> decision -> candidates -> claims -> citations.
    expect(row.lineage.quantityDecisionId).toBeTruthy();
    expect(row.lineage.candidateIds.length).toBeGreaterThan(0);
    expect(row.lineage.claimIds).toContain("claim-1");
    expect(row.lineage.originChain.length).toBeGreaterThan(0);
    expect(row.lineage.originChain[row.lineage.originChain.length - 1]!.origin).toBe("APPROVED_ENGINEERING");

    // No mutable parser-native structure is exposed.
    for (const forbidden of BOM_HANDOFF_NOT_EXPOSED_FIELDS) {
      expect(Object.keys(row)).not.toContain(forbidden);
    }
    expect(Object.keys(row)).not.toContain("rawEntity");
    expect(Object.keys(row)).not.toContain("parserPayload");
    expect(handoff.notExposed).toEqual(BOM_HANDOFF_NOT_EXPOSED_FIELDS);
  });

  it("20b. refuses to publish a DRAFT version: 2A-12 reads only APPROVED engineering truth", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [claimFor({ claimId: "c1", subjectMatchKey: "Q-01", valueLiteral: "1", sourceNumericView: 1, unit: "ea", unitDimension: "COUNT" })] }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "Q-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 1, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });
    const draft = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "scope",
      decisionIds: [decision.decision.decisionId], actorUserId: "user-1", reason: "draft",
    });

    await expect(buildEngineeringBomHandoff({ store: harness.store }, { companyId: COMPANY_A, bomVersionId: draft.version.bomVersionId }))
      .rejects.toThrow(/reads only an APPROVED Engineering BOM version/);
  });

  it("20c. latestApprovedBomHandoff returns the newest approved version and null when none is approved", async () => {
    const { harness, scope, version } = await approvedBomSetup();
    const latest = await latestApprovedBomHandoff({ store: harness.store }, { companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    expect(latest!.bomVersionId).toBe(version.bomVersionId);

    const other = buildHarness({ handoff: buildHandoff({ quantityClaims: [] }) });
    const otherScope = await openScope(other, { companyId: COMPANY_A });
    expect(await latestApprovedBomHandoff({ store: other.store }, { companyId: COMPANY_A, takeoffScopeId: otherScope.takeoffScopeId })).toBeNull();
  });
});

// ===========================================================================
// 21 & 22. No promotion to commercial or procurement concepts
// ===========================================================================

describe("Phase 2A-11 — no promotion guarantee", () => {
  it("21. the engineering store type exposes NO commercial or procurement method", () => {
    const harness = buildHarness();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(harness.store)).map((method) => method.toLowerCase());

    const prohibitedPatterns = [
      "quotation",
      "quotationline",
      "invoice",
      "productselection",
      "supplier",
      "procurement",
      "rfq",
      "offer",
      "award",
      "purchaseorder",
      "salesorder",
    ];
    for (const pattern of prohibitedPatterns) {
      const hit = methods.find((method) => method.includes(pattern));
      expect(hit, `the engineering store must expose no ${pattern} method`).toBeUndefined();
    }
  });

  it("22. a full takeoff → decision → BOM flow never touches a commercial concept", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({
        quantityClaims: [claimFor({ claimId: "claim-1", subjectMatchKey: "CAM-01", valueLiteral: "24", sourceNumericView: 24, unit: "ea", unitDimension: "COUNT" })],
      }),
      clock: advancingClock(),
    });
    const scope = await openScope(harness);
    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    const decision = await harness.decisions.recordDecision({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, subjectMatchKey: "CAM-01", subjectKeyNamespace: "EQUIPMENT_TAG",
      requirementKind: "EQUIPMENT", approvedValue: 24, approvedUnitLiteral: "ea", approvedUnitDimension: "COUNT",
      decisionBasis: "ADOPTED_SOURCE_VALUE", actorUserId: "user-1", rationale: "approved", consideredCandidateIds: [derived.candidates[0]!.candidateId],
    });
    const version = await harness.bom.createBomVersion({
      companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, engineeringScope: "CCTV",
      decisionIds: [decision.decision.decisionId], actorUserId: "user-1", reason: "BOM",
    });
    await harness.bom.approveBomVersion({ companyId: COMPANY_A, bomVersionId: version.version.bomVersionId, approvedByUserId: "user-1" });

    // The only place a commercial word may legitimately appear is the explicit
    // `notExposed` declaration, which exists precisely to NAME what is withheld.
    // So the vocabulary scan runs over everything EXCEPT that declaration: if a
    // price, supplier, or quotation line leaked into a row or a lineage, it
    // would have to show up outside the withholder list.
    const handoff = await buildEngineeringBomHandoff({ store: harness.store }, { companyId: COMPANY_A, bomVersionId: version.version.bomVersionId });
    const { notExposed, ...exposedContract } = handoff;
    expect(notExposed).toEqual(BOM_HANDOFF_NOT_EXPOSED_FIELDS);

    const serialized = (JSON.stringify(exposedContract) + JSON.stringify(harness.store.callLog)).toLowerCase();
    for (const term of ["quotation", "invoice", "supplier", "productselection", "purchaseorder", "procurement", "price", "currency", "rfq", "award"]) {
      expect(serialized, `the flow must not produce ${term}`).not.toContain(term);
    }

    // And the prohibition is not merely a wording choice: no store method on the
    // engineering port surface can even name a commercial concept.
    const storeMethods = Object.keys(harness.store).filter((key) => typeof (harness.store as unknown as Record<string, unknown>)[key] === "function");
    const commercialMethods = storeMethods.filter((method) => ["quotation", "invoice", "supplier", "productselection", "purchaseorder", "rfq", "award", "offer", "price"].some((term) => method.toLowerCase().includes(term)));
    expect(commercialMethods).toEqual([]);
  });
});

// ===========================================================================
// Scope readiness
// ===========================================================================

describe("Phase 2A-11 — truthful scope readiness", () => {
  it("a scope whose evidence was entirely withheld by governance is honestly NOT ready", async () => {
    const handoff = buildHandoff({
      quantityClaims: [claimFor({ claimId: "claim-orphan", subjectMatchKey: "ORPHAN-01", valueLiteral: "5", sourceNumericView: 5, documentIdentityId: "identity-orphan", revisionMembershipId: "membership-1" })],
      // A membership whose identity has NO active revision decision.
      revisionMemberships: [membershipFor({ membershipId: "membership-1", sourceArtifactId: "artifact-1", documentIdentityId: "identity-orphan" })],
      activeRevisionDecisions: [],
      documentIdentities: [identityFor({ documentIdentityId: "identity-orphan" })],
    });
    const harness = buildHarness({ handoff, clock: fixedClock() });
    const scope = await openScope(harness);

    const derived = await harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    // The claim was withheld because its document identity has no governing
    // decision, and the withholding is REPORTED rather than silent.
    expect(derived.candidates).toHaveLength(0);
    expect(derived.withheldClaims.some((claim) => claim.claimId === "claim-orphan")).toBe(true);

    const refreshed = await harness.takeoff.findScope({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    expect(refreshed!.readiness).not.toBe("APPROVED");
  });

  it("reports a missing handoff as a block rather than an empty-but-fine scope", async () => {
    const harness = buildHarness({ handoff: null });
    const scope = await openScope(harness);
    expect(scope.readiness).not.toBe("APPROVED");
    expect(scope.blockReasons.join(" ")).toContain("could not be read");
    await expect(harness.takeoff.deriveCandidates({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId }))
      .rejects.toThrow(/handoff is unavailable/);
  });
});

// ===========================================================================
// Occurrence ledger persistence
// ===========================================================================

describe("Phase 2A-11 — occurrence ledger persistence", () => {
  it("the ledger is append-only: re-saving the same occurrences inserts nothing", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1" })],
    });
    const scope = await openScope(harness);
    await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });
    const before = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });

    await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });
    const after = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });

    expect(after).toHaveLength(before.length);
  });

  it("persists the counting rule so a later rule change cannot silently reinterpret history", async () => {
    const harness = buildHarness({
      handoff: buildHandoff({ quantityClaims: [] }),
      occurrences: [occurrence({ family: "DXF", sourceType: "INSERT", locator: "msp#1" })],
    });
    const scope = await openScope(harness);
    await harness.takeoff.countOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, family: "DXF", artifactIds: ["artifact-dxf-1"] });

    const rules = await harness.takeoff.listCountingRules({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.ruleVersion).toContain("2a-11.counting.v1/dxf");
    expect(rules[0]!.modelSpaceOnly).toBe(true);

    const entries = await harness.store.listOccurrences({ companyId: COMPANY_A, takeoffScopeId: scope.takeoffScopeId, limit: 100 });
    for (const entry of entries) {
      expect(entry.countingRuleId).toBe(rules[0]!.ruleId);
      expect(entry.countingRuleVersion).toBe(rules[0]!.ruleVersion);
    }
  });
});
