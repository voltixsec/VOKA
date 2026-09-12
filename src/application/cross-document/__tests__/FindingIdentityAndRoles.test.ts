/**
 * Phase 2A-10 hardening: FINDING IDENTITY AND DOCUMENT-ROLE INDEPENDENCE.
 *
 * A finding's identity is the discrepancy about a subject, not the values that
 * happen to disagree today. 24-vs-22 and then 24-vs-23 are the SAME finding:
 * same id, `evidenceChanged` true, and the earlier evidence still reconstructible
 * through the durable observation rows. A different subject cluster or a
 * different comparison scope is a different finding.
 *
 * Which document a reviewer opens first is presentation. Swapping the BOQ and
 * the BIM model changes display order and labels only — never the finding id,
 * kind, predicate, severity, or participant set.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { listFindingEvidenceHistory } from "@/src/application/cross-document/ReadModels";
import { buildHarness, claimFor, makeArtifact } from "./harness";
import { buildFindingFingerprint, severityForFindingKind, type NormalizedEvidenceClaim } from "@/src/domain/cross-document";

const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });
const MODEL = makeArtifact({ artifactId: "artifact-model", kind: "IFC", filename: "model.ifc" });

/** One quantity claim per artifact, disagreeing across the two sides. */
function quantityClaims(input: {
  artifact: ReturnType<typeof makeArtifact>;
  lineage: never;
  left: boolean;
  leftValue: string;
  rightValue: string;
  subject: string;
  leftLocator: string;
  rightLocator: string;
  leftChannel: NormalizedEvidenceClaim["readingChannel"];
  rightChannel: NormalizedEvidenceClaim["readingChannel"];
  leftVersion: string;
  rightVersion: string;
}) {
  return [
    claimFor({
      artifact: input.artifact,
      lineage: input.lineage,
      predicate: "STATED_QUANTITY",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      subjectKeyValue: input.subject,
      subjectMatchKey: input.subject.replace(/-/gu, ""),
      valueLiteral: input.left ? input.leftValue : input.rightValue,
      sourceSuppliedNumber: Number.parseInt(input.left ? input.leftValue : input.rightValue, 10),
      unit: "nos",
      quantityOrigin: input.left ? "STATED" : "DECLARED_MODEL",
      locator: input.left ? input.leftLocator : input.rightLocator,
      readingChannel: input.left ? input.leftChannel : input.rightChannel,
      materializerVersion: input.left ? input.leftVersion : input.rightVersion,
    }),
  ];
}

describe("finding identity across changing evidence", () => {
  it("keeps one finding id when the evidence changes from 24-vs-22 to 24-vs-23", async () => {
    // The right-hand value is mutable so the SAME scope can be re-run.
    let rightValue = "22";
    const harness = await buildHarness({
      artifacts: [BOQ, SPEC],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
        readingChannels: [artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT"],
        coverage: "COMPLETE",
        claims: quantityClaims({
          artifact,
          lineage: lineage as never,
          left: artifact.kind === "XLSX",
          leftValue: "24",
          rightValue,
          subject: "AHU-01",
          leftLocator: "row 12 column D",
          rightLocator: "p. 3 row 4",
          leftChannel: "WORKBOOK_STRUCTURED",
          rightChannel: "PDF_NATIVE_TEXT",
          leftVersion: "2a-10.materializer.workbook.v1",
          rightVersion: "2a-10.materializer.pdf-native.v1",
        }),
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });

    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const runOne = await harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
    const mismatch = runOne.find((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")!;
    expect(mismatch).toBeTruthy();
    expect(mismatch.engineFlags.evidenceChanged).toBe(false);
    const firstSignature = mismatch.evidenceSignature;
    const firstValues = mismatch.evidenceSignature.entries.map((entry) => entry.verbatimValue).sort();
    expect(firstValues).toEqual(["22", "24"]);

    // Re-run the same scope with the PDF now stating 23.
    rightValue = "23";
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const runTwo = await harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
    const stillMismatch = runTwo.find((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")!;

    // SAME finding identity, changed evidence.
    expect(stillMismatch.findingId).toBe(mismatch.findingId);
    expect(stillMismatch.fingerprint).toBe(mismatch.fingerprint);
    expect(stillMismatch.engineFlags.evidenceChanged).toBe(true);
    expect(stillMismatch.engineFlags.reproduced).toBe(true);
    expect(stillMismatch.evidenceSignature).not.toEqual(firstSignature);
    expect(stillMismatch.evidenceSignature.entries.map((entry) => entry.verbatimValue).sort()).toEqual(["23", "24"]);
    // Two findings were never created for one logical discrepancy.
    expect(runTwo.filter((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")).toHaveLength(1);

    // The current projection is 24 vs 23, and the earlier 24 vs 22 is still
    // reconstructible from the durable observation rows.
    const history = await listFindingEvidenceHistory({ companyId: "company-1", findingId: mismatch.findingId, store: harness.store, locale: "en" });
    expect(history).toHaveLength(2);
    const literals = history.map((observation) => observation.entries.map((entry) => entry.valueLiteral).sort().join("/"));
    expect(literals).toContain("22/24");
    expect(literals).toContain("23/24");
    // The old observation still carries its own immutable claim ids and locators.
    const older = history.find((observation) => observation.entries.some((entry) => entry.valueLiteral === "22"))!;
    const newer = history.find((observation) => observation.entries.some((entry) => entry.valueLiteral === "23"))!;
    expect(older.comparisonRunId).not.toBe(newer.comparisonRunId);
    expect(older.entries.every((entry) => entry.claimId.startsWith("clm_"))).toBe(true);
    expect(older.entries.every((entry) => entry.claimMissing === false)).toBe(true);
    expect(older.entries.map((entry) => entry.locator).sort()).toEqual(["p. 3 row 4", "row 12 column D"]);
    // The superseded claim row was not rewritten to the new value.
    const superseded = older.entries.find((entry) => entry.valueLiteral === "22")!;
    const supersededClaim = await harness.store.findClaim({ companyId: "company-1", claimId: superseded.claimId });
    expect(supersededClaim).not.toBeNull();
    expect(supersededClaim!.assertion.valueNumber).toBe(22);
    expect(supersededClaim!.assertion.valueLiteral).toBe("22");
    // The current claim is a different immutable row.
    const current = newer.entries.find((entry) => entry.valueLiteral === "23")!;
    expect(current.claimId).not.toBe(superseded.claimId);
  });

  it("treats a different subject cluster as a different finding", async () => {
    const run = async (subject: string) => {
      const harness = await buildHarness({
        artifacts: [BOQ, SPEC],
        factory: ({ artifact, lineage }) => ({
          artifact,
          lineage,
          materializationId: `mat_${artifact.artifactId}`,
          materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
          readingChannels: [artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT"],
          coverage: "COMPLETE",
          claims: quantityClaims({
            artifact,
            lineage: lineage as never,
            left: artifact.kind === "XLSX",
            leftValue: "24",
            rightValue: "22",
            subject,
            leftLocator: "row 12 column D",
            rightLocator: "p. 3 row 4",
            leftChannel: "WORKBOOK_STRUCTURED",
            rightChannel: "PDF_NATIVE_TEXT",
            leftVersion: "2a-10.materializer.workbook.v1",
            rightVersion: "2a-10.materializer.pdf-native.v1",
          }),
          truncated: false,
          truncationReasons: [],
          warnings: [],
          limitations: [],
          unavailable: false,
        }),
      });
      await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
      const findings = await harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
      return findings.find((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")!;
    };

    const one = await run("AHU-01");
    const two = await run("AHU-02");
    expect(one).toBeTruthy();
    expect(two).toBeTruthy();
    expect(one.findingId).not.toBe(two.findingId);
    expect(one.fingerprint).not.toBe(two.fingerprint);
    expect(one.subjectClusterId).not.toBe(two.subjectClusterId);
  });

  it("excludes the conflicting values themselves from the fingerprint", () => {
    const base = {
      companyId: "company-1",
      comparisonScopeId: "scope-1",
      findingKind: "STATED_QUANTITY_MISMATCH" as const,
      predicate: "STATED_QUANTITY" as const,
      subjectClusterId: "scl-1",
      participantFamilyKeys: ["artifact-boq", "artifact-spec"],
      subjectKeys: ["AHU01"],
    };
    const fingerprint = buildFindingFingerprint(base);
    // Participant order is irrelevant...
    expect(buildFindingFingerprint({ ...base, participantFamilyKeys: ["artifact-spec", "artifact-boq"] })).toBe(fingerprint);
    // ...and so is subject-key order.
    expect(buildFindingFingerprint({ ...base, subjectKeys: ["AHU01"] })).toBe(fingerprint);
    // A different cluster or scope changes identity.
    expect(buildFindingFingerprint({ ...base, subjectClusterId: "scl-2" })).not.toBe(fingerprint);
    expect(buildFindingFingerprint({ ...base, comparisonScopeId: "scope-2" })).not.toBe(fingerprint);
    // A different kind or predicate changes identity.
    expect(buildFindingFingerprint({ ...base, findingKind: "UNIT_MISMATCH" })).not.toBe(fingerprint);
    expect(buildFindingFingerprint({ ...base, predicate: "RATING" })).not.toBe(fingerprint);
  });
});

describe("document-role independence", () => {
  /** The same two artifacts and the same evidence, with the scope roles swapped. */
  const build = (roles: Record<string, "BOQ" | "BIM_MODEL">, order: readonly ReturnType<typeof makeArtifact>[]) =>
    buildHarness({
      artifacts: order,
      roles,
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.ifc-model.v1",
        readingChannels: [artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "IFC_MODEL"],
        coverage: "COMPLETE",
        claims: quantityClaims({
          artifact,
          lineage: lineage as never,
          left: artifact.kind === "XLSX",
          leftValue: "24",
          rightValue: "22",
          subject: "AHU-01",
          leftLocator: "row 12 column D",
          rightLocator: "IFC:#30:IFCSPACE",
          leftChannel: "WORKBOOK_STRUCTURED",
          rightChannel: "IFC_MODEL",
          leftVersion: "2a-10.materializer.workbook.v1",
          rightVersion: "2a-10.materializer.ifc-model.v1",
        }),
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });

  it("preserves finding identity, kind, predicate, severity, and participants when the roles are swapped", async () => {
    const boqFirst = await build({ [BOQ.artifactId]: "BOQ", [MODEL.artifactId]: "BIM_MODEL" }, [BOQ, MODEL]);
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: boqFirst.scopeId, actorUserId: "user-1", dependencies: boqFirst.dependencies });
    const bimFirst = await build({ [MODEL.artifactId]: "BIM_MODEL", [BOQ.artifactId]: "BOQ" }, [MODEL, BOQ]);
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: bimFirst.scopeId, actorUserId: "user-1", dependencies: bimFirst.dependencies });

    const fromBoqFirst = (await boqFirst.store.listFindings({ companyId: "company-1", comparisonScopeId: boqFirst.scopeId, limit: 50 })).find((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")!;
    const fromBimFirst = (await bimFirst.store.listFindings({ companyId: "company-1", comparisonScopeId: bimFirst.scopeId, limit: 50 })).find((finding) => finding.findingKind === "STATED_QUANTITY_MISMATCH")!;
    expect(fromBoqFirst).toBeTruthy();
    expect(fromBimFirst).toBeTruthy();

    // The discrepancy is the SAME discrepancy. Over identical evidence in an
    // identically-keyed scope, the role swap changes nothing about identity.
    expect(fromBimFirst.findingId).toBe(fromBoqFirst.findingId);
    expect(fromBimFirst.fingerprint).toBe(fromBoqFirst.fingerprint);
    expect(fromBimFirst.subjectClusterId).toBe(fromBoqFirst.subjectClusterId);
    expect(fromBimFirst.findingKind).toBe(fromBoqFirst.findingKind);
    expect(fromBimFirst.predicate).toBe(fromBoqFirst.predicate);
    expect(fromBimFirst.severity).toBe(fromBoqFirst.severity);
    expect(fromBoqFirst.severity).toBe(severityForFindingKind("STATED_QUANTITY_MISMATCH"));
    expect(fromBimFirst.statementTemplateKey).toBe(fromBoqFirst.statementTemplateKey);
    expect([...fromBimFirst.participantFamilies].sort()).toEqual([...fromBoqFirst.participantFamilies].sort());
    expect([...fromBimFirst.subjectKeys].sort()).toEqual([...fromBoqFirst.subjectKeys].sort());

    // The participant set is the same set of claims.
    const participantsA = await boqFirst.store.listParticipants({ companyId: "company-1", findingId: fromBoqFirst.findingId });
    const participantsB = await bimFirst.store.listParticipants({ companyId: "company-1", findingId: fromBimFirst.findingId });
    expect(participantsB.length).toBe(participantsA.length);
    expect(participantsB.map((participant) => `${participant.sourceArtifactId}|${participant.verbatimValue}`).sort())
      .toEqual(participantsA.map((participant) => `${participant.sourceArtifactId}|${participant.verbatimValue}`).sort());
    // A participant ordinal is a stable display position, never a preference.
    expect(participantsA.map((participant) => participant.documentRole).sort()).toEqual(["BIM_MODEL", "BOQ"]);
    expect(participantsB.map((participant) => participant.documentRole).sort()).toEqual(["BIM_MODEL", "BOQ"]);

    // The evidence is the same evidence.
    const signatureA = fromBoqFirst.evidenceSignature.entries.map((entry) => `${entry.verbatimValue}|${entry.unit}|${entry.locator}`).sort();
    const signatureB = fromBimFirst.evidenceSignature.entries.map((entry) => `${entry.verbatimValue}|${entry.unit}|${entry.locator}`).sort();
    expect(signatureB).toEqual(signatureA);
  });

  it("derives severity from the finding kind alone, never from a document role", () => {
    const kinds = ["STATED_QUANTITY_MISMATCH", "UNIT_MISMATCH", "SUBJECT_SUGGESTION_ONLY", "EVIDENCE_COVERAGE_INCOMPLETE"] as const;
    for (const kind of kinds) {
      expect(severityForFindingKind(kind)).toBe(severityForFindingKind(kind));
      expect(["INFO", "REVIEW", "ATTENTION"]).toContain(severityForFindingKind(kind));
    }
    // A coverage limitation is never escalated to a document contradiction.
    expect(severityForFindingKind("EVIDENCE_COVERAGE_INCOMPLETE")).not.toBe(severityForFindingKind("STATED_QUANTITY_MISMATCH"));
  });
});
