/**
 * Phase 2A-10 hardening: PARTIAL COVERAGE and ABSENCE-FINDING SAFETY.
 *
 * The general rule: an absence finding may only be asserted when the relevant
 * source coverage is COMPLETE. For PARTIAL, TRUNCATED, UNAVAILABLE, or
 * HASH_MISMATCH, VOKA must not assert a missing property, a missing schedule
 * counterpart, a missing system item, or a missing subject as source truth — it
 * emits a bounded coverage/unavailable disclosure instead.
 *
 * Both channels here are the REAL accepted ones: the real ISO-10303-21 fixture
 * through the real `analyzeIfcBytes` and the real `materializeIfcClaims`, and
 * the real DXF fixture through the real `analyzeDxfBytes` and the real
 * `materializeDxfClaims`, then the real comparison engine. No analyzer is
 * mocked away.
 */

import { describe, expect, it } from "vitest";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc/IfcInspectionAnalyzer";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf/DxfInspectionAnalyzer";
import { fullIfcModel, ifcEntity, stepString } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";
import { largeDrawing } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";
import { materializeIfcClaims, IFC_REFUSED_COUNTERS } from "@/src/application/cross-document/materialization/IfcMaterializer";
import { materializeDxfClaims, DXF_REFUSED_INGESTION_METRICS } from "@/src/application/cross-document/materialization/DxfMaterializer";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { buildHarness, makeArtifact, type MaterializationFactory } from "@/src/application/cross-document/__tests__/harness";
import { IFC_PAGE_NUMBER, MAX_STEP_RECORD_LENGTH } from "@/src/domain/source-artifact";
import type { CrossDocumentStore, MaterializedArtifact } from "@/src/application/cross-document/ports";

const IFC_ARTIFACT = makeArtifact({ artifactId: "artifact-ifc", kind: "IFC", filename: "seafront.ifc" });
const DXF_ARTIFACT = makeArtifact({ artifactId: "artifact-dxf", kind: "DXF", filename: "layout.dxf" });
const TEST_NOW = "2026-09-12T00:00:00.000Z";

/**
 * The accepted full IFC model plus, inside DATA:
 *
 * - a declared count quantity attached to the fire-suppression terminal element,
 *   so the partial model still carries real declared model evidence;
 * - ONE oversized STEP entity, which the real reader's own safety bound refuses.
 *   That refusal sets `truncated` and retains everything else — exactly the
 *   partial-coverage case under test.
 */
function truncatedIfcBytes(): Buffer {
  const oversized = "X".repeat(MAX_STEP_RECORD_LENGTH + 200);
  const oversizedEntity = ifcEntity(90, "IFCPROPERTYSINGLEVALUE", `${stepString("OversizedDescription")},$,IFCTEXT(${stepString(oversized)}),$`);
  const declaredQuantity = [
    ifcEntity(91, "IFCQUANTITYCOUNT", `${stepString("NumberOfUnits")},$,#1,24`),
    ifcEntity(92, "IFCELEMENTQUANTITY", `${stepString("2xQtoElementGlobalId028")},$,${stepString("Qto_FireSuppressionTerminalBaseQuantities")},$,$,(#91)`),
    ifcEntity(93, "IFCRELDEFINESBYPROPERTIES", `${stepString("2xRelQtoElem00000029")},$,$,$,(#30),#92`),
  ].join("\n");
  const tail = "ENDSEC;\nEND-ISO-10303-21;";
  const document = fullIfcModel();
  expect(document.includes(tail)).toBe(true);
  return Buffer.from(document.replace(tail, `${declaredQuantity}\n${oversizedEntity}\n${tail}`), "utf8");
}

/** A drawing past the accepted entity-retention bound: real bounded truncation. */
function truncatedDxfBytes(): Buffer {
  return Buffer.from(largeDrawing(1600), "utf8");
}

function lineageOf(artifact: ReturnType<typeof makeArtifact>) {
  return { derivationFamilyRootArtifactId: artifact.artifactId, lineageRole: "STANDALONE" as const, derivation: null };
}

function materializeTruncatedIfc(): MaterializedArtifact {
  const analysis = analyzeIfcBytes(truncatedIfcBytes(), { filename: IFC_ARTIFACT.originalFilename, mimeType: "model/ifc" });
  expect(analysis.truncated).toBe(true);
  return materializeIfcClaims({
    artifact: IFC_ARTIFACT,
    lineage: lineageOf(IFC_ARTIFACT),
    materializationId: "mat_ifc_partial",
    runId: null,
    createdAt: TEST_NOW,
    analysis,
  });
}

function materializeTruncatedDxf(): MaterializedArtifact {
  const analysis = analyzeDxfBytes(truncatedDxfBytes(), { filename: DXF_ARTIFACT.originalFilename, mimeType: "image/vnd.dxf" });
  expect(analysis.truncated).toBe(true);
  return materializeDxfClaims({
    artifact: DXF_ARTIFACT,
    lineage: lineageOf(DXF_ARTIFACT),
    materializationId: "mat_dxf_partial",
    runId: null,
    createdAt: TEST_NOW,
    analysis,
  });
}

async function runWith(materializations: Record<string, MaterializedArtifact>, roles: Record<string, "BOQ" | "BIM_MODEL" | "DRAWING">) {
  const artifacts = Object.values(materializations).map((materialization) => materialization.artifact);
  const factory: MaterializationFactory = ({ artifact }) => materializations[artifact.artifactId]!;
  const harness = await buildHarness({ artifacts, factory, roles });
  const run = await runCrossDocumentComparison({
    companyId: "company-1",
    comparisonScopeId: harness.scopeId,
    actorUserId: "user-1",
    dependencies: harness.dependencies,
  });
  return { harness, run, findings: await findingsOf(harness.store, harness.scopeId) };
}

async function findingsOf(store: CrossDocumentStore, scopeId: string) {
  return store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 100 });
}

describe("IFC partial coverage on the real accepted analyzer path", () => {
  it("materializes a truncated IFC as PARTIAL while every retained claim stays a valid observation", () => {
    const materialized = materializeTruncatedIfc();

    // Coverage is PARTIAL and every claim carries that coverage.
    expect(materialized.coverage).toBe("PARTIAL");
    expect(materialized.truncated).toBe(true);
    expect(materialized.truncationReasons.length).toBeGreaterThan(0);
    expect(materialized.claims.length).toBeGreaterThan(0);
    expect(materialized.claims.every((claim) => claim.context.sourceCoverage === "PARTIAL")).toBe(true);
    expect(materialized.claims.every((claim) => claim.status === "OBSERVED_NOT_APPROVED")).toBe(true);

    // The IFC locator is preserved verbatim, and a STEP model has no pages.
    expect(materialized.claims.every((claim) => claim.provenance.pageNumber === IFC_PAGE_NUMBER)).toBe(true);
    expect(materialized.claims.every((claim) => claim.provenance.pageNumber === null)).toBe(true);
    expect(materialized.claims.every((claim) => claim.provenance.locator.length > 0)).toBe(true);
    // The accepted IFC locator grammar is preserved verbatim: IFC:#<stepId>:<entityType>.
    expect(materialized.claims.every((claim) => /^IFC:#\d+:IFC[A-Z]+$/u.test(claim.provenance.locator))).toBe(true);
    expect(materialized.claims.some((claim) => claim.provenance.locator === "IFC:#30:IFCFIRESUPPRESSIONTERMINAL")).toBe(true);

    // No element count becomes an engineering quantity: the refused counters are
    // never a value literal, and the only quantity is the model's own declared
    // quantity, kept as DECLARED_MODEL with the model's own number.
    const quantities = materialized.claims.filter((claim) => claim.assertion.predicate === "STATED_QUANTITY");
    expect(quantities.length).toBeGreaterThan(0);
    for (const claim of quantities) {
      expect(claim.assertion.quantityOrigin).toBe("DECLARED_MODEL");
      expect(IFC_REFUSED_COUNTERS).not.toContain(claim.assertion.valueLiteral);
    }
    const declared = quantities.find((claim) => claim.assertion.valueLiteral === "24");
    expect(declared).toBeDefined();
    // The accepted model supplied the number, which is the ONLY reason a
    // persisted numeric view exists here.
    expect(declared!.assertion.valueNumber).toBe(24);
    expect(declared!.assertion.valueNumberOrigin).toBe("SOURCE_SUPPLIED");
    expect(declared!.provenance.locator).toBe("IFC:#30:IFCFIRESUPPRESSIONTERMINAL");
    // The quantity set points at a length unit, not a count unit, so no unit was
    // inferred: the literal stays and the unit stays unknown.
    expect(declared!.assertion.unitLiteral).toBeNull();
    expect(declared!.assertion.unitDeclared).toBe(false);

    // The truncation is disclosed as a coverage limitation, never as an absence.
    expect(materialized.limitations.some((limitation) => limitation.includes("absence"))).toBe(true);

    // The refused oversized record produced no claim, and nothing was inferred
    // from what it did not carry.
    expect(materialized.claims.some((claim) => claim.assertion.valueLiteral.startsWith("XXXX"))).toBe(false);
    expect(materialized.claims.filter((claim) => /missing|absent|not provided/iu.test(claim.assertion.valueLiteral))).toHaveLength(0);
  });

  it("emits one bounded coverage disclosure and asserts no absence against the partial IFC", async () => {
    const ifcMaterialized = materializeTruncatedIfc();
    expect(ifcMaterialized.coverage).toBe("PARTIAL");

    // The subject the partial model DOES carry, taken from the real claim so the
    // comparison is genuinely possible and the coverage rule is what blocks it.
    const subjectClaim = ifcMaterialized.claims.find((claim) => claim.subject.subjectKeyNamespace === "MANUFACTURER_MODEL")
      ?? ifcMaterialized.claims.find((claim) => claim.subject.subjectKeyNamespace === "EQUIPMENT_TAG");
    expect(subjectClaim).toBeDefined();

    const dxfMaterialized = materializeTruncatedDxf();
    const { findings } = await runWith(
      { [IFC_ARTIFACT.artifactId]: ifcMaterialized, [DXF_ARTIFACT.artifactId]: dxfMaterialized },
      { [IFC_ARTIFACT.artifactId]: "BIM_MODEL", [DXF_ARTIFACT.artifactId]: "DRAWING" },
    );

    const kinds = findings.map((finding) => finding.findingKind);
    const coverageFindings = findings.filter((finding) => finding.findingKind === "EVIDENCE_COVERAGE_INCOMPLETE");
    // One bounded disclosure per partial source, each with a bounded participant set.
    expect(coverageFindings.length).toBeGreaterThanOrEqual(1);
    for (const finding of coverageFindings) {
      expect(finding.severity).toBe("REVIEW");
      expect(finding.participantIds.length).toBeLessThanOrEqual(2);
      expect(finding.limitations.some((limitation) => limitation.includes("absence is not asserted"))).toBe(true);
    }

    // No absence is asserted against a partial source.
    expect(kinds).not.toContain("PROPERTY_MISSING_IN_SOURCE");
    expect(kinds).not.toContain("SCHEDULE_COUNTERPART_MISSING");
    expect(kinds).not.toContain("INCLUSION_EXCLUSION_MISMATCH");
    expect(subjectClaim!.subject.subjectKeyValue.length).toBeGreaterThan(0);
  });
});

describe("non-IFC incomplete channel: DXF beyond the accepted retention bound", () => {
  it("materializes a truncated drawing as PARTIAL and never turns a count into a quantity", () => {
    const materialized = materializeTruncatedDxf();
    expect(materialized.coverage).toBe("PARTIAL");
    expect(materialized.truncated).toBe(true);
    expect(materialized.truncationReasons.length).toBeGreaterThan(0);

    // Entity, symbol, insert, and text totals never become STATED_QUANTITY.
    const quantities = materialized.claims.filter((claim) => claim.assertion.predicate === "STATED_QUANTITY");
    expect(quantities).toHaveLength(0);
    for (const claim of materialized.claims) {
      expect(DXF_REFUSED_INGESTION_METRICS).not.toContain(claim.assertion.valueLiteral);
    }
    // A drawing declares no pages either.
    expect(materialized.claims.every((claim) => claim.provenance.pageNumber === null)).toBe(true);
    expect(materialized.claims.every((claim) => claim.context.sourceCoverage === "PARTIAL")).toBe(true);
    // The absence-safety statement is disclosed by the materializer itself.
    expect(materialized.truncationReasons.some((reason) => reason.includes("absence of evidence from this source is not asserted"))).toBe(true);
  });

  it("asserts no absence from a partial drawing", async () => {
    const dxfMaterialized = materializeTruncatedDxf();
    const ifcMaterialized = materializeTruncatedIfc();
    const { findings } = await runWith(
      { [DXF_ARTIFACT.artifactId]: dxfMaterialized, [IFC_ARTIFACT.artifactId]: ifcMaterialized },
      { [DXF_ARTIFACT.artifactId]: "DRAWING", [IFC_ARTIFACT.artifactId]: "BIM_MODEL" },
    );
    const kinds = findings.map((finding) => finding.findingKind);
    expect(kinds).not.toContain("PROPERTY_MISSING_IN_SOURCE");
    expect(kinds).not.toContain("SCHEDULE_COUNTERPART_MISSING");
    expect(kinds).not.toContain("INCLUSION_EXCLUSION_MISMATCH");
    expect(kinds).toContain("EVIDENCE_COVERAGE_INCOMPLETE");
  });
});
