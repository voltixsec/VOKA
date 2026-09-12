/**
 * Phase 2A-10: governed DOCUMENT IDENTITY, REVISION MEMBERSHIP, DOCUMENT
 * RELATIONS, and ACTIVE REVISION DECISION commands.
 *
 * Three rules drive every function here:
 *
 * 1. evidence SUGGESTS; a human CONFIRMS. Nothing an artifact prints is
 *    promoted into a confirmed database identity automatically;
 * 2. ambiguity is preserved. Two uncertain candidates never collapse into one
 *    row, and a shared evidence key never forces a merge;
 * 3. the engine may find candidates for an active revision, but it may NOT
 *    choose one. Only an audited human decision activates a revision, and two
 *    incompatible actives block comparison readiness for that identity.
 */

import { createHash } from "node:crypto";
import {
  ACTIVE_REVISION_GOVERNANCE_VERSION,
  DOCUMENT_IDENTITY_RESOLVER_VERSION,
  buildConfirmedIdentityKey,
  buildObservedFamilyKey,
  buildRevisionMembershipId,
  documentReadiness,
  identityEvidenceConflicts,
  incompatibleActiveMemberships,
  suggestDocumentIdentity,
  validateActiveRevisionDecision,
  type ActiveRevisionDecisionRecord,
  type ActiveRevisionDecisionStatus,
  type ClaimReliability,
  type ComparisonBlockReason,
  type DocumentIdentityEvidence,
  type DocumentReadinessState,
  type DocumentRelationBasis,
  type DocumentRelationKind,
  type DocumentRevisionMembership,
  type DocumentRole,
  type DocumentRoleSource,
  type NormalizedEvidenceClaim,
  type SuggestedDocumentIdentity,
} from "@/src/domain/cross-document";
import { CROSS_DOCUMENT_BOUNDS } from "@/src/domain/cross-document";
import type { MaterializedArtifact } from "./ports";

export type DocumentIdentityResolution = {
  /** Identity candidates per artifact. More than one means the artifact is ambiguous. */
  candidatesByArtifact: Map<string, DocumentIdentityCandidate[]>;
  limitations: string[];
};

export type DocumentIdentityCandidate = {
  documentIdentityId: string;
  observedFamilyKey: string;
  kind: SuggestedDocumentIdentity["kind"];
  label: string;
  evidence: DocumentIdentityEvidence[];
  reliability: ClaimReliability;
  ambiguous: boolean;
};

/** Evidence kinds that establish identity; revision labels are deliberately excluded. */
const IDENTITY_EVIDENCE_PREDICATES: Record<string, DocumentIdentityEvidence["kind"]> = {
  DOCUMENT_IDENTITY: "DOCUMENT_TITLE",
  SECTION_OR_DIVISION: "SECTION_OR_DIVISION",
  REVISION_LABEL: "DOCUMENT_TITLE",
};

/**
 * Extracts document-identity evidence from a materialized artifact's claims.
 *
 * Only explicit identity claims participate. A revision label is context and is
 * never allowed to fork the identity.
 */
export function documentIdentityEvidence(input: {
  artifactId: string;
  claims: readonly NormalizedEvidenceClaim[];
}): DocumentIdentityEvidence[] {
  const evidence: DocumentIdentityEvidence[] = [];
  for (const claim of input.claims) {
    if (claim.assertion.predicate === "REVISION_LABEL") continue;
    const kind = claim.subject.subjectKeyNamespace === "SECTION_DIVISION"
      ? "SECTION_OR_DIVISION"
      : claim.subject.subjectKeyNamespace === "DRAWING_SHEET"
        ? "DRAWING_OR_SHEET_NUMBER"
        : claim.assertion.predicate === "DOCUMENT_IDENTITY"
          ? (claim.subject.subjectKeyValue.toUpperCase().includes("PROJECT") ? "PROJECT_TITLE" : "DOCUMENT_TITLE")
          : null;
    if (!kind) continue;
    evidence.push({
      kind,
      value: claim.assertion.valueLiteral,
      sourceArtifactId: input.artifactId,
      claimId: claim.claimId,
      locator: claim.provenance.locator,
      reliability: claim.provenance.reliability,
      limitations: claim.provenance.limitations,
    });
  }
  return evidence.slice(0, CROSS_DOCUMENT_BOUNDS.maxIdentityEvidence);
}

/** Deterministic identity id: the observed key plus the identity-bearing evidence. */
function identityIdFor(input: { companyId: string; observedFamilyKey: string; evidence: readonly DocumentIdentityEvidence[] }): string {
  const digest = input.evidence
    .filter((item) => item.kind !== "DISCIPLINE")
    .map((item) => `${item.kind}:${item.value}`)
    .sort()
    .join("|");
  return `did_${createHash("sha256")
    .update(["voka:2a-10:identity-id:v1", input.companyId, input.observedFamilyKey, digest].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

/**
 * Resolves identity candidates for every materialized artifact.
 *
 * A conflicting identity produces SEPARATE candidates, each marked ambiguous:
 * the store then keeps two rows with the same observed family key, which is why
 * that key is indexed NON-UNIQUE.
 */
export function resolveDocumentIdentities(input: {
  companyId: string;
  materials: readonly MaterializedArtifact[];
}): DocumentIdentityResolution {
  const candidatesByArtifact = new Map<string, DocumentIdentityCandidate[]>();
  const limitations: string[] = [];
  for (const material of input.materials) {
    const evidence = documentIdentityEvidence({ artifactId: material.artifact.artifactId, claims: material.claims });
    const conflicting = identityEvidenceConflicts(evidence);
    const suggestion = suggestDocumentIdentity({ artifactKind: material.artifact.kind, evidence });
    const candidate: DocumentIdentityCandidate = {
      documentIdentityId: identityIdFor({ companyId: input.companyId, observedFamilyKey: suggestion.observedFamilyKey, evidence }),
      observedFamilyKey: suggestion.observedFamilyKey,
      kind: suggestion.kind,
      label: suggestion.label,
      evidence,
      reliability: suggestion.reliability,
      ambiguous: false,
    };
    const candidates: DocumentIdentityCandidate[] = [candidate];
    if (conflicting) {
      // Two identity candidates: neither is chosen, both are preserved.
      const numbers = evidence.filter((item) => item.kind === "DRAWING_OR_SHEET_NUMBER");
      for (const [index, item] of numbers.entries()) {
        const variantKey = buildObservedFamilyKey({ kind: suggestion.kind, evidence: [item], variant: index });
        candidates.push({
          documentIdentityId: identityIdFor({ companyId: input.companyId, observedFamilyKey: variantKey, evidence: [item] }),
          observedFamilyKey: variantKey,
          kind: suggestion.kind,
          label: item.value,
          evidence: [item],
          reliability: item.reliability,
          ambiguous: true,
        });
      }
      candidates[0]!.ambiguous = true;
      limitations.push("this artifact presents conflicting identity evidence, so its identity candidates stay separate and its comparison readiness is blocked");
    }
    candidatesByArtifact.set(material.artifact.artifactId, candidates);
  }
  return { candidatesByArtifact, limitations: [...new Set(limitations)] };
}

export type RevisionPolicyOutcome = {
  /** Artifacts whose evidence participates in the comparison. */
  includedArtifactIds: Set<string>;
  excludedArtifactIds: Map<string, string>;
  blockReasons: ComparisonBlockReason[];
  limitations: string[];
  blockedDocumentIdentities: Array<{ documentIdentityId: string; blockReasons: string[] }>;
};

/**
 * Applies the scope's revision policy.
 *
 * `ACTIVE_ONLY` is the default and never compares a superseded revision as
 * though it were current. A document identity represented by several different
 * observed revisions with no governing decision BLOCKS readiness instead of
 * silently comparing both as current. Historical comparison stays available
 * through `INCLUDE_SUPERSEDED`.
 */
export function applyRevisionPolicy(input: {
  revisionPolicy: string;
  memberships: readonly DocumentRevisionMembership[];
  decisionsByDocumentIdentity: ReadonlyMap<string, ActiveRevisionDecisionRecord | null>;
  ambiguousArtifactIds: ReadonlySet<string>;
  unavailableArtifactIds: ReadonlySet<string>;
}): RevisionPolicyOutcome {
  const includedArtifactIds = new Set<string>();
  const excludedArtifactIds = new Map<string, string>();
  const blockReasons = new Set<ComparisonBlockReason>();
  const limitations: string[] = [];
  const blocked: Array<{ documentIdentityId: string; blockReasons: string[] }> = [];

  const byIdentity = new Map<string, DocumentRevisionMembership[]>();
  for (const membership of input.memberships) {
    const list = byIdentity.get(membership.documentIdentityId) ?? [];
    list.push(membership);
    byIdentity.set(membership.documentIdentityId, list);
  }

  for (const [documentIdentityId, members] of byIdentity.entries()) {
    const decision = input.decisionsByDocumentIdentity.get(documentIdentityId) ?? null;
    const labels = incompatibleActiveMemberships(members.map((member) => ({ membershipId: member.membershipId, observedRevisionLabel: member.observedRevisionLabel })));
    const ambiguousMember = members.some((member) => input.ambiguousArtifactIds.has(member.sourceArtifactId));

    if (ambiguousMember) {
      blockReasons.add("AMBIGUOUS_DOCUMENT_IDENTITY");
      for (const member of members) excludedArtifactIds.set(member.sourceArtifactId, "the artifact's document identity is ambiguous, so its evidence was not compared");
      blocked.push({ documentIdentityId, blockReasons: ["AMBIGUOUS_DOCUMENT_IDENTITY"] });
      continue;
    }

    if (decision?.status === "BLOCKED_INCOMPATIBLE_ACTIVES") {
      blockReasons.add("INCOMPATIBLE_ACTIVE_REVISIONS");
      for (const member of members) excludedArtifactIds.set(member.sourceArtifactId, "incompatible active revisions block comparison for this document identity");
      blocked.push({ documentIdentityId, blockReasons: ["INCOMPATIBLE_ACTIVE_REVISIONS", decision.blockedReason ?? ""].filter(Boolean) });
      limitations.push("a document identity has incompatible active revisions; the comparison is blocked until a human records a decision");
      continue;
    }

    if (input.revisionPolicy === "INCLUDE_SUPERSEDED") {
      for (const member of members) includedArtifactIds.add(member.sourceArtifactId);
      limitations.push("the scope explicitly includes superseded revisions; the comparison is historical and must not be read as a current-state comparison");
      continue;
    }

    if (labels.incompatible && decision?.status !== "ACTIVE_REVISION_SELECTED") {
      blockReasons.add("NO_ACTIVE_REVISION_DECISION");
      for (const member of members) excludedArtifactIds.set(member.sourceArtifactId, "the revisions in scope have no governing active-revision decision");
      blocked.push({ documentIdentityId, blockReasons: ["NO_ACTIVE_REVISION_DECISION"] });
      continue;
    }

    if (decision?.status === "ACTIVE_REVISION_SELECTED") {
      const selected = new Set(decision.selectedMembershipIds);
      for (const member of members) {
        if (selected.has(member.membershipId)) includedArtifactIds.add(member.sourceArtifactId);
        else {
          excludedArtifactIds.set(member.sourceArtifactId, "the revision is outside the governed active-revision selection");
          blockReasons.add("NO_ACTIVE_REVISION_DECISION");
        }
      }
      continue;
    }

    // A single observed revision: nothing to disambiguate, and the limitation
    // says plainly that no decision was recorded rather than implying one.
    for (const member of members) includedArtifactIds.add(member.sourceArtifactId);
    if (members.length === 1) {
      limitations.push("one document identity is represented by a single revision in this scope; no active-revision decision was recorded and none was inferred");
    }
  }

  blockReasons.delete("NO_ACTIVE_REVISION_DECISION");
  return { includedArtifactIds, excludedArtifactIds, blockReasons: [...blockReasons].sort(), limitations: [...new Set(limitations)], blockedDocumentIdentities: blocked };
}

export type DocumentIdentityPlan = {
  identities: Array<{
    documentIdentityId: string;
    observedFamilyKey: string;
    kind: SuggestedDocumentIdentity["kind"];
    label: string;
    ambiguous: boolean;
    evidence: DocumentIdentityEvidence[];
    reliability: ClaimReliability;
  }>;
};

/** Builds the identity rows a run should persist (evidence-suggested, never confirmed). */
export function planDocumentIdentities(input: { resolution: DocumentIdentityResolution }): DocumentIdentityPlan {
  const identities: DocumentIdentityPlan["identities"] = [];
  const seen = new Set<string>();
  for (const candidates of input.resolution.candidatesByArtifact.values()) {
    for (const candidate of candidates) {
      if (seen.has(candidate.documentIdentityId)) continue;
      seen.add(candidate.documentIdentityId);
      identities.push({
        documentIdentityId: candidate.documentIdentityId,
        observedFamilyKey: candidate.observedFamilyKey,
        kind: candidate.kind,
        label: candidate.label,
        ambiguous: candidate.ambiguous,
        evidence: candidate.evidence,
        reliability: candidate.reliability,
      });
    }
  }
  return { identities: identities.sort((left, right) => (left.documentIdentityId < right.documentIdentityId ? -1 : 1)) };
}

/**
 * Builds revision memberships for one artifact and its resolved identity.
 *
 * An ambiguous artifact gets NO membership: choosing one of two candidates
 * would be exactly the forced merge the phase forbids.
 */
export function buildRevisionMemberships(input: {
  companyId: string;
  createdAt: string;
  material: MaterializedArtifact;
  candidates: readonly DocumentIdentityCandidate[];
  documentRole: DocumentRole;
  documentRoleSource: DocumentRoleSource;
}): DocumentRevisionMembership[] {
  if (input.candidates.length !== 1) return [];
  const candidate = input.candidates[0]!;
  const revisionClaim = input.material.claims.find((claim) => claim.assertion.predicate === "REVISION_LABEL") ?? null;
  const observedRevisionLabel = revisionClaim?.assertion.valueLiteral ?? null;
  return [
    {
      membershipId: buildRevisionMembershipId({
        companyId: input.companyId,
        documentIdentityId: candidate.documentIdentityId,
        sourceArtifactId: input.material.artifact.artifactId,
        observedRevisionLabel,
      }),
      companyId: input.companyId,
      documentIdentityId: candidate.documentIdentityId,
      sourceArtifactId: input.material.artifact.artifactId,
      artifactSha256: input.material.artifact.contentSha256,
      observedRevisionLabel,
      revisionClaimId: revisionClaim?.claimId ?? null,
      membershipBasis: "IDENTITY_SUGGESTION",
      documentRole: input.documentRole,
      documentRoleSource: input.documentRoleSource,
      derivationFamilyRootArtifactId: input.material.lineage.derivationFamilyRootArtifactId,
      lineageRole: input.material.lineage.lineageRole,
      limitations: [
        "an observed revision label is evidence; it does not mean the revision is active",
        ...(revisionClaim ? [] : ["the artifact declared no revision label, so its revision membership carries none"]),
      ],
      createdAt: input.createdAt,
    },
  ];
}

/** Commands the phase exposes for governance. Every one is explicit and audited. */

export type ActiveRevisionDecisionRequest = {
  companyId: string;
  documentIdentityId: string;
  comparisonScopeId: string | null;
  actorUserId: string;
  reason: string;
  status: ActiveRevisionDecisionStatus;
  selectedMembershipIds: readonly string[];
  evidenceClaimIds: readonly string[];
  blockedReason?: string | null;
  previousDecision: ActiveRevisionDecisionRecord | null;
  decidedAt: string;
  limitations?: readonly string[];
};

export type ActiveRevisionDecisionOutcome =
  | { ok: true; decision: ActiveRevisionDecisionRecord }
  | { ok: false; problem: string };

/**
 * Builds an append-only active-revision decision.
 *
 * The version is monotonic per identity, the previous decision is preserved by
 * id, and an invalid request is refused rather than stored half-formed.
 */
export function buildActiveRevisionDecision(input: ActiveRevisionDecisionRequest): ActiveRevisionDecisionOutcome {
  const validation = validateActiveRevisionDecision({
    status: input.status,
    selectedMembershipIds: input.selectedMembershipIds,
    blockedReason: input.blockedReason ?? null,
    reason: input.reason,
  });
  if (!validation.valid) return { ok: false, problem: validation.problem ?? "the decision was refused" };

  const decisionVersion = (input.previousDecision?.decisionVersion ?? 0) + 1;
  const decisionId = `ard_${createHash("sha256")
    .update(["voka:2a-10:active-revision:v1", input.companyId, input.documentIdentityId, String(decisionVersion)].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 40)}`;

  return {
    ok: true,
    decision: {
      decisionId,
      companyId: input.companyId,
      documentIdentityId: input.documentIdentityId,
      decisionVersion,
      status: input.status,
      selectedMembershipIds: [...input.selectedMembershipIds].sort(),
      actorUserId: input.actorUserId,
      reason: input.reason,
      decidedAt: input.decidedAt,
      evidenceClaimIds: [...input.evidenceClaimIds].slice(0, CROSS_DOCUMENT_BOUNDS.maxDecisionEvidenceClaims),
      supersedesDecisionId: input.previousDecision?.decisionId ?? null,
      blockedReason: input.blockedReason ?? null,
      comparisonScopeId: input.comparisonScopeId,
      limitations: [
        "resolving a revision decision is not approving a quantity: it only records which revision a human treats as active",
        ...(input.limitations ?? []),
      ],
    },
  };
}

export type DocumentRelationRequest = {
  companyId: string;
  documentIdentityId: string;
  relatedDocumentIdentityId: string;
  relationKind: DocumentRelationKind;
  relationBasis: DocumentRelationBasis;
  evidenceClaimIds: readonly string[];
  declaredByUserId: string | null;
  reason: string;
  createdAt: string;
};

/**
 * Builds a document relation.
 *
 * `DERIVED_FROM` is deliberately not a legal relation here: Phase 2A-9
 * `ArtifactDerivation` owns lineage, and duplicating it would create a second
 * competing source of truth. An addendum relation never mutates the base
 * artifact's evidence, and a superseded document stays queryable.
 */
export function buildDocumentRelation(input: DocumentRelationRequest): { ok: true; record: import("./ports").DocumentRelationRecord } | { ok: false; problem: string } {
  if (input.relationKind as string === "DERIVED_FROM") {
    return { ok: false, problem: "DERIVED_FROM is owned by Phase 2A-9 ArtifactDerivation and is not a 2A-10 document relation" };
  }
  if (input.documentIdentityId === input.relatedDocumentIdentityId) {
    return { ok: false, problem: "a document relation must connect two different document identities" };
  }
  if (!input.reason.trim()) return { ok: false, problem: "a document relation must record the reviewer's reason" };
  const documentRelationId = `drel_${createHash("sha256")
    .update(["voka:2a-10:relation:v1", input.companyId, input.documentIdentityId, input.relatedDocumentIdentityId, input.relationKind].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 40)}`;
  return {
    ok: true,
    record: {
      documentRelationId,
      companyId: input.companyId,
      documentIdentityId: input.documentIdentityId,
      relatedDocumentIdentityId: input.relatedDocumentIdentityId,
      relationKind: input.relationKind,
      relationBasis: input.relationBasis,
      evidenceClaimIds: [...input.evidenceClaimIds].slice(0, CROSS_DOCUMENT_BOUNDS.maxDecisionEvidenceClaims),
      declaredByUserId: input.declaredByUserId,
      reason: input.reason,
      limitations: ["a document relation is governance metadata; it never mutates the evidence of either document"],
      createdAt: input.createdAt,
    },
  };
}

/** Readiness of one identity, from the facts a run actually observed. */
export function identityReadiness(input: {
  hadAmbiguousIdentity: boolean;
  identityResolved: boolean;
  hasActiveDecision: boolean;
  activeDecisionBlocked: boolean;
  anySourcePartial: boolean;
  anySourceUnavailable: boolean;
}): { state: DocumentReadinessState; blockReasons: ComparisonBlockReason[] } {
  return documentReadiness(input);
}

export const GOVERNANCE_VERSIONS = {
  identityResolver: DOCUMENT_IDENTITY_RESOLVER_VERSION,
  activeRevision: ACTIVE_REVISION_GOVERNANCE_VERSION,
} as const;

/** Deterministic key for a governance-CONFIRMED identity: the only guarded unique key. */
export function confirmedIdentityKey(input: { companyId: string; kind: string; label: string; key: string }): string {
  return buildConfirmedIdentityKey({ companyId: input.companyId, kind: input.kind as SuggestedDocumentIdentity["kind"], label: input.label, key: input.key });
}
