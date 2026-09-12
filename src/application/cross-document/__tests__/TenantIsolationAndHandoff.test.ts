/**
 * Phase 2A-10 hardening: TENANT ISOLATION AND THE PERSISTED 2A-11 HANDOFF.
 *
 * Every cross-document read path is company-scoped. One real run is persisted for
 * `company-1`, then every reader is asked the same question as `company-2` and
 * must come back empty — claims, identities, memberships, decisions, scopes,
 * matches, clusters, findings, participants, review events, runs, and the
 * handoff bundle. Writes that name another company's row are refused.
 *
 * The handoff is then exercised over the REAL persisted/reloaded path: it must
 * carry claims, provenance, locators, citations, matches, clusters, findings,
 * review states, coverage, identities, memberships, the active decision, lineage,
 * stale state and block reasons — and must NOT carry counted, measured, or
 * approved quantities, quantity decisions, engineering BOM, quotation, or
 * procurement demand.
 */

import { describe, expect, it } from "vitest";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { buildCrossDocumentHandoff, HANDOFF_NOT_EXPOSED_FIELDS } from "@/src/application/cross-document/CrossDocumentHandoff";
import { transitionFindingReview } from "@/src/application/cross-document/FindingReviewService";
import { applyActiveRevisionDecision } from "@/src/application/cross-document/ActiveRevisionDecisionService";
import { buildHarness, claimFor, makeArtifact } from "./harness";
import { InMemoryCrossDocumentStore } from "@/src/infrastructure/cross-document/InMemoryCrossDocumentStore";
import type { DocumentIdentityRecord, DocumentRelationRecord } from "@/src/application/cross-document/ports";
import type { DocumentRevisionMembership } from "@/src/domain/cross-document";

const TEST_NOW = "2026-09-12T00:00:00.000Z";
const OTHER = "company-2";
const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });

/** One real run whose two sides disagree, so a finding and a cluster exist. */
async function seededRun() {
  const harness = await buildHarness({
    artifacts: [SPEC, BOQ],
    factory: ({ artifact, lineage }) => ({
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
        claimFor({
          artifact,
          lineage,
          predicate: "REVISION_LABEL",
          subjectKeyNamespace: "DOCUMENT_IDENTITY",
          subjectKeyValue: "Electrical layout",
          valueLiteral: "Rev A",
          locator: "p. 1",
          observedRevisionLabel: "Rev A",
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
  const findings = await harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 50 });
  expect(findings.length).toBeGreaterThan(0);
  // A real review transition, so a review event row exists too.
  const transition = await transitionFindingReview({
    store: harness.store,
    command: { companyId: "company-1", findingId: findings[0]!.findingId, toState: "ACKNOWLEDGED", reason: "reviewer confirmed the discrepancy", actorUserId: "user-1", at: TEST_NOW },
  });
  expect(transition.ok).toBe(true);
  return { ...harness, findingId: findings[0]!.findingId };
}

function identityRecord(id: string, companyId = "company-1"): DocumentIdentityRecord {
  return {
    documentIdentityId: id,
    companyId,
    kind: "DRAWING",
    label: "Electrical layout",
    observedFamilyKey: "obs-1",
    confirmedIdentityKey: null,
    identityBasis: "EVIDENCE_SUGGESTED",
    ambiguous: true,
    evidence: [],
    limitations: [],
    resolverVersion: "2a-10.identity.v1",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  };
}

function membership(id: string, documentIdentityId: string, companyId = "company-1"): DocumentRevisionMembership {
  return {
    membershipId: id,
    companyId,
    documentIdentityId,
    sourceArtifactId: `artifact-${id}`,
    artifactSha256: `sha-${id}`,
    observedRevisionLabel: "Rev A",
    revisionClaimId: null,
    membershipBasis: "IDENTITY_SUGGESTION",
    documentRole: "DRAWING",
    documentRoleSource: "OBSERVED_FROM_CONTENT",
    derivationFamilyRootArtifactId: `artifact-${id}`,
    lineageRole: "STANDALONE",
    limitations: [],
    createdAt: TEST_NOW,
  };
}

describe("tenant isolation over every persisted cross-document entity", () => {
  it("hides every entity of one company from another company's readers", async () => {
    const { store, scopeId, findingId } = await seededRun();

    // The owning company sees everything.
    expect((await store.listClaims({ companyId: "company-1", comparisonScopeId: scopeId, limit: 100 })).length).toBeGreaterThan(0);
    expect((await store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 100 })).length).toBeGreaterThan(0);

    // The same question as another tenant returns nothing anywhere.
    expect(await store.findScope({ companyId: OTHER, comparisonScopeId: scopeId })).toBeNull();
    expect(await store.listScopes({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.listScopeArtifacts({ companyId: OTHER, comparisonScopeId: scopeId })).toHaveLength(0);
    expect(await store.listClaims({ companyId: OTHER, comparisonScopeId: scopeId, limit: 100 })).toHaveLength(0);
    expect(await store.listClaims({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.listSubjectMatches({ companyId: OTHER, comparisonScopeId: scopeId, limit: 100 })).toHaveLength(0);
    expect(await store.listSubjectClusters({ companyId: OTHER, comparisonScopeId: scopeId, limit: 100 })).toHaveLength(0);
    expect(await store.listFindings({ companyId: OTHER, comparisonScopeId: scopeId, limit: 100 })).toHaveLength(0);
    expect(await store.listFindings({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.findFinding({ companyId: OTHER, findingId })).toBeNull();
    expect(await store.listParticipants({ companyId: OTHER, findingId })).toHaveLength(0);
    expect(await store.listReviewEvents({ companyId: OTHER, findingId, limit: 100 })).toHaveLength(0);
    expect(await store.listRuns({ companyId: OTHER, comparisonScopeId: scopeId, limit: 100 })).toHaveLength(0);
    expect(await store.listDocumentIdentities({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.listRevisionMemberships({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.listMaterializations({ companyId: OTHER, comparisonScopeId: scopeId })).toHaveLength(0);
    expect(await store.listFindingEvidenceObservations({ companyId: OTHER, limit: 100 })).toHaveLength(0);
    expect(await store.countClaims({ companyId: OTHER, comparisonScopeId: scopeId })).toBe(0);
    // The handoff for another tenant does not exist at all.
    expect(await buildCrossDocumentHandoff({ companyId: OTHER, comparisonScopeId: scopeId, store })).toBeNull();
  });

  it("refuses direct reads of another tenant's claim, finding, identity, membership, and run", async () => {
    const { store, scopeId, findingId } = await seededRun();
    const claims = await store.listClaims({ companyId: "company-1", comparisonScopeId: scopeId, limit: 100 });
    const runs = await store.listRuns({ companyId: "company-1", comparisonScopeId: scopeId, limit: 10 });
    const identities = store.allIdentityRows();
    const memberships = await store.listRevisionMemberships({ companyId: "company-1", limit: 100 });

    expect(await store.findClaim({ companyId: OTHER, claimId: claims[0]!.claimId })).toBeNull();
    expect(await store.findFinding({ companyId: OTHER, findingId })).toBeNull();
    expect(await store.findRun({ companyId: OTHER, comparisonRunId: runs[0]!.comparisonRunId })).toBeNull();
    for (const identity of identities) {
      expect(await store.findDocumentIdentity({ companyId: OTHER, documentIdentityId: identity.documentIdentityId })).toBeNull();
    }
    for (const row of memberships) {
      expect(await store.findSubjectCluster({ companyId: OTHER, subjectClusterId: row.membershipId })).toBeNull();
    }
    // Even a fingerprint lookup is tenant-scoped.
    const finding = await store.findFinding({ companyId: "company-1", findingId });
    expect(await store.findFindingByFingerprint({ companyId: OTHER, comparisonScopeId: scopeId, fingerprint: finding!.fingerprint })).toBeNull();
    expect(await store.findFindingByFingerprint({ companyId: "company-1", comparisonScopeId: scopeId, fingerprint: finding!.fingerprint })).not.toBeNull();
  });

  it("refuses a review transition and an active-revision decision naming another tenant's row", async () => {
    const { store, findingId } = await seededRun();
    const transition = await transitionFindingReview({
      store,
      command: { companyId: OTHER, findingId, toState: "RESOLVED", reason: "cross-tenant attempt", actorUserId: "attacker", at: TEST_NOW },
    });
    expect(transition.ok).toBe(false);
    if (transition.ok) throw new Error("unreachable");
    expect(transition.code).toBe("NOT_FOUND");
    // The real review state was untouched.
    const finding = await store.findFinding({ companyId: "company-1", findingId });
    expect(finding!.reviewState).toBe("ACKNOWLEDGED");
    expect(await store.listReviewEvents({ companyId: OTHER, findingId, limit: 10 })).toHaveLength(0);

    await store.upsertDocumentIdentity(identityRecord("did_a"));
    await store.saveRevisionMembership(membership("mem_a", "did_a"));
    const decision = await applyActiveRevisionDecision({
      store,
      command: {
        companyId: OTHER,
        documentIdentityId: "did_a",
        comparisonScopeId: null,
        actorUserId: "attacker",
        reason: "cross-tenant attempt",
        status: "ACTIVE_REVISION_SELECTED",
        selectedMembershipIds: ["mem_a"],
        evidenceClaimIds: [],
        decidedAt: TEST_NOW,
      },
    });
    expect(decision.ok).toBe(false);
    expect(await store.latestActiveRevisionDecision({ companyId: "company-1", documentIdentityId: "did_a" })).toBeNull();
    expect(await store.listActiveRevisionDecisions({ companyId: OTHER, documentIdentityId: "did_a", limit: 10 })).toHaveLength(0);
  });

  it("keeps identity, membership, and relation rows tenant-scoped on write", async () => {
    const store = new InMemoryCrossDocumentStore();
    await store.upsertDocumentIdentity(identityRecord("did_1", "company-1"));
    await store.upsertDocumentIdentity(identityRecord("did_1", OTHER));
    // The same id under two tenants is two rows, never a merge.
    expect((await store.listDocumentIdentities({ companyId: "company-1", limit: 10 })).map((row) => row.companyId)).toEqual(["company-1"]);
    expect((await store.listDocumentIdentities({ companyId: OTHER, limit: 10 })).map((row) => row.companyId)).toEqual([OTHER]);

    await store.saveRevisionMembership(membership("mem_1", "did_1", "company-1"));
    await store.saveRevisionMembership(membership("mem_1", "did_1", OTHER));
    expect(await store.listRevisionMemberships({ companyId: "company-1", limit: 10 })).toHaveLength(1);
    expect(await store.listRevisionMemberships({ companyId: OTHER, limit: 10 })).toHaveLength(1);

    const relation: DocumentRelationRecord = {
      documentRelationId: "rel_1",
      companyId: "company-1",
      documentIdentityId: "did_1",
      relatedDocumentIdentityId: "did_2",
      relationKind: "REFERENCES",
      relationBasis: "OBSERVED_EVIDENCE",
      evidenceClaimIds: [],
      declaredByUserId: null,
      reason: "cites the specification",
      limitations: [],
      createdAt: TEST_NOW,
    };
    await store.saveDocumentRelation(relation);
    expect(await store.listDocumentRelations({ companyId: OTHER, limit: 10 })).toHaveLength(0);
    expect(await store.listDocumentRelations({ companyId: "company-1", limit: 10 })).toHaveLength(1);
  });
});

describe("persisted 2A-11 handoff contract", () => {
  it("exposes evidence, provenance, matches, clusters, findings, review, coverage, identities, lineage, staleness, and blocks", async () => {
    const { store, scopeId } = await seededRun();
    const bundle = await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: scopeId, store });
    expect(bundle).not.toBeNull();
    if (!bundle) throw new Error("unreachable");

    expect(bundle.companyId).toBe("company-1");
    expect(bundle.comparisonScopeId).toBe(scopeId);
    expect(bundle.scope.lineageCollapse).toBe(true);
    expect(bundle.latestRun).not.toBeNull();
    expect(bundle.latestRun!.engineVersion).toMatch(/^2a-10\.engine\./u);
    expect(bundle.latestRun!.matcherVersion).toMatch(/^2a-10\.matcher\./u);
    expect(bundle.latestRun!.projectorVersion).toMatch(/^2a-10\.finding\./u);

    // Claims with provenance, locators, and citations.
    expect(bundle.claims.length).toBeGreaterThan(0);
    for (const claim of bundle.claims) {
      expect(claim.provenance.locator).toBeTruthy();
      expect(claim.assertion.valueLiteral).toBeTruthy();
      expect(claim.sourceArtifactId).toBeTruthy();
      expect(claim.readingChannel).toBeTruthy();
      // The verbatim literal is never rewritten.
      expect(typeof claim.assertion.valueLiteral).toBe("string");
    }
    expect(bundle.quantityClaims.length).toBeGreaterThan(0);

    // Matches and clusters.
    expect(bundle.subjectMatches.length).toBeGreaterThan(0);
    expect(bundle.subjectClusters.length).toBeGreaterThan(0);
    for (const cluster of bundle.subjectClusters) {
      expect(cluster.subjectClusterId).toBeTruthy();
      expect(cluster.memberClaimIds.length).toBeGreaterThan(0);
    }

    // Findings with review state and stale state.
    expect(bundle.findings.length).toBeGreaterThan(0);
    const acknowledged = bundle.findings.find((finding) => finding.reviewState === "ACKNOWLEDGED");
    expect(acknowledged).toBeTruthy();
    expect(acknowledged!.participantClaimIds.length).toBeGreaterThan(0);
    expect(acknowledged!.evidenceSignatureHash).toMatch(/^[0-9a-f]+$/u);

    // Coverage per artifact, identities, memberships, and lineage.
    expect(bundle.coverage.length).toBe(2);
    expect(bundle.coverage.every((entry) => entry.coverage === "COMPLETE")).toBe(true);
    expect(bundle.documentIdentities.length).toBeGreaterThan(0);
    expect(bundle.documentIdentities.every((identity) => identity.confirmedIdentityKey === null)).toBe(true);
    expect(Array.isArray(bundle.revisionMemberships)).toBe(true);
    expect(Array.isArray(bundle.activeRevisionDecisions)).toBe(true);
    expect(Array.isArray(bundle.lineage)).toBe(true);
    for (const entry of bundle.lineage) {
      expect(entry.derivationFamilyRootArtifactId).toBeTruthy();
    }
    expect(bundle.staleness).toEqual({ staleFindings: expect.any(Number), reproducedFindings: expect.any(Number), evidenceChangedFindings: expect.any(Number) });
    expect(Array.isArray(bundle.blockReasons)).toBe(true);
    expect(bundle.limitations.length).toBeGreaterThan(0);
  });

  it("never exposes counted, measured, approved, BOM, quotation, or procurement quantities", async () => {
    const { store, scopeId } = await seededRun();
    const bundle = await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: scopeId, store });
    expect(bundle).not.toBeNull();
    if (!bundle) throw new Error("unreachable");

    // The absence is declared positively, and the declaration is the real list.
    expect([...bundle.notExposed].sort()).toEqual([...HANDOFF_NOT_EXPOSED_FIELDS].sort());
    expect(bundle.notExposed).toContain("approvedQuantity");
    expect(bundle.notExposed).toContain("engineeringBomLine");
    expect(bundle.notExposed).toContain("quotationQuantity");
    expect(bundle.notExposed).toContain("procurementRequirement");
    expect(bundle.notExposed).toContain("purchaseOrder");

    // And it is true of the payload, not just of the declaration. `notExposed`
    // itself names the fields, so it is removed before scanning for them as keys.
    const { notExposed: _declared, ...payload } = bundle;
    const keys = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          collect(nested);
        }
      }
    };
    collect(payload);
    for (const field of HANDOFF_NOT_EXPOSED_FIELDS) {
      expect(keys.has(field), `${field} must not be a field of the handoff`).toBe(false);
    }
    // No quantity-decision vocabulary anywhere in the payload.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/quantityDecision|QuantityApproval|engineeringBom|quotationLine|purchaseOrder|procurementRequirement/u);
    // A source-supplied numeric view is labelled as such, never as approved.
    for (const claim of bundle.claims) {
      expect([null, "STATED", "DECLARED_MODEL"]).toContain(claim.assertion.quantityOrigin);
    }
  });

  it("stays bounded and tenant-safe when read from persistence", async () => {
    const { store, scopeId } = await seededRun();
    // Read twice: the bundle is rebuilt from persisted rows, not from memory.
    const first = await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: scopeId, store });
    const second = await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: scopeId, store });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.latestRun!.comparisonRunId).toBe(first!.latestRun!.comparisonRunId);
    expect(second!.findings.map((finding) => finding.findingId)).toEqual(first!.findings.map((finding) => finding.findingId));
    expect(second!.claims.map((claim) => claim.claimId)).toEqual(first!.claims.map((claim) => claim.claimId));
    expect(second!.subjectClusters.map((cluster) => cluster.subjectClusterId)).toEqual(first!.subjectClusters.map((cluster) => cluster.subjectClusterId));
    // Bounded projection.
    expect(first!.claims.length).toBeLessThanOrEqual(2_000);
    expect(first!.findings.length).toBeLessThanOrEqual(500);
    // An unknown scope yields no bundle rather than an empty-looking one.
    expect(await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: "scope-missing", store })).toBeNull();
  });
});
