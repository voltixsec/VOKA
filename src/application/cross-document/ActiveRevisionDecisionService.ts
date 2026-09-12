/**
 * Phase 2A-10: the audited ACTIVE REVISION DECISION command.
 *
 * The engine may identify candidates. It may NOT choose the active revision.
 * Only a human decision — recorded with an actor, a reason, an append-only
 * version, the exact evidence claims, and a link to the decision it supersedes
 * — can activate a revision.
 *
 * Every guard is tenant-safe: the identity, the memberships, and the evidence
 * claims must all belong to the calling company, and a membership from another
 * tenant is refused rather than silently linked.
 */

import type { ActiveRevisionDecisionRecord, ActiveRevisionDecisionStatus } from "@/src/domain/cross-document";
import { buildActiveRevisionDecision } from "./DocumentGovernance";
import type { CrossDocumentStore } from "./ports";

export type ActiveRevisionDecisionCommand = {
  companyId: string;
  documentIdentityId: string;
  comparisonScopeId: string | null;
  actorUserId: string;
  reason: string;
  status: ActiveRevisionDecisionStatus;
  selectedMembershipIds: readonly string[];
  evidenceClaimIds: readonly string[];
  blockedReason?: string | null;
  decidedAt: string;
};

export type ActiveRevisionDecisionResult =
  | { ok: true; decision: ActiveRevisionDecisionRecord }
  | { ok: false; problem: string; code: "NOT_FOUND" | "TENANT_MISMATCH" | "INVALID" };

/**
 * Records one decision version.
 *
 * The previous decision is preserved by id — it is never updated or deleted —
 * so the identity's governance history stays append-only and auditable.
 */
export async function applyActiveRevisionDecision(input: {
  command: ActiveRevisionDecisionCommand;
  store: CrossDocumentStore;
}): Promise<ActiveRevisionDecisionResult> {
  const { command, store } = input;
  const identity = await store.findDocumentIdentity({ companyId: command.companyId, documentIdentityId: command.documentIdentityId });
  if (!identity) return { ok: false, problem: "the document identity was not found for the active company", code: "NOT_FOUND" };

  const memberships = await store.listRevisionMemberships({ companyId: command.companyId, documentIdentityId: command.documentIdentityId, limit: 64 });
  const memberIds = new Set(memberships.map((membership) => membership.membershipId));
  for (const membershipId of command.selectedMembershipIds) {
    if (!memberIds.has(membershipId)) {
      return { ok: false, problem: "a selected revision membership does not belong to this company and document identity", code: "TENANT_MISMATCH" };
    }
  }
  for (const claimId of command.evidenceClaimIds) {
    const claim = await store.findClaim({ companyId: command.companyId, claimId });
    if (!claim) return { ok: false, problem: "an evidence claim does not belong to the active company", code: "TENANT_MISMATCH" };
  }

  const previous = await store.latestActiveRevisionDecision({ companyId: command.companyId, documentIdentityId: command.documentIdentityId });
  const outcome = buildActiveRevisionDecision({
    companyId: command.companyId,
    documentIdentityId: command.documentIdentityId,
    comparisonScopeId: command.comparisonScopeId,
    actorUserId: command.actorUserId,
    reason: command.reason,
    status: command.status,
    selectedMembershipIds: command.selectedMembershipIds,
    evidenceClaimIds: command.evidenceClaimIds,
    blockedReason: command.blockedReason ?? null,
    previousDecision: previous,
    decidedAt: command.decidedAt,
  });
  if (!outcome.ok) return { ok: false, problem: outcome.problem, code: "INVALID" };

  await store.appendActiveRevisionDecision(outcome.decision);
  return { ok: true, decision: outcome.decision };
}

/** Candidates the engine may OFFER for a decision; never a choice it makes. */
export type RevisionCandidate = {
  membershipId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  observedRevisionLabel: string | null;
  derivationFamilyRootArtifactId: string;
  documentRole: string;
  evidenceClaimIds: string[];
  notes: string[];
};

/**
 * Lists revision candidates for a document identity.
 *
 * The notes say what the evidence is and never which revision "should" be
 * active: recommending a revision would be the engine choosing, which this
 * phase forbids.
 */
export async function listRevisionCandidates(input: {
  companyId: string;
  documentIdentityId: string;
  store: CrossDocumentStore;
}): Promise<{ candidates: RevisionCandidate[]; latestDecision: ActiveRevisionDecisionRecord | null }> {
  const memberships = await input.store.listRevisionMemberships({ companyId: input.companyId, documentIdentityId: input.documentIdentityId, limit: 64 });
  const candidates: RevisionCandidate[] = [];
  for (const membership of memberships) {
    const claims = await input.store.listClaims({ companyId: input.companyId, sourceArtifactId: membership.sourceArtifactId, limit: 64 });
    candidates.push({
      membershipId: membership.membershipId,
      sourceArtifactId: membership.sourceArtifactId,
      artifactSha256: membership.artifactSha256,
      observedRevisionLabel: membership.observedRevisionLabel,
      derivationFamilyRootArtifactId: membership.derivationFamilyRootArtifactId,
      documentRole: membership.documentRole,
      evidenceClaimIds: claims.filter((claim) => claim.assertion.predicate === "REVISION_LABEL").map((claim) => claim.claimId),
      notes: [
        membership.observedRevisionLabel
          ? `the artifact declares the observed revision label '${membership.observedRevisionLabel}'`
          : "the artifact declares no revision label",
        "an observed label is evidence; selecting the active revision is your decision",
      ],
    });
  }
  const latestDecision = await input.store.latestActiveRevisionDecision({ companyId: input.companyId, documentIdentityId: input.documentIdentityId });
  return { candidates, latestDecision };
}
