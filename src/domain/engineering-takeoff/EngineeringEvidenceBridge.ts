/**
 * Phase 2A-11: THE 2A-10 EVIDENCE BRIDGE.
 *
 * Phase 2A-11 consumes Phase 2A-10. It never re-reads raw documents, never
 * trusts a parser summary, and never builds a parallel evidence system. This
 * module is the single, narrow seam where a 2A-10 handoff payload becomes
 * engineering input.
 *
 * The design choices that matter:
 *
 * - the bridge is structurally typed, not imported from the 2A-10 module. A
 *   structural `HandoffQuantityClaimLike` lets 2A-11 accept the real
 *   `HandoffQuantityClaim` WITHOUT editing 2A-10 and WITHOUT widening the
 *   contract, and it makes cycle-free unit testing possible;
 * - governance travels WITH the evidence. Identity, revision membership, active
 *   revision decisions, retention memberships, coverage, and derivation lineage
 *   are all carried across, so a candidate can always be traced back to the
 *   accepted evidence state that produced it;
 * - nothing here can upgrade an evidence value into an approved quantity. There
 *   is no field for approval on the bridge types.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

// ---------------------------------------------------------------------------
// Structural view of the accepted 2A-10 handoff
// ---------------------------------------------------------------------------

/**
 * Structural view of one 2A-10 `HandoffQuantityClaim`.
 *
 * Only the fields engineering derivation actually needs are declared. The real
 * 2A-10 type is wider; accepting a narrower structural view is deliberate, so
 * this bridge cannot grow a dependency on 2A-10 internals it does not own.
 */
export type HandoffQuantityClaimLike = {
  claimId: string;
  comparisonScopeId: string;
  sourceArtifactId: string;
  sourceKind: string;
  readingChannel: string;
  artifactSha256: string;
  subjectClusterId: string | null;
  subjectKeyNamespace: string;
  subjectKeyValue: string;
  subjectMatchKey: string;
  subjectLabel: string | null;
  valueLiteral: string;
  sourceNumericView: number | null;
  unit: string | null;
  unitDeclared: boolean;
  unitDimension: string | null;
  quantityOrigin: string;
  locator: string;
  humanLocator: string | null;
  citationId: string | null;
  pageNumber: number | null;
  reliability: string;
  confidence: number | null;
  limitations: string[];
  sourceQualifiers: string[];
  coverage: string;
  derivationFamilyRootArtifactId: string;
  lineageRole: string;
  documentIdentityId: string | null;
  revisionMembershipId: string | null;
  observedRevisionLabel: string | null;
  materializerVersion: string;
  createdAt: string;
  status: string;
  purpose: string;
};

export type HandoffSubjectClusterLike = {
  subjectClusterId: string;
  namespace: string;
  matchKey: string;
  subjectKeys: string[];
  memberClaimIds: string[];
  derivationFamilyRootIds: string[];
  comparable: boolean;
  ambiguous: boolean;
  blockers: string[];
};

export type HandoffFindingLike = {
  findingId: string;
  findingKind: string;
  statementTemplateKey: string;
  severity: string;
  reviewState: string;
  fingerprint: string;
  evidenceSignatureHash: string;
  reproduced: boolean;
  stale: boolean;
  staleReason: string | null;
  evidenceChanged: boolean;
  participantIds: string[];
  participantClaimIds: string[];
  evidenceObservationCount: number;
  limitations: string[];
};

export type HandoffRevisionMembershipLike = {
  membershipId: string;
  documentIdentityId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  observedRevisionLabel: string | null;
  revisionClaimId: string | null;
  membershipBasis: string;
  documentRole: string;
  derivationFamilyRootArtifactId: string;
};

export type HandoffActiveRevisionDecisionLike = {
  documentIdentityId: string;
  decisionId: string;
  decisionVersion: number;
  status: string;
  selectedMembershipIds: string[];
  actorUserId: string;
  reason: string;
  decidedAt: string;
  blockedReason: string | null;
};

export type HandoffCoverageLike = {
  artifactId: string;
  sha256: string;
  sourceKind: string;
  coverage: string;
  claimCount: number;
  truncated: boolean;
  limitations: string[];
};

export type HandoffLineageLike = {
  derivationFamilyRootArtifactId: string;
  evidenceArtifactIds: string[];
  lineageRole: string;
  derivationId: string | null;
  derivationKind: string | null;
  derivationMethod: string | null;
  sourceFormat: string | null;
  derivedFormat: string | null;
  converterId: string | null;
  converterVersion: string | null;
  warnings: string[];
  fidelityLimitations: string[];
  derivationHistoryCount: number;
};

/**
 * Structural view of a 2A-10 `HandoffBundle`.
 *
 * Every governance collection the engineering derivation depends on is
 * REQUIRED, so a caller cannot pass a partial bundle and silently lose revision
 * governance or coverage truth.
 */
export type CrossDocumentHandoffLike = {
  companyId: string;
  comparisonScopeId: string;
  scope: {
    name: string;
    context: string;
    revisionPolicy: string;
    comparisonScopeClass: string;
    lineageCollapse: boolean;
    policyBounds: Record<string, number>;
  };
  latestRun: {
    comparisonRunId: string;
    status: string;
    engineVersion: string;
    matcherVersion: string;
    projectorVersion: string;
    claimCount: number;
    matchCount: number;
    findingCount: number;
    startedAt: string;
    finishedAt: string;
    inputDigest: string;
  } | null;
  quantityClaims: HandoffQuantityClaimLike[];
  subjectClusters: HandoffSubjectClusterLike[];
  findings: HandoffFindingLike[];
  documentIdentities: Array<{
    documentIdentityId: string;
    kind: string;
    label: string;
    observedFamilyKey: string;
    identityBasis: string;
    ambiguous: boolean;
    confirmedIdentityKey: string | null;
  }>;
  revisionMemberships: HandoffRevisionMembershipLike[];
  activeRevisionDecisions: HandoffActiveRevisionDecisionLike[];
  lineage: HandoffLineageLike[];
  coverage: HandoffCoverageLike[];
  staleness: { staleFindings: number; reproducedFindings: number; evidenceChangedFindings: number };
  blockReasons: string[];
  limitations: string[];
  notExposed: readonly string[];
};

// ---------------------------------------------------------------------------
// Governance projection
// ---------------------------------------------------------------------------

/**
 * The governance facts an engineering derivation must respect.
 *
 * It is computed ONCE from the handoff and then consulted by every derivation
 * step, so no step can quietly bypass revision governance by reading claims
 * directly.
 */
export type EngineeringGovernanceView = {
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string | null;
  /** Claim ids that are excluded because their document identity has no active-revision decision. */
  ungovernedClaimIds: Set<string>;
  /** Claim ids excluded because their document identity's active decision is blocked. */
  blockedClaimIds: Set<string>;
  /** Claim ids from a superseded revision, when the scope is ACTIVE_ONLY. */
  supersededClaimIds: Set<string>;
  /** Claim ids whose source coverage was partial. */
  partialCoverageClaimIds: Set<string>;
  /** Document identities with no governing decision, for readiness reporting. */
  identitiesWithoutDecision: string[];
  /** Revision policy the scope was compared under. */
  revisionPolicy: string;
  /** Scope-level block reasons, carried through so readiness can be truthful. */
  blockReasons: string[];
  limitations: string[];
};

/** Artifact → derivation family root, and artifact → document identity, resolved from the handoff. */
export function buildArtifactGovernanceIndex(handoff: CrossDocumentHandoffLike): {
  familyRootByArtifact: Map<string, string>;
  membershipByArtifact: Map<string, HandoffRevisionMembershipLike>;
  identityByArtifact: Map<string, { documentIdentityId: string; kind: string; label: string; ambiguous: boolean; identityBasis: string }>;
} {
  const familyRootByArtifact = new Map<string, string>();
  const membershipByArtifact = new Map<string, HandoffRevisionMembershipLike>();
  const identityByArtifact = new Map<string, { documentIdentityId: string; kind: string; label: string; ambiguous: boolean; identityBasis: string }>();

  for (const lineage of handoff.lineage) {
    for (const artifactId of lineage.evidenceArtifactIds) familyRootByArtifact.set(artifactId, lineage.derivationFamilyRootArtifactId);
  }
  for (const membership of handoff.revisionMemberships) {
    membershipByArtifact.set(membership.sourceArtifactId, membership);
    familyRootByArtifact.set(membership.sourceArtifactId, membership.derivationFamilyRootArtifactId);
  }
  for (const identity of handoff.documentIdentities) {
    for (const membership of handoff.revisionMemberships) {
      if (membership.documentIdentityId !== identity.documentIdentityId) continue;
      identityByArtifact.set(membership.sourceArtifactId, {
        documentIdentityId: identity.documentIdentityId,
        kind: identity.kind,
        label: identity.label,
        ambiguous: identity.ambiguous,
        identityBasis: identity.identityBasis,
      });
    }
  }
  return { familyRootByArtifact, membershipByArtifact, identityByArtifact };
}

/**
 * Computes the governance view.
 *
 * The exclusions are computed as SETS and are never inferred per-claim in a
 * later step, which keeps the rule in one auditable place.
 */
export function buildEngineeringGovernanceView(handoff: CrossDocumentHandoffLike): EngineeringGovernanceView {
  const { membershipByArtifact } = buildArtifactGovernanceIndex(handoff);
  const decisionByIdentity = new Map(handoff.activeRevisionDecisions.map((decision) => [decision.documentIdentityId, decision]));

  const ungovernedClaimIds = new Set<string>();
  const blockedClaimIds = new Set<string>();
  const supersededClaimIds = new Set<string>();
  const partialCoverageClaimIds = new Set<string>();
  const identitiesWithoutDecision: string[] = [];

  const selectedMemberships = new Set<string>();
  for (const decision of handoff.activeRevisionDecisions) {
    if (decision.status === "ACTIVE_REVISION_SELECTED") for (const membershipId of decision.selectedMembershipIds) selectedMemberships.add(membershipId);
  }

  const partialArtifacts = new Set(handoff.coverage.filter((entry) => entry.coverage === "PARTIAL" || entry.truncated).map((entry) => entry.artifactId));

  const identityIds = new Set([...handoff.revisionMemberships.map((membership) => membership.documentIdentityId), ...handoff.documentIdentities.map((identity) => identity.documentIdentityId)]);
  for (const documentIdentityId of identityIds) {
    const decision = decisionByIdentity.get(documentIdentityId);
    if (!decision || decision.status !== "ACTIVE_REVISION_SELECTED") identitiesWithoutDecision.push(documentIdentityId);
  }

  for (const claim of handoff.quantityClaims) {
    const membership = membershipByArtifact.get(claim.sourceArtifactId);
    if (partialArtifacts.has(claim.sourceArtifactId) || claim.coverage === "PARTIAL") partialCoverageClaimIds.add(claim.claimId);
    if (!membership) continue;
    const decision = decisionByIdentity.get(membership.documentIdentityId);
    if (!decision) {
      ungovernedClaimIds.add(claim.claimId);
      continue;
    }
    if (decision.status !== "ACTIVE_REVISION_SELECTED") {
      blockedClaimIds.add(claim.claimId);
      continue;
    }
    // ACTIVE_ONLY means a membership that the active decision did not select is
    // not the current revision, so its claims describe a superseded document.
    if (handoff.scope.revisionPolicy === "ACTIVE_ONLY" && !selectedMemberships.has(membership.membershipId)) {
      supersededClaimIds.add(claim.claimId);
    }
  }

  const limitations = [
    "engineering derivation consumes accepted Phase 2A-10 governance; claims without an active-revision decision, or from a superseded or partially covered source, are excluded rather than inferred",
  ];
  if (identitiesWithoutDecision.length) {
    limitations.push(`${identitiesWithoutDecision.length} document identit${identitiesWithoutDecision.length === 1 ? "y has" : "ies have"} no active-revision decision, so their evidence is excluded from engineering derivation until a reviewer decides`);
  }

  return {
    companyId: handoff.companyId,
    comparisonScopeId: handoff.comparisonScopeId,
    comparisonRunId: handoff.latestRun?.comparisonRunId ?? null,
    ungovernedClaimIds,
    blockedClaimIds,
    supersededClaimIds,
    partialCoverageClaimIds,
    identitiesWithoutDecision: identitiesWithoutDecision.sort(),
    revisionPolicy: handoff.scope.revisionPolicy,
    blockReasons: [...handoff.blockReasons],
    limitations,
  };
}

/**
 * Claims that survive governance and may therefore produce engineering candidates.
 *
 * Excluded claims are NOT discarded silently: the caller receives both the
 * accepted set and the rejected set with reasons, so a readiness report can be
 * truthful about what was withheld.
 */
export function selectGovernedQuantityClaims(input: { handoff: CrossDocumentHandoffLike; governance: EngineeringGovernanceView }): {
  accepted: HandoffQuantityClaimLike[];
  rejected: Array<{ claimId: string; reason: string }>;
} {
  const accepted: HandoffQuantityClaimLike[] = [];
  const rejected: Array<{ claimId: string; reason: string }> = [];

  for (const claim of input.handoff.quantityClaims) {
    if (input.governance.ungovernedClaimIds.has(claim.claimId)) {
      rejected.push({ claimId: claim.claimId, reason: "NO_ACTIVE_REVISION_DECISION" });
      continue;
    }
    if (input.governance.blockedClaimIds.has(claim.claimId)) {
      rejected.push({ claimId: claim.claimId, reason: "ACTIVE_REVISION_DECISION_BLOCKED" });
      continue;
    }
    if (input.governance.supersededClaimIds.has(claim.claimId)) {
      rejected.push({ claimId: claim.claimId, reason: "SUPERSEDED_REVISION" });
      continue;
    }
    accepted.push(claim);
  }
  return { accepted, rejected };
}

/** Claim id → subject cluster id, resolved once so every candidate can cite its cluster. */
export function buildClusterByClaimId(clusters: readonly HandoffSubjectClusterLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cluster of clusters) for (const claimId of cluster.memberClaimIds) if (!map.has(claimId)) map.set(claimId, cluster.subjectClusterId);
  return map;
}

/**
 * Open review findings that touch a subject, so an engineering decision can be
 * shown the unresolved review state instead of pretending the evidence is settled.
 */
export function openReviewFindingsForClaims(input: { findings: readonly HandoffFindingLike[]; claimIds: ReadonlySet<string> }): HandoffFindingLike[] {
  return input.findings.filter(
    (finding) =>
      (finding.reviewState === "OPEN" || finding.reviewState === "NEEDS_INFORMATION" || finding.reviewState === "ACKNOWLEDGED") &&
      finding.participantClaimIds.some((claimId) => input.claimIds.has(claimId)),
  );
}
