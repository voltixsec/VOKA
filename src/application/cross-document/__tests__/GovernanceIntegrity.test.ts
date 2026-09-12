/**
 * Phase 2A-10 hardening: DOCUMENT IDENTITY AMBIGUITY, ACTIVE REVISION
 * RELATIONAL INTEGRITY, and SUBJECT CLUSTER DURABILITY.
 *
 * - `observedFamilyKey` is deliberately NON-UNIQUE: two documents may share a
 *   suggested family key and both persist. Only a governance-confirmed identity
 *   key enforces uniqueness, and a collision is refused rather than merged.
 * - Active-revision selections are relational: a selection must reference a real
 *   membership row of the same company. Decisions are append-only and versioned,
 *   incompatible actives block, and the engine never chooses one.
 * - A subject cluster is durable: the same company + scope + deterministic
 *   subject identity + matcher version yields the same cluster id across runs
 *   and reloads, so Phase 2A-11 never receives an ephemeral id.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { applyActiveRevisionDecision, listRevisionCandidates } from "@/src/application/cross-document/ActiveRevisionDecisionService";
import { buildHarness, claimFor, makeArtifact, type MaterializationFactory } from "./harness";
import { InMemoryCrossDocumentStore, ConfirmedIdentityCollisionError } from "@/src/infrastructure/cross-document/InMemoryCrossDocumentStore";
import { SUBJECT_MATCHER_VERSION, buildObservedFamilyKey, buildSubjectClusterId, incompatibleActiveMemberships } from "@/src/domain/cross-document";
import type { DocumentIdentityRecord, DocumentRelationRecord } from "@/src/application/cross-document/ports";
import type { DocumentRevisionMembership } from "@/src/domain/cross-document";

const TEST_NOW = "2026-09-12T00:00:00.000Z";
const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });

function identityRecord(input: { id: string; observedFamilyKey: string; confirmedIdentityKey?: string | null; companyId?: string }): DocumentIdentityRecord {
  return {
    documentIdentityId: input.id,
    companyId: input.companyId ?? "company-1",
    kind: "DRAWING",
    label: "Electrical layout",
    observedFamilyKey: input.observedFamilyKey,
    confirmedIdentityKey: input.confirmedIdentityKey ?? null,
    identityBasis: "EVIDENCE_SUGGESTED",
    ambiguous: true,
    evidence: [],
    limitations: [],
    resolverVersion: "2a-10.identity.v1",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  };
}

function membership(input: { membershipId: string; documentIdentityId: string; sourceArtifactId: string; label: string | null; companyId?: string }): DocumentRevisionMembership {
  const companyId = input.companyId ?? "company-1";
  return {
    membershipId: input.membershipId,
    companyId,
    documentIdentityId: input.documentIdentityId,
    sourceArtifactId: input.sourceArtifactId,
    artifactSha256: `sha-${input.sourceArtifactId}`,
    observedRevisionLabel: input.label,
    revisionClaimId: null,
    membershipBasis: "IDENTITY_SUGGESTION",
    documentRole: "DRAWING",
    documentRoleSource: "OBSERVED_FROM_CONTENT",
    derivationFamilyRootArtifactId: input.sourceArtifactId,
    lineageRole: "STANDALONE",
    limitations: [],
    createdAt: TEST_NOW,
  };
}

describe("document identity ambiguity", () => {
  it("persists two documents that share an observed family key without merging them", async () => {
    const store = new InMemoryCrossDocumentStore();
    const sharedKey = buildObservedFamilyKey({
      kind: "DRAWING",
      evidence: [{ kind: "DOCUMENT_TITLE", value: "Electrical layout", sourceArtifactId: "artifact-a", claimId: null, locator: "p. 1", reliability: "MEDIUM", limitations: [] }],
    });

    await store.upsertDocumentIdentity(identityRecord({ id: "did_a", observedFamilyKey: sharedKey }));
    await store.upsertDocumentIdentity(identityRecord({ id: "did_b", observedFamilyKey: sharedKey }));

    // Both persist: the shared key is not a governance decision.
    const both = await store.listDocumentIdentities({ companyId: "company-1", observedFamilyKey: sharedKey, limit: 50 });
    expect(both.map((identity) => identity.documentIdentityId).sort()).toEqual(["did_a", "did_b"]);
    expect(both.every((identity) => identity.ambiguous)).toBe(true);
    expect(both.every((identity) => identity.confirmedIdentityKey === null)).toBe(true);
    // No P2002-style uniqueness was applied to the observed key.
    const all = await store.listDocumentIdentities({ companyId: "company-1", limit: 50 });
    expect(all).toHaveLength(2);
  });

  it("enforces uniqueness only on a governance-confirmed identity key", async () => {
    const store = new InMemoryCrossDocumentStore();
    const confirmed = "confirmed-key-1";
    await store.upsertDocumentIdentity(identityRecord({ id: "did_a", observedFamilyKey: "obs-1", confirmedIdentityKey: confirmed }));
    await expect(
      store.upsertDocumentIdentity(identityRecord({ id: "did_b", observedFamilyKey: "obs-1", confirmedIdentityKey: confirmed })),
    ).rejects.toBeInstanceOf(ConfirmedIdentityCollisionError);
    // Re-confirming the SAME identity is an update, not a collision.
    const updated = await store.upsertDocumentIdentity(identityRecord({ id: "did_a", observedFamilyKey: "obs-1", confirmedIdentityKey: confirmed }));
    expect(updated.documentIdentityId).toBe("did_a");
    expect(await store.listDocumentIdentities({ companyId: "company-1", limit: 50 })).toHaveLength(1);
  });

  it("never lets the engine confirm an identity: a real run leaves every key unconfirmed", async () => {
    const harness = await buildHarness({
      artifacts: [SPEC, BOQ],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: "2a-10.materializer.pdf-native.v1",
        readingChannels: ["PDF_NATIVE_TEXT"],
        coverage: "COMPLETE",
        claims: [
          claimFor({
            artifact,
            lineage,
            predicate: "DOCUMENT_IDENTITY",
            subjectKeyNamespace: "DOCUMENT_IDENTITY",
            subjectKeyValue: "Electrical layout",
            valueLiteral: "Electrical layout",
            locator: "p. 1",
          }),
        ],
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const identities = harness.store.allIdentityRows();
    expect(identities.length).toBeGreaterThan(0);
    for (const identity of identities) {
      expect(identity.confirmedIdentityKey).toBeNull();
      expect(identity.identityBasis).not.toBe("GOVERNANCE_CONFIRMED");
      expect(identity.limitations.some((limitation) => limitation.includes("governance"))).toBe(true);
    }
  });
});

describe("active revision relational integrity", () => {
  async function seeded() {
    const store = new InMemoryCrossDocumentStore();
    await store.upsertDocumentIdentity(identityRecord({ id: "did_a", observedFamilyKey: "obs-1" }));
    await store.saveRevisionMembership(membership({ membershipId: "mem_rev_a", documentIdentityId: "did_a", sourceArtifactId: "artifact-rev-a", label: "Rev A" }));
    await store.saveRevisionMembership(membership({ membershipId: "mem_rev_b", documentIdentityId: "did_a", sourceArtifactId: "artifact-rev-b", label: "Rev B" }));
    return store;
  }

  it("refuses a selection that does not reference a real membership row", async () => {
    const store = await seeded();
    const outcome = await applyActiveRevisionDecision({
      store,
      command: {
        companyId: "company-1",
        documentIdentityId: "did_a",
        comparisonScopeId: null,
        actorUserId: "user-1",
        reason: "Rev A is the issued revision",
        status: "ACTIVE_REVISION_SELECTED",
        selectedMembershipIds: ["mem_does_not_exist"],
        evidenceClaimIds: [],
        decidedAt: TEST_NOW,
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.code).toBe("TENANT_MISMATCH");
    expect(await store.latestActiveRevisionDecision({ companyId: "company-1", documentIdentityId: "did_a" })).toBeNull();
  });

  it("refuses a membership that belongs to another company or another identity", async () => {
    const store = await seeded();
    await store.saveRevisionMembership(membership({ membershipId: "mem_other_company", documentIdentityId: "did_a", sourceArtifactId: "artifact-x", label: "Rev C", companyId: "company-2" }));
    await store.saveRevisionMembership(membership({ membershipId: "mem_other_identity", documentIdentityId: "did_other", sourceArtifactId: "artifact-y", label: "Rev D" }));

    for (const membershipId of ["mem_other_company", "mem_other_identity"]) {
      const outcome = await applyActiveRevisionDecision({
        store,
        command: {
          companyId: "company-1",
          documentIdentityId: "did_a",
          comparisonScopeId: null,
          actorUserId: "user-1",
          reason: "attempted cross-boundary selection",
          status: "ACTIVE_REVISION_SELECTED",
          selectedMembershipIds: [membershipId],
          evidenceClaimIds: [],
          decidedAt: TEST_NOW,
        },
      });
      expect(outcome.ok).toBe(false);
    }
    expect(await store.latestActiveRevisionDecision({ companyId: "company-1", documentIdentityId: "did_a" })).toBeNull();
  });

  it("appends a new decision version and never rewrites the previous one", async () => {
    const store = await seeded();
    const first = await applyActiveRevisionDecision({
      store,
      command: {
        companyId: "company-1",
        documentIdentityId: "did_a",
        comparisonScopeId: null,
        actorUserId: "user-1",
        reason: "Rev A is the issued revision",
        status: "ACTIVE_REVISION_SELECTED",
        selectedMembershipIds: ["mem_rev_a"],
        evidenceClaimIds: [],
        decidedAt: TEST_NOW,
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.decision.decisionVersion).toBe(1);
    expect(first.decision.supersedesDecisionId).toBeNull();

    const second = await applyActiveRevisionDecision({
      store,
      command: {
        companyId: "company-1",
        documentIdentityId: "did_a",
        comparisonScopeId: null,
        actorUserId: "user-2",
        reason: "Rev B supersedes Rev A",
        status: "ACTIVE_REVISION_SELECTED",
        selectedMembershipIds: ["mem_rev_b"],
        evidenceClaimIds: [],
        decidedAt: "2026-09-13T00:00:00.000Z",
      },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.decision.decisionVersion).toBe(2);
    expect(second.decision.supersedesDecisionId).toBe(first.decision.decisionId);

    // Both versions are still readable, and v1 was not rewritten.
    const history = await store.listActiveRevisionDecisions({ companyId: "company-1", documentIdentityId: "did_a", limit: 10 });
    expect(history.map((decision) => decision.decisionVersion)).toEqual([1, 2]);
    expect(history[0]!.selectedMembershipIds).toEqual(["mem_rev_a"]);
    expect(history[0]!.actorUserId).toBe("user-1");
    expect(history[0]!.reason).toBe("Rev A is the issued revision");
    expect(history[1]!.selectedMembershipIds).toEqual(["mem_rev_b"]);
    const latest = await store.latestActiveRevisionDecision({ companyId: "company-1", documentIdentityId: "did_a" });
    expect(latest!.decisionVersion).toBe(2);

    // A decision version can never be replaced in place.
    await expect(store.appendActiveRevisionDecision({ ...second.decision })).rejects.toThrow();
  });

  it("blocks incompatible simultaneous actives and reports the reason", async () => {
    const store = await seeded();
    const incompatible = incompatibleActiveMemberships([
      { membershipId: "mem_rev_a", observedRevisionLabel: "Rev A" },
      { membershipId: "mem_rev_b", observedRevisionLabel: "Rev B" },
    ]);
    expect(incompatible.incompatible).toBe(true);
    expect(incompatible.labels.sort()).toEqual(["Rev A", "Rev B"]);

    const outcome = await applyActiveRevisionDecision({
      store,
      command: {
        companyId: "company-1",
        documentIdentityId: "did_a",
        comparisonScopeId: null,
        actorUserId: "user-1",
        reason: "both revisions are in circulation",
        status: "BLOCKED_INCOMPATIBLE_ACTIVES",
        selectedMembershipIds: [],
        evidenceClaimIds: [],
        blockedReason: "two different observed revision labels are both treated as active",
        decidedAt: TEST_NOW,
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.decision.status).toBe("BLOCKED_INCOMPATIBLE_ACTIVES");
    expect(outcome.decision.blockedReason).toContain("two different observed revision labels");

    // Candidates are offered, never chosen: the notes carry no recommendation.
    const { candidates, latestDecision } = await listRevisionCandidates({ companyId: "company-1", documentIdentityId: "did_a", store });
    expect(candidates.map((candidate) => candidate.membershipId).sort()).toEqual(["mem_rev_a", "mem_rev_b"]);
    for (const candidate of candidates) {
      expect(candidate.notes.some((note) => /should|recommended|preferred|correct/iu.test(note))).toBe(false);
    }
    expect(latestDecision!.status).toBe("BLOCKED_INCOMPATIBLE_ACTIVES");
  });

  it("records no active-revision decision by itself during a real comparison run", async () => {
    const harness = await buildHarness({
      artifacts: [SPEC, BOQ],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: "2a-10.materializer.pdf-native.v1",
        readingChannels: ["PDF_NATIVE_TEXT"],
        coverage: "COMPLETE",
        claims: [
          claimFor({ artifact, lineage, predicate: "REVISION_LABEL", subjectKeyNamespace: "DOCUMENT_IDENTITY", subjectKeyValue: "Electrical layout", valueLiteral: "Rev A", locator: "p. 1", observedRevisionLabel: "Rev A" }),
        ],
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    for (const identity of harness.store.allIdentityRows()) {
      // The engine identified candidates; it never activated one.
      expect(await harness.store.latestActiveRevisionDecision({ companyId: "company-1", documentIdentityId: identity.documentIdentityId })).toBeNull();
    }
  });
});

describe("subject cluster durability", () => {
  const factory: MaterializationFactory = ({ artifact, lineage }) => ({
    artifact,
    lineage,
    materializationId: `mat_${artifact.artifactId}`,
    materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
    readingChannels: [artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT"],
    coverage: "COMPLETE",
    claims: [
      claimFor({
        artifact,
        lineage,
        predicate: "STATED_QUANTITY",
        subjectKeyNamespace: "EQUIPMENT_TAG",
        subjectKeyValue: "AHU-01",
        subjectMatchKey: "AHU01",
        valueLiteral: artifact.kind === "XLSX" ? "24" : "22",
        sourceSuppliedNumber: artifact.kind === "XLSX" ? 24 : 22,
        unit: "nos",
        quantityOrigin: artifact.kind === "XLSX" ? "STATED" : "DECLARED_MODEL",
        locator: artifact.kind === "XLSX" ? "row 12 column D" : "p. 3 row 4",
        readingChannel: artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT",
        materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
      }),
    ],
    truncated: false,
    truncationReasons: [],
    warnings: [],
    limitations: [],
    unavailable: false,
  });

  it("keeps a stable cluster identity and memberships across re-run and reload", async () => {
    const harness = await buildHarness({ artifacts: [SPEC, BOQ], factory });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const firstClusters = await harness.store.listSubjectClusters({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
    expect(firstClusters.length).toBeGreaterThan(0);

    // Re-run over the same evidence.
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    // Reload from persistence.
    const reloaded = await harness.store.listSubjectClusters({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });

    expect(reloaded.map((cluster) => cluster.subjectClusterId)).toEqual(firstClusters.map((cluster) => cluster.subjectClusterId));
    for (const cluster of reloaded) {
      expect(cluster.memberClaimIds.length).toBeGreaterThan(0);
      expect(cluster.matcherVersion).toBe(SUBJECT_MATCHER_VERSION);
      expect(cluster.subjectKeys).toContain("AHU-01");
    }
    // The id is deterministic over (company, scope, namespace, match key), so it
    // is a durable handoff identity rather than a runtime-only value.
    const expected = buildSubjectClusterId({ companyId: "company-1", comparisonScopeId: harness.scopeId, namespace: "EQUIPMENT_TAG", matchKey: "AHU01" });
    expect(reloaded.map((cluster) => cluster.subjectClusterId)).toContain(expected);
    // A different scope yields a different durable identity, not a collision.
    expect(buildSubjectClusterId({ companyId: "company-1", comparisonScopeId: "scope-other", namespace: "EQUIPMENT_TAG", matchKey: "AHU01" })).not.toBe(expected);
  });

  it("preserves ambiguity and the matcher version across reload", async () => {
    const harness = await buildHarness({
      artifacts: [SPEC, BOQ],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: "2a-10.materializer.pdf-native.v1",
        readingChannels: ["PDF_NATIVE_TEXT"],
        coverage: "COMPLETE",
        // One weak text label on each side, plus a conflicting strong tag: the
        // match is ambiguous and the ambiguity must survive persistence.
        claims: [
          claimFor({ artifact, lineage, predicate: "TYPE_NAME", subjectKeyNamespace: "TEXT_LABEL", subjectKeyValue: "Air handling unit", valueLiteral: artifact.kind === "XLSX" ? "Air handling unit" : "Air handling unit", locator: "p. 1" }),
          claimFor({ artifact, lineage, predicate: "EQUIPMENT_TAG", subjectKeyNamespace: "EQUIPMENT_TAG", subjectKeyValue: artifact.kind === "XLSX" ? "AHU-01" : "AHU-99", valueLiteral: artifact.kind === "XLSX" ? "AHU-01" : "AHU-99", locator: "p. 2" }),
        ],
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });
    const clusters = await harness.store.listSubjectClusters({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
    expect(clusters.length).toBeGreaterThan(0);
    // Every persisted cluster states its matcher version, so a matcher change is
    // explicit and auditable rather than silently reinterpreting old clusters.
    expect(clusters.every((cluster) => cluster.matcherVersion === SUBJECT_MATCHER_VERSION)).toBe(true);
    const ambiguous = clusters.filter((cluster) => cluster.ambiguous);
    for (const cluster of ambiguous) {
      const reloaded = await harness.store.findSubjectCluster({ companyId: "company-1", subjectClusterId: cluster.subjectClusterId });
      expect(reloaded!.ambiguous).toBe(true);
      expect(reloaded!.blockers.length).toBeGreaterThan(0);
      expect(reloaded!.memberClaimIds).toEqual(cluster.memberClaimIds);
    }
  });
});

describe("relational governance edges", () => {
  it("keeps document relations relational and refuses a self-relation", async () => {
    const store = new InMemoryCrossDocumentStore();
    await store.upsertDocumentIdentity(identityRecord({ id: "did_a", observedFamilyKey: "obs-1" }));
    await store.upsertDocumentIdentity(identityRecord({ id: "did_b", observedFamilyKey: "obs-2" }));
    const relation: DocumentRelationRecord = {
      documentRelationId: "rel_1",
      companyId: "company-1",
      documentIdentityId: "did_a",
      relatedDocumentIdentityId: "did_b",
      relationKind: "REFERENCES",
      relationBasis: "OBSERVED_EVIDENCE",
      evidenceClaimIds: ["clm_a", "clm_b"],
      declaredByUserId: null,
      reason: "the drawing cites the specification section",
      limitations: [],
      createdAt: TEST_NOW,
    };
    await store.saveDocumentRelation(relation);
    expect(await store.listDocumentRelations({ companyId: "company-1", documentIdentityId: "did_a", limit: 10 })).toHaveLength(1);
    await expect(store.saveDocumentRelation({ ...relation, documentRelationId: "rel_2", relatedDocumentIdentityId: "did_a" })).rejects.toThrow();
    // Another tenant's relation is invisible.
    expect(await store.listDocumentRelations({ companyId: "company-2", documentIdentityId: "did_a", limit: 10 })).toHaveLength(0);
  });
});
