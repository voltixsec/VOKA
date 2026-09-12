/**
 * Phase 2A-10: projecting comparison outcomes into durable cross-document
 * findings and bounded participants.
 *
 * The separation the phase requires is enforced here:
 *
 * - the FINDING FINGERPRINT identifies the logical discrepancy using the
 *   company, scope, finding kind, predicate, the stable subject cluster, and the
 *   participant document/lineage families. The current differing values are
 *   deliberately excluded;
 * - the EVIDENCE SIGNATURE carries the current claim ids, verbatim values,
 *   units, and locators, and hashes them so a change is detectable;
 * - therefore "BOQ 24 vs IFC 22" and later "BOQ 24 vs IFC 23" are the SAME
 *   logical finding with a new evidence signature and `evidenceChanged = true`.
 *
 * No participant is ever marked as a winner, and no preferred ordinal exists:
 * the ordinal is a stable display order, nothing more.
 */

import {
  CROSS_DOCUMENT_BOUNDS,
  FINDING_PROJECTOR_VERSION,
  buildEvidenceSignature,
  buildFindingFingerprint,
  buildParticipantId,
  severityForFindingKind,
  statementTemplateKeyForFindingKind,
  type CrossDocumentFindingRecord,
  type FindingKind,
  type FindingParticipant,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import { createHash } from "node:crypto";

export type FindingDraft = {
  findingKind: FindingKind;
  predicate: NormalizedEvidenceClaim["assertion"]["predicate"] | null;
  /** Subject cluster ids of the group this finding belongs to, sorted. */
  clusterIds: string[];
  participants: readonly NormalizedEvidenceClaim[];
  subjectKeys: string[];
  reasons: string[];
  limitations: string[];
  truncated: boolean;
};

export type ProjectedFinding = {
  record: Omit<CrossDocumentFindingRecord, "engineFlags" | "reviewState">;
  participants: FindingParticipant[];
};

/** Deterministic finding identity: the fingerprint, not the values, is the input. */
export function buildFindingId(input: { companyId: string; comparisonScopeId: string; fingerprint: string }): string {
  return `fnd_${createHash("sha256")
    .update(["voka:2a-10:finding-id:v1", input.companyId, input.comparisonScopeId, input.fingerprint].join("\u0000"), "utf8")
    .digest("hex")}`;
}

/** Stable participant ordering: by derivation family, then source artifact, then claim id. */
function orderParticipants(claims: readonly NormalizedEvidenceClaim[]): NormalizedEvidenceClaim[] {
  return [...claims].sort((left, right) => {
    const leftKey = [left.derivation.derivationFamilyRootArtifactId, left.sourceArtifactId, left.readingChannel, left.claimId].join("\u0000");
    const rightKey = [right.derivation.derivationFamilyRootArtifactId, right.sourceArtifactId, right.readingChannel, right.claimId].join("\u0000");
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

export function projectFinding(input: {
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string;
  createdAt: string;
  draft: FindingDraft;
}): ProjectedFinding {
  const ordered = orderParticipants(input.draft.participants).slice(0, CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding);
  const truncated = input.draft.truncated || input.draft.participants.length > ordered.length;
  const familyKeys = [...new Set(ordered.map((claim) => claim.derivation.derivationFamilyRootArtifactId))];
  const canonicalClusterId = input.draft.clusterIds.length ? [...input.draft.clusterIds].sort()[0]! : null;

  const fingerprint = buildFindingFingerprint({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    findingKind: input.draft.findingKind,
    predicate: input.draft.predicate,
    subjectClusterId: canonicalClusterId,
    participantFamilyKeys: familyKeys,
    subjectKeys: input.draft.subjectKeys,
  });
  const findingId = buildFindingId({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, fingerprint });
  const signature = buildEvidenceSignature(
    ordered.map((claim) => ({
      claimId: claim.claimId,
      verbatimValue: claim.assertion.valueLiteral,
      unit: claim.assertion.unitLiteral,
      locator: claim.provenance.locator,
      sourceArtifactId: claim.sourceArtifactId,
      readingChannel: claim.readingChannel,
    })),
  );

  const participants: FindingParticipant[] = ordered.map((claim, index) => ({
    participantId: buildParticipantId({ findingId, claimId: claim.claimId }),
    findingId,
    ordinal: index + 1,
    claimId: claim.claimId,
    sourceArtifactId: claim.sourceArtifactId,
    derivationFamilyRootArtifactId: claim.derivation.derivationFamilyRootArtifactId,
    documentRole: "UNKNOWN",
    documentIdentityId: null,
    documentRevisionMembershipId: null,
    verbatimValue: claim.assertion.valueLiteral,
    sourceNumericView: claim.assertion.valueNumber,
    unit: claim.assertion.unitLiteral,
    unitDeclared: claim.assertion.unitDeclared,
    quantityOrigin: claim.assertion.quantityOrigin,
    locator: claim.provenance.locator,
    humanLocator: claim.provenance.humanLocator,
    citationId: claim.provenance.citationId,
    sourceKind: claim.sourceKind,
    readingChannel: claim.readingChannel,
    reliability: claim.provenance.reliability,
    confidence: claim.provenance.confidence,
    limitations: claim.provenance.limitations.slice(0, CROSS_DOCUMENT_BOUNDS.maxClaimLimitations),
  }));

  const limitations = [
    ...input.draft.limitations,
    ...(truncated ? [`participants were bounded to ${CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding}; more evidence exists for this subject`] : []),
  ].slice(0, 8);

  return {
    record: {
      findingId,
      companyId: input.companyId,
      comparisonScopeId: input.comparisonScopeId,
      comparisonRunId: input.comparisonRunId,
      fingerprint,
      findingKind: input.draft.findingKind,
      predicate: input.draft.predicate,
      subjectClusterId: canonicalClusterId,
      subjectKeys: [...new Set(input.draft.subjectKeys)].sort().slice(0, 8),
      participantFamilies: familyKeys,
      evidenceSignature: signature,
      statementTemplateKey: statementTemplateKeyForFindingKind(input.draft.findingKind),
      severity: severityForFindingKind(input.draft.findingKind),
      participantIds: participants.map((participant) => participant.participantId),
      limitations,
      truncated,
      projectorVersion: FINDING_PROJECTOR_VERSION,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
    participants,
  };
}

/**
 * Assigns document context to participants.
 *
 * The role is carried for organization and navigation ONLY. It never changes
 * the finding's kind, its severity, or its wording, which is why changing a
 * document role over identical evidence cannot change the finding.
 */
export function attachParticipantDocumentContext(participants: readonly FindingParticipant[], context: ReadonlyMap<string, { documentRole: string; documentIdentityId: string | null; membershipId: string | null }>): FindingParticipant[] {
  return participants.map((participant) => {
    const entry = context.get(participant.sourceArtifactId);
    if (!entry) return participant;
    return { ...participant, documentRole: entry.documentRole, documentIdentityId: entry.documentIdentityId, documentRevisionMembershipId: entry.membershipId };
  });
}
