/**
 * Phase 2A-10: the read/presentation surfaces.
 *
 * They are deliberately thin: every read is company-scoped, every list is
 * bounded, and every token is rendered through the exhaustive bilingual label
 * tables — no raw enum token ever reaches a reader.
 */

import {
  CROSS_DOCUMENT_BOUNDS,
  documentRoleLabel,
  findingKindLabel,
  matchClassLabel,
  localizeLimitations,
  predicateLabel,
  quantityOriginLabel,
  readinessLabel,
  reviewStateLabel,
  staleReasonLabel,
  unitDimensionLabel,
  type CrossDocumentFindingRecord,
  type DocumentRevisionMembership,
  type FindingParticipant,
  type NormalizedEvidenceClaim,
  type ReviewState,
  type SuggestedDocumentIdentity,
  type Locale,
  type FindingKind,
} from "@/src/domain/cross-document";
import { renderFindingStatement, type RenderedFindingStatement } from "@/src/domain/cross-document";
import { documentReadiness } from "@/src/domain/cross-document";
import type { SubjectClusterRecord, SubjectMatchRecord } from "./matching-types";
import type { ComparisonRunRecord, ComparisonScopeRecord, CrossDocumentStore, DocumentIdentityRecord, DocumentRelationRecord } from "./ports";
import type { ActiveRevisionDecisionRecord } from "@/src/domain/cross-document";

export type ReadContext = {
  companyId: string;
  store: CrossDocumentStore;
  locale: Locale;
};

/**
 * The presentation handle for an artifact.
 *
 * It is built from evidence only and never invents a name: when no identity
 * evidence was observed, the handle says so.
 */
export function artifactDisplayHandle(input: { artifactId: string; suggestion: SuggestedDocumentIdentity | null; fallbackFilename?: string | null }): string {
  if (input.suggestion?.label) return input.suggestion.label;
  if (input.fallbackFilename) return input.fallbackFilename;
  return input.artifactId;
}

export async function listClaims(input: ReadContext & {
  comparisonScopeId?: string;
  sourceArtifactId?: string;
  predicate?: string;
  subjectMatchKey?: string;
  limit?: number;
}): Promise<Array<NormalizedEvidenceClaim & { predicateLabel: string; quantityOriginLabel: string | null }>> {
  const claims = await input.store.listClaims({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    sourceArtifactId: input.sourceArtifactId,
    predicate: input.predicate,
    subjectMatchKey: input.subjectMatchKey,
    limit: input.limit ?? CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact,
  });
  return claims.map((claim) => ({
    ...claim,
    predicateLabel: predicateLabel(claim.assertion.predicate, input.locale),
    quantityOriginLabel: claim.assertion.quantityOrigin ? quantityOriginLabel(claim.assertion.quantityOrigin, input.locale) : null,
  }));
}

export async function getClaim(input: ReadContext & { claimId: string }): Promise<NormalizedEvidenceClaim | null> {
  return input.store.findClaim({ companyId: input.companyId, claimId: input.claimId });
}

/** Claim provenance: exact locator, page, citation, channel, and the raw record identity. */
export async function getClaimProvenance(input: ReadContext & { claimId: string }): Promise<{
  claimId: string;
  locator: string;
  humanLocator: string | null;
  pageNumber: number | null;
  citationId: string | null;
  readingChannel: string;
  rawRecordKind: string | null;
  rawRecordId: string | null;
  reliability: string;
  confidence: number | null;
  limitations: string[];
  localized: { limitations: string[] };
} | null> {
  const claim = await input.store.findClaim({ companyId: input.companyId, claimId: input.claimId });
  if (!claim) return null;
  return {
    claimId: claim.claimId,
    locator: claim.provenance.locator,
    humanLocator: claim.provenance.humanLocator,
    pageNumber: claim.provenance.pageNumber,
    citationId: claim.provenance.citationId,
    readingChannel: claim.readingChannel,
    rawRecordKind: claim.provenance.rawRecordKind,
    rawRecordId: claim.provenance.rawRecordId,
    reliability: claim.provenance.reliability,
    confidence: claim.provenance.confidence,
    limitations: claim.provenance.limitations,
    localized: { limitations: localizeLimitations(claim.provenance.limitations, input.locale) },
  };
}

export async function listSubjectMatches(input: ReadContext & { comparisonScopeId: string; limit?: number }): Promise<Array<SubjectMatchRecord & { matchClassLabel: string }>> {
  const matches = await input.store.listSubjectMatches({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    limit: input.limit ?? 200,
  });
  return matches.map((match) => ({ ...match, matchClassLabel: matchClassLabel(match.matchClass, input.locale) }));
}

export async function listSubjectClusters(input: ReadContext & { comparisonScopeId: string; limit?: number }): Promise<Array<SubjectClusterRecord & { namespaceLabel: string }>> {
  const clusters = await input.store.listSubjectClusters({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    limit: input.limit ?? 200,
  });
  return clusters.map((cluster) => ({ ...cluster, namespaceLabel: cluster.namespace }));
}

export async function getSubjectCluster(input: ReadContext & { subjectClusterId: string }): Promise<{ cluster: SubjectClusterRecord; claims: NormalizedEvidenceClaim[] } | null> {
  const cluster = await input.store.findSubjectCluster({ companyId: input.companyId, subjectClusterId: input.subjectClusterId });
  if (!cluster) return null;
  const claims: NormalizedEvidenceClaim[] = [];
  for (const claimId of cluster.memberClaimIds) {
    const claim = await input.store.findClaim({ companyId: input.companyId, claimId });
    if (claim) claims.push(claim);
  }
  return { cluster, claims };
}

export type FindingListItem = {
  findingId: string;
  findingKind: FindingKind;
  findingKindLabel: string;
  predicate: string | null;
  predicateLabel: string | null;
  severity: string;
  reviewState: ReviewState;
  reviewStateLabel: string;
  subjectClusterId: string | null;
  subjectKeys: string[];
  reproduced: boolean;
  stale: boolean;
  staleReason: string | null;
  staleReasonLabel: string | null;
  evidenceChanged: boolean;
  participantCount: number;
  statementTemplateKey: string;
  truncated: boolean;
  limitations: string[];
  localized: { limitations: string[] };
};

function toFindingListItem(finding: CrossDocumentFindingRecord, locale: Locale): FindingListItem {
  return {
    findingId: finding.findingId,
    findingKind: finding.findingKind,
    findingKindLabel: findingKindLabel(finding.findingKind, locale),
    predicate: finding.predicate,
    predicateLabel: finding.predicate ? predicateLabel(finding.predicate, locale) : null,
    severity: finding.severity,
    reviewState: finding.reviewState,
    reviewStateLabel: reviewStateLabel(finding.reviewState, locale),
    subjectClusterId: finding.subjectClusterId,
    subjectKeys: finding.subjectKeys,
    reproduced: finding.engineFlags.reproduced,
    stale: finding.engineFlags.stale,
    staleReason: finding.engineFlags.staleReason,
    staleReasonLabel: finding.engineFlags.staleReason ? staleReasonLabel(finding.engineFlags.staleReason, locale) : null,
    evidenceChanged: finding.engineFlags.evidenceChanged,
    participantCount: finding.participantIds.length,
    statementTemplateKey: finding.statementTemplateKey,
    truncated: finding.truncated,
    limitations: finding.limitations,
    localized: { limitations: localizeLimitations(finding.limitations, locale) },
  };
}

export async function listFindings(input: ReadContext & {
  comparisonScopeId?: string;
  findingKind?: string;
  reviewState?: string;
  stale?: boolean;
  limit?: number;
}): Promise<FindingListItem[]> {
  const findings = await input.store.listFindings({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    findingKind: input.findingKind,
    reviewState: input.reviewState,
    stale: input.stale,
    limit: input.limit ?? 100,
  });
  return findings.map((finding) => toFindingListItem(finding, input.locale));
}

export type FindingDetail = FindingListItem & {
  fingerprint: string;
  evidenceSignatureHash: string;
  participantFamilies: string[];
  statement: RenderedFindingStatement;
  participants: Array<FindingParticipant & { documentRoleLabel: string; quantityOriginLabel: string | null; unitDimensionLabel: string | null }>;
};

export async function getFindingDetail(input: ReadContext & {
  findingId: string;
  sourceLabels?: ReadonlyMap<string, string>;
  subjectLabels?: ReadonlyMap<string, string>;
}): Promise<FindingDetail | null> {
  const finding = await input.store.findFinding({ companyId: input.companyId, findingId: input.findingId });
  if (!finding) return null;
  const participants = await input.store.listParticipants({ companyId: input.companyId, findingId: input.findingId });
  const listItem = toFindingListItem(finding, input.locale);
  const subjectLabel = finding.subjectKeys.length ? (input.subjectLabels?.get(finding.subjectClusterId ?? "") ?? finding.subjectKeys[0]!) : null;
  const statement = renderFindingStatement({
    findingKind: finding.findingKind,
    statementTemplateKey: finding.statementTemplateKey,
    participants,
    subjectLabel,
    sourceLabels: input.sourceLabels,
    locale: input.locale,
  });
  return {
    ...listItem,
    fingerprint: finding.fingerprint,
    evidenceSignatureHash: finding.evidenceSignature.signatureHash,
    participantFamilies: [...finding.participantFamilies],
    statement,
    participants: participants.map((participant) => ({
      ...participant,
      documentRoleLabel: documentRoleLabel(participant.documentRole, input.locale),
      quantityOriginLabel: participant.quantityOrigin ? quantityOriginLabel(participant.quantityOrigin, input.locale) : null,
      unitDimensionLabel: null,
    })),
  };
}

/** Every finding's rendered statement, both sides, for the EN/AR matrix. */
export async function renderFindingsForLocale(input: ReadContext & { comparisonScopeId?: string; limit?: number }): Promise<RenderedFindingStatement[]> {
  const findings = await input.store.listFindings({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: input.limit ?? 100 });
  const statements: RenderedFindingStatement[] = [];
  for (const finding of findings) {
    const participants = await input.store.listParticipants({ companyId: input.companyId, findingId: finding.findingId });
    statements.push(
      renderFindingStatement({
        findingKind: finding.findingKind,
        statementTemplateKey: finding.statementTemplateKey,
        participants,
        subjectLabel: finding.subjectKeys[0] ?? null,
        locale: input.locale,
      }),
    );
  }
  return statements;
}

/**
 * The EVIDENCE HISTORY of one finding.
 *
 * The finding row carries only the current projection; this read reconstructs
 * every earlier one from the durable run/finding-evidence associations and the
 * immutable claims they reference. Each entry is localized so a reviewer sees
 * the same historical evidence in their own language, with the verbatim source
 * literal and the exact source locator untranslated.
 */
export type FindingEvidenceHistoryItem = {
  observationId: string;
  comparisonRunId: string;
  fingerprint: string;
  evidenceSignatureHash: string;
  evidenceChanged: boolean;
  observedAt: string;
  entries: Array<{
    claimId: string;
    ordinal: number;
    /** Verbatim source literal of the historical claim; never translated. */
    valueLiteral: string | null;
    unit: string | null;
    /** Exact source locator of the historical claim; never translated. */
    locator: string | null;
    pageNumber: number | null;
    citationId: string | null;
    sourceArtifactId: string | null;
    readingChannel: string | null;
    quantityOrigin: string | null;
    quantityOriginLabel: string | null;
    /** True when the immutable claim row itself is gone; never guessed at. */
    claimMissing: boolean;
  }>;
};

export async function listFindingEvidenceHistory(input: ReadContext & { findingId: string; limit?: number }): Promise<FindingEvidenceHistoryItem[]> {
  const observations = await input.store.listFindingEvidenceObservations({
    companyId: input.companyId,
    findingId: input.findingId,
    limit: input.limit ?? CROSS_DOCUMENT_BOUNDS.maxEvidenceObservationsPerRead,
  });
  return observations.map((observation) => ({
    observationId: observation.observationId,
    comparisonRunId: observation.comparisonRunId,
    fingerprint: observation.fingerprint,
    evidenceSignatureHash: observation.evidenceSignatureHash,
    evidenceChanged: observation.evidenceChanged,
    observedAt: observation.observedAt,
    entries: observation.entries.map((entry) => ({
      claimId: entry.claimId,
      ordinal: entry.ordinal,
      valueLiteral: entry.claim?.assertion.valueLiteral ?? null,
      unit: entry.claim?.assertion.unitLiteral ?? null,
      locator: entry.claim?.provenance.locator ?? null,
      pageNumber: entry.claim?.provenance.pageNumber ?? null,
      citationId: entry.claim?.provenance.citationId ?? null,
      sourceArtifactId: entry.claim?.sourceArtifactId ?? null,
      readingChannel: entry.claim?.readingChannel ?? null,
      quantityOrigin: entry.claim?.assertion.quantityOrigin ?? null,
      quantityOriginLabel: entry.claim?.assertion.quantityOrigin ? quantityOriginLabel(entry.claim.assertion.quantityOrigin, input.locale) : null,
      claimMissing: entry.claim === null,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Document governance reads
// ---------------------------------------------------------------------------

export async function listDocumentIdentities(input: ReadContext & { observedFamilyKey?: string; limit?: number }): Promise<Array<DocumentIdentityRecord & { readiness: { state: string; stateLabel: string; blockReasons: string[] } }>> {
  const identities = await input.store.listDocumentIdentities({ companyId: input.companyId, observedFamilyKey: input.observedFamilyKey, limit: input.limit ?? 100 });
  const out: Array<DocumentIdentityRecord & { readiness: { state: string; stateLabel: string; blockReasons: string[] } }> = [];
  for (const identity of identities) {
    const memberships = await input.store.listRevisionMemberships({ companyId: input.companyId, documentIdentityId: identity.documentIdentityId, limit: 64 });
    const decision = await input.store.latestActiveRevisionDecision({ companyId: input.companyId, documentIdentityId: identity.documentIdentityId });
    const labels = new Set(memberships.map((membership) => membership.observedRevisionLabel).filter((label): label is string => Boolean(label)));
    const readiness = documentReadiness({
      hadAmbiguousIdentity: identity.ambiguous,
      identityResolved: identity.kind !== "UNRESOLVED",
      hasActiveDecision: decision?.status === "ACTIVE_REVISION_SELECTED",
      activeDecisionBlocked: decision?.status === "BLOCKED_INCOMPATIBLE_ACTIVES",
      anySourcePartial: memberships.some((membership) => membership.limitations.some((limitation) => limitation.includes("partial"))),
      anySourceUnavailable: false,
    });
    out.push({
      ...identity,
      readiness: {
        state: labels.size > 1 && !readiness.blockReasons.includes("NO_ACTIVE_REVISION_DECISION") ? readiness.state : readiness.state,
        stateLabel: readinessLabel(readiness.state, input.locale),
        blockReasons: readiness.blockReasons,
      },
    });
  }
  return out;
}

export async function listRevisionMemberships(input: ReadContext & { documentIdentityId?: string; sourceArtifactId?: string; limit?: number }): Promise<Array<DocumentRevisionMembership & { documentRoleLabel: string }>> {
  const memberships = await input.store.listRevisionMemberships({
    companyId: input.companyId,
    documentIdentityId: input.documentIdentityId,
    sourceArtifactId: input.sourceArtifactId,
    limit: input.limit ?? 100,
  });
  return memberships.map((membership) => ({ ...membership, documentRoleLabel: documentRoleLabel(membership.documentRole, input.locale) }));
}

export async function listDocumentRelations(input: ReadContext & { documentIdentityId?: string; limit?: number }): Promise<DocumentRelationRecord[]> {
  return input.store.listDocumentRelations({ companyId: input.companyId, documentIdentityId: input.documentIdentityId, limit: input.limit ?? 100 });
}

export async function getActiveRevisionDecision(input: ReadContext & { documentIdentityId: string }): Promise<ActiveRevisionDecisionRecord | null> {
  return input.store.latestActiveRevisionDecision({ companyId: input.companyId, documentIdentityId: input.documentIdentityId });
}

export async function listActiveRevisionDecisionHistory(input: ReadContext & { documentIdentityId: string; limit?: number }): Promise<ActiveRevisionDecisionRecord[]> {
  return input.store.listActiveRevisionDecisions({ companyId: input.companyId, documentIdentityId: input.documentIdentityId, limit: input.limit ?? 50 });
}

// ---------------------------------------------------------------------------
// Scope and run reads
// ---------------------------------------------------------------------------

export async function getComparisonScope(input: ReadContext & { comparisonScopeId: string }): Promise<ComparisonScopeRecord | null> {
  return input.store.findScope({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
}

export async function getComparisonStatus(input: ReadContext & { comparisonScopeId: string }): Promise<{
  scope: ComparisonScopeRecord;
  latestRun: ComparisonRunRecord | null;
  blockReasons: string[];
  readiness: string;
} | null> {
  const scope = await input.store.findScope({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
  if (!scope) return null;
  const runs = await input.store.listRuns({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: 1 });
  const latestRun = runs[0] ?? null;
  const blockReasons = latestRun?.blockReasons ?? [];
  return {
    scope,
    latestRun,
    blockReasons,
    readiness: blockReasons.length ? "BLOCKED" : latestRun ? "READY" : "UNDECIDED",
  };
}

export async function listComparisonRuns(input: ReadContext & { comparisonScopeId?: string; limit?: number }): Promise<ComparisonRunRecord[]> {
  return input.store.listRuns({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: input.limit ?? 50 });
}

/** Lineage read: read-only, straight from what the run recorded. */
export async function listLineage(input: ReadContext & { comparisonScopeId: string }): Promise<Array<{ derivationFamilyRootArtifactId: string; evidenceArtifactIds: string[]; lineageRole: string; derivationId: string | null; fidelityLimitations: string[]; warnings: string[] }>> {
  const materializations = await input.store.listMaterializations({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
  const byFamily = new Map<string, { derivationFamilyRootArtifactId: string; evidenceArtifactIds: string[]; lineageRole: string; derivationId: string | null; fidelityLimitations: string[]; warnings: string[] }>();
  for (const materialization of materializations) {
    const claims = await input.store.listClaims({ companyId: input.companyId, sourceArtifactId: materialization.sourceArtifactId, limit: 1 });
    const first = claims[0];
    const root = first?.derivation.derivationFamilyRootArtifactId ?? materialization.sourceArtifactId;
    const entry = byFamily.get(root) ?? {
      derivationFamilyRootArtifactId: root,
      evidenceArtifactIds: [],
      lineageRole: first?.derivation.lineageRole ?? "STANDALONE",
      derivationId: first?.derivation.derivationId ?? null,
      fidelityLimitations: first?.derivation.fidelityLimitations ?? [],
      warnings: materialization.warnings,
    };
    if (!entry.evidenceArtifactIds.includes(materialization.sourceArtifactId)) entry.evidenceArtifactIds.push(materialization.sourceArtifactId);
    byFamily.set(root, entry);
  }
  return [...byFamily.values()].sort((left, right) => (left.derivationFamilyRootArtifactId < right.derivationFamilyRootArtifactId ? -1 : 1));
}

/** Unit dimension label helper, so a unit dimension is never printed raw. */
export function unitDimensionDimensionLabel(dimension: string, locale: Locale): string {
  return unitDimensionLabel(dimension, locale);
}
