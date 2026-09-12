/**
 * Phase 2A-10 → Phase 2A-11: the stable read contract.
 *
 * It exposes immutable stated-quantity claims, their quantity origin, units,
 * reliability, confidence, citations, exact locators, stable subject clusters,
 * match explanations, unresolved conflicts, resolved finding state, missing
 * evidence, coverage, document identity, revision membership, the latest active
 * revision decision, scope block reasons, derivation lineage, and staleness.
 *
 * It NEVER exposes an engineering-approved quantity, a counted quantity, a
 * measured quantity, a BOM quantity, a quotation quantity, or a procurement
 * quantity — because none of those exist in this phase, and 2A-11 makes its own
 * governed quantity decisions.
 *
 * Everything is company-scoped: no field crosses a tenant boundary.
 */

import {
  CROSS_DOCUMENT_BOUNDS,
  type CrossDocumentFindingRecord,
  type DocumentRevisionMembership,
  type NormalizedEvidenceClaim,
  type QuantityOrigin,
} from "@/src/domain/cross-document";
import type { SubjectClusterRecord, SubjectMatchRecord } from "./matching-types";
import type { ActiveRevisionDecisionRecord } from "@/src/domain/cross-document";
import type { ComparisonRunRecord, ComparisonScopeRecord, CrossDocumentStore, DocumentIdentityRecord } from "./ports";

export type HandoffQuantityClaim = {
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
  /** Present only when the accepted source model supplied a numeric view. */
  sourceNumericView: number | null;
  unit: string | null;
  unitDeclared: boolean;
  unitDimension: string | null;
  quantityOrigin: QuantityOrigin;
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
  /** Always OBSERVED_NOT_APPROVED / CROSS_DOCUMENT_COMPARISON_ONLY. */
  status: string;
  purpose: string;
};

export type HandoffBundle = {
  companyId: string;
  comparisonScopeId: string;
  scope: {
    name: string;
    context: string;
    revisionPolicy: string;
    comparisonScopeClass: string;
    lineageCollapse: true;
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
  quantityClaims: HandoffQuantityClaim[];
  claims: NormalizedEvidenceClaim[];
  subjectClusters: Array<{
    subjectClusterId: string;
    namespace: string;
    matchKey: string;
    subjectKeys: string[];
    memberClaimIds: string[];
    derivationFamilyRootIds: string[];
    comparable: boolean;
    ambiguous: boolean;
    blockers: string[];
  }>;
  subjectMatches: Array<{
    subjectMatchId: string;
    tier: string;
    matchClass: string;
    leftClaimId: string;
    rightClaimId: string;
    comparedKeys: string[];
    corroborators: string[];
    blockers: string[];
    reasons: string[];
    score: number | null;
    ambiguous: boolean;
    matcherVersion: string;
  }>;
  findings: Array<{
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
    participantClaimIds: string[];
    limitations: string[];
  }>;
  documentIdentities: Array<{
    documentIdentityId: string;
    kind: string;
    label: string;
    observedFamilyKey: string;
    identityBasis: string;
    ambiguous: boolean;
    confirmedIdentityKey: string | null;
  }>;
  revisionMemberships: Array<{
    membershipId: string;
    documentIdentityId: string;
    sourceArtifactId: string;
    artifactSha256: string;
    observedRevisionLabel: string | null;
    revisionClaimId: string | null;
    membershipBasis: string;
    documentRole: string;
    derivationFamilyRootArtifactId: string;
  }>;
  activeRevisionDecisions: Array<{
    documentIdentityId: string;
    decisionId: string;
    decisionVersion: number;
    status: string;
    selectedMembershipIds: string[];
    actorUserId: string;
    reason: string;
    decidedAt: string;
    blockedReason: string | null;
  }>;
  lineage: Array<{
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
  }>;
  coverage: Array<{ artifactId: string; sha256: string; sourceKind: string; coverage: string; claimCount: number; truncated: boolean; limitations: string[] }>;
  staleness: {
    staleFindings: number;
    reproducedFindings: number;
    evidenceChangedFindings: number;
  };
  blockReasons: string[];
  limitations: string[];
  /** Fields this contract deliberately does not carry. */
  notExposed: readonly string[];
};

/**
 * Fields the handoff contract must never contain.
 *
 * They are listed in the returned payload so a consumer can assert the absence
 * positively, and so a test can prove no engineering quantity decision has
 * leaked out of a comparison run.
 */
export const HANDOFF_NOT_EXPOSED_FIELDS: readonly string[] = [
  "countedQuantity",
  "measuredQuantity",
  "engineeringApprovedQuantity",
  "approvedQuantity",
  "bomQuantity",
  "engineeringBomLine",
  "quotationQuantity",
  "procurementQuantity",
  "procurementRequirement",
  "productSelection",
  "supplierRanking",
  "rfq",
  "offer",
  "award",
  "purchaseOrder",
];

export const MAX_HANDOFF_CLAIMS = 2_000;
export const MAX_HANDOFF_FINDINGS = 500;

/**
 * Builds the 2A-11 handoff bundle.
 *
 * Only the LATEST run's claims participate: the bundle is a snapshot of what
 * the sources state now, while historical claims and findings remain queryable
 * through their own read APIs.
 */
export async function buildCrossDocumentHandoff(input: {
  companyId: string;
  comparisonScopeId: string;
  store: CrossDocumentStore;
}): Promise<HandoffBundle | null> {
  const scope = await input.store.findScope({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
  if (!scope) return null;

  const [runs, claims, clusters, matches, findings, identities, memberships, materializations, scopeArtifacts] = await Promise.all([
    input.store.listRuns({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: 1 }),
    input.store.listClaims({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: MAX_HANDOFF_CLAIMS }),
    input.store.listSubjectClusters({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: 4_000 }),
    input.store.listSubjectMatches({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: 6_000 }),
    input.store.listFindings({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: MAX_HANDOFF_FINDINGS }),
    input.store.listDocumentIdentities({ companyId: input.companyId, limit: 200 }),
    input.store.listRevisionMemberships({ companyId: input.companyId, limit: 500 }),
    input.store.listMaterializations({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId }),
    input.store.listScopeArtifacts({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId }),
  ]);

  const scopeArtifactIds = new Set(scopeArtifacts.map((entry) => entry.artifactId));
  const scopeClaims = claims.filter((claim) => scopeArtifactIds.has(claim.sourceArtifactId));
  const scopeMemberships = memberships.filter((membership) => scopeArtifactIds.has(membership.sourceArtifactId));
  const membershipById = new Map(scopeMemberships.map((membership) => [membership.sourceArtifactId, membership]));
  const identityByArtifact = new Map<string, DocumentIdentityRecord>();
  for (const identity of identities) {
    for (const evidence of identity.evidence) {
      if (scopeArtifactIds.has(evidence.sourceArtifactId)) identityByArtifact.set(evidence.sourceArtifactId, identity);
    }
  }

  const clusterByClaim = new Map<string, string>();
  for (const cluster of clusters) for (const claimId of cluster.memberClaimIds) if (!clusterByClaim.has(claimId)) clusterByClaim.set(claimId, cluster.subjectClusterId);

  const decisions: ActiveRevisionDecisionRecord[] = [];
  for (const documentIdentityId of new Set(scopeMemberships.map((membership) => membership.documentIdentityId))) {
    const decision = await input.store.latestActiveRevisionDecision({ companyId: input.companyId, documentIdentityId });
    if (decision) decisions.push(decision);
  }

  const quantityClaims: HandoffQuantityClaim[] = scopeClaims
    .filter((claim) => claim.assertion.predicate === "STATED_QUANTITY" && claim.assertion.quantityOrigin !== null)
    .slice(0, CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact)
    .map((claim) => toHandoffQuantityClaim({ claim, clusterId: clusterByClaim.get(claim.claimId) ?? null, membership: membershipById.get(claim.sourceArtifactId) ?? null, identity: identityByArtifact.get(claim.sourceArtifactId) ?? null }));

  const latestRun = runs[0] ?? null;
  const lineage = buildLineage(scopeClaims);
  const blockedIdentities = new Set(decisions.filter((decision) => decision.status !== "ACTIVE_REVISION_SELECTED").map((decision) => decision.documentIdentityId));

  return {
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    scope: {
      name: scope.name,
      context: scope.context,
      revisionPolicy: scope.revisionPolicy,
      comparisonScopeClass: scope.comparisonScopeClass,
      lineageCollapse: true,
      policyBounds: scope.policyBounds,
    },
    latestRun: latestRun
      ? {
        comparisonRunId: latestRun.comparisonRunId,
        status: latestRun.status,
        engineVersion: latestRun.engineVersion,
        matcherVersion: latestRun.matcherVersion,
        projectorVersion: latestRun.projectorVersion,
        claimCount: latestRun.claimCount,
        matchCount: latestRun.matchCount,
        findingCount: latestRun.findingCount,
        startedAt: latestRun.startedAt,
        finishedAt: latestRun.finishedAt,
        inputDigest: latestRun.inputDigest,
      }
      : null,
    quantityClaims,
    claims: scopeClaims,
    subjectClusters: clusters.map((cluster: SubjectClusterRecord) => ({
      subjectClusterId: cluster.subjectClusterId,
      namespace: cluster.namespace,
      matchKey: cluster.matchKey,
      subjectKeys: cluster.subjectKeys,
      memberClaimIds: cluster.memberClaimIds,
      derivationFamilyRootIds: cluster.derivationFamilyRootIds,
      comparable: cluster.comparable,
      ambiguous: cluster.ambiguous,
      blockers: [...cluster.blockers],
    })),
    subjectMatches: matches.map((match: SubjectMatchRecord) => ({
      subjectMatchId: match.subjectMatchId,
      tier: match.tier,
      matchClass: match.matchClass,
      leftClaimId: match.leftClaimId,
      rightClaimId: match.rightClaimId,
      comparedKeys: [...match.comparedKeys],
      corroborators: [...match.corroborators],
      blockers: [...match.blockers],
      reasons: [...match.reasons],
      score: match.score,
      ambiguous: match.ambiguous,
      matcherVersion: match.matcherVersion,
    })),
    findings: findings.map((finding: CrossDocumentFindingRecord) => ({
      findingId: finding.findingId,
      findingKind: finding.findingKind,
      statementTemplateKey: finding.statementTemplateKey,
      severity: finding.severity,
      reviewState: finding.reviewState,
      fingerprint: finding.fingerprint,
      evidenceSignatureHash: finding.evidenceSignature.signatureHash,
      reproduced: finding.engineFlags.reproduced,
      stale: finding.engineFlags.stale,
      staleReason: finding.engineFlags.staleReason,
      evidenceChanged: finding.engineFlags.evidenceChanged,
      participantClaimIds: finding.participantIds.map((participantId) => participantId),
      limitations: [...finding.limitations],
    })),
    documentIdentities: identities.map((identity) => ({
      documentIdentityId: identity.documentIdentityId,
      kind: identity.kind,
      label: identity.label,
      observedFamilyKey: identity.observedFamilyKey,
      identityBasis: identity.identityBasis,
      ambiguous: identity.ambiguous,
      confirmedIdentityKey: identity.confirmedIdentityKey,
    })),
    revisionMemberships: scopeMemberships.map((membership: DocumentRevisionMembership) => ({
      membershipId: membership.membershipId,
      documentIdentityId: membership.documentIdentityId,
      sourceArtifactId: membership.sourceArtifactId,
      artifactSha256: membership.artifactSha256,
      observedRevisionLabel: membership.observedRevisionLabel,
      revisionClaimId: membership.revisionClaimId,
      membershipBasis: membership.membershipBasis,
      documentRole: membership.documentRole,
      derivationFamilyRootArtifactId: membership.derivationFamilyRootArtifactId,
    })),
    activeRevisionDecisions: decisions.map((decision) => ({
      documentIdentityId: decision.documentIdentityId,
      decisionId: decision.decisionId,
      decisionVersion: decision.decisionVersion,
      status: decision.status,
      selectedMembershipIds: [...decision.selectedMembershipIds],
      actorUserId: decision.actorUserId,
      reason: decision.reason,
      decidedAt: decision.decidedAt,
      blockedReason: decision.blockedReason,
    })),
    lineage,
    coverage: materializations.map((materialization) => ({
      artifactId: materialization.sourceArtifactId,
      sha256: materialization.artifactSha256,
      sourceKind: materialization.sourceKind,
      coverage: materialization.coverage,
      claimCount: materialization.claimCount,
      truncated: materialization.truncated,
      limitations: [...materialization.limitations],
    })),
    staleness: {
      staleFindings: findings.filter((finding) => finding.engineFlags.stale).length,
      reproducedFindings: findings.filter((finding) => finding.engineFlags.reproduced).length,
      evidenceChangedFindings: findings.filter((finding) => finding.engineFlags.evidenceChanged).length,
    },
    blockReasons: [...new Set([...(latestRun?.blockReasons ?? []), ...[...blockedIdentities].map(() => "NO_ACTIVE_REVISION_DECISION")])].sort(),
    limitations: [
      ...new Set([...(latestRun?.limitations ?? []), ...materializations.flatMap((materialization) => materialization.limitations)]),
    ].slice(0, 16),
    notExposed: HANDOFF_NOT_EXPOSED_FIELDS,
  };
}

function toHandoffQuantityClaim(input: {
  claim: NormalizedEvidenceClaim;
  clusterId: string | null;
  membership: DocumentRevisionMembership | null;
  identity: DocumentIdentityRecord | null;
}): HandoffQuantityClaim {
  const { claim } = input;
  return {
    claimId: claim.claimId,
    comparisonScopeId: "",
    sourceArtifactId: claim.sourceArtifactId,
    sourceKind: claim.sourceKind,
    readingChannel: claim.readingChannel,
    artifactSha256: claim.artifactSha256,
    subjectClusterId: input.clusterId,
    subjectKeyNamespace: claim.subject.subjectKeyNamespace,
    subjectKeyValue: claim.subject.subjectKeyValue,
    subjectMatchKey: claim.subject.subjectMatchKey,
    subjectLabel: claim.subject.subjectLabel,
    valueLiteral: claim.assertion.valueLiteral,
    sourceNumericView: claim.assertion.valueNumber,
    unit: claim.assertion.unitLiteral,
    unitDeclared: claim.assertion.unitDeclared,
    unitDimension: claim.assertion.unitDimension,
    quantityOrigin: claim.assertion.quantityOrigin ?? "STATED",
    locator: claim.provenance.locator,
    humanLocator: claim.provenance.humanLocator,
    citationId: claim.provenance.citationId,
    pageNumber: claim.provenance.pageNumber,
    reliability: claim.provenance.reliability,
    confidence: claim.provenance.confidence,
    limitations: [...claim.provenance.limitations],
    sourceQualifiers: [...claim.context.sourceQualifiers],
    coverage: claim.context.sourceCoverage,
    derivationFamilyRootArtifactId: claim.derivation.derivationFamilyRootArtifactId,
    lineageRole: claim.derivation.lineageRole,
    documentIdentityId: input.identity?.documentIdentityId ?? null,
    revisionMembershipId: input.membership?.membershipId ?? null,
    observedRevisionLabel: input.membership?.observedRevisionLabel ?? null,
    materializerVersion: claim.engine.materializerVersion,
    createdAt: claim.engine.createdAt,
    status: claim.status,
    purpose: claim.purpose,
  };
}

function buildLineage(claims: readonly NormalizedEvidenceClaim[]): HandoffBundle["lineage"] {
  const byFamily = new Map<string, HandoffBundle["lineage"][number]>();
  for (const claim of claims) {
    const root = claim.derivation.derivationFamilyRootArtifactId;
    const existing = byFamily.get(root);
    if (existing) {
      if (!existing.evidenceArtifactIds.includes(claim.sourceArtifactId)) existing.evidenceArtifactIds.push(claim.sourceArtifactId);
      continue;
    }
    byFamily.set(root, {
      derivationFamilyRootArtifactId: root,
      evidenceArtifactIds: [claim.sourceArtifactId],
      lineageRole: claim.derivation.lineageRole,
      derivationId: claim.derivation.derivationId,
      derivationKind: claim.derivation.derivedFormat ? `${claim.derivation.sourceFormat}_TO_${claim.derivation.derivedFormat}` : null,
      derivationMethod: claim.derivation.derivationMethod,
      sourceFormat: claim.derivation.sourceFormat,
      derivedFormat: claim.derivation.derivedFormat,
      converterId: claim.derivation.converterId,
      converterVersion: claim.derivation.converterVersion,
      warnings: [],
      fidelityLimitations: [...claim.derivation.fidelityLimitations],
      derivationHistoryCount: 1,
    });
  }
  return [...byFamily.values()].sort((left, right) => (left.derivationFamilyRootArtifactId < right.derivationFamilyRootArtifactId ? -1 : 1));
}
