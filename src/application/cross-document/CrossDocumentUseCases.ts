/**
 * Phase 2A-10 use cases: the application boundary the API routes call.
 *
 * Every use case is company-scoped, bounded, and read-only unless the operation
 * is an explicit human act (creating a scope, setting a role, recording an
 * active-revision decision, or transitioning a review state). None of them
 * creates or mutates a Requirement, a takeoff line, a BOM line, a quotation
 * line, a product selection, a supplier record, a procurement requirement, an
 * RFQ, an offer, an award, or a purchase order, and none of them exposes an
 * approved quantity, a winner, or a preferred value.
 */

import type { ActiveRevisionDecisionCommand } from "./ActiveRevisionDecisionService";
import { applyActiveRevisionDecision, listRevisionCandidates } from "./ActiveRevisionDecisionService";
import { runCrossDocumentComparison, type ComparisonDependencies } from "./ComparisonRunService";
import { buildCrossDocumentHandoff, type HandoffBundle } from "./CrossDocumentHandoff";
import { listFindingParticipants, listFindingReviewHistory, transitionFindingReview, type ReviewTransitionResult } from "./FindingReviewService";
import { createComparisonScope, setDocumentRole, setRevisionPolicy } from "./ScopeService";
import { getComparisonStatus, getFindingDetail, listComparisonRuns, listFindings, listLineage, listClaims, getClaim, getClaimProvenance } from "./ReadModels";
import type { CrossDocumentStore } from "./ports";
import { getActiveRevisionDecision, listActiveRevisionDecisionHistory, listDocumentIdentities, listDocumentRelations, listRevisionMemberships, listSubjectClusters, listSubjectMatches } from "./ReadModels";
import type { Locale } from "@/src/domain/cross-document";

export type CrossDocumentContext = {
  companyId: string;
  actorUserId: string;
  locale: Locale;
  store: CrossDocumentStore;
  dependencies: ComparisonDependencies;
};

export type UseCaseResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; problem: string };

const ok = <T>(value: T): UseCaseResult<T> => ({ ok: true, value });
const fail = <T>(status: number, code: string, problem: string): UseCaseResult<T> => ({ ok: false, status, code, problem });

/** Creates a durable comparison scope. Nothing is inferred from filenames. */
export async function createScopeUseCase(input: CrossDocumentContext & {
  name: string;
  context: string;
  projectKey?: string | null;
  revisionPolicy?: string;
  predicateFilters?: readonly string[];
  roleFilters?: readonly string[];
  artifactIds?: readonly string[];
}): Promise<UseCaseResult<{ comparisonScopeId: string }>> {
  const outcome = await createComparisonScope({
    store: input.store,
    command: {
      companyId: input.companyId,
      createdByUserId: input.actorUserId,
      name: input.name,
      context: input.context,
      projectKey: input.projectKey ?? null,
      revisionPolicy: input.revisionPolicy as never,
      predicateFilters: input.predicateFilters ?? [],
      roleFilters: input.roleFilters as never,
      artifactIds: input.artifactIds ?? [],
      createdAt: new Date().toISOString(),
    },
  });
  if (!outcome.ok) return fail(400, "SCOPE_REFUSED", outcome.problem);
  return ok({ comparisonScopeId: outcome.scope.comparisonScopeId });
}

export async function setRoleUseCase(input: CrossDocumentContext & {
  comparisonScopeId: string;
  artifactId: string;
  documentRole: string;
  declared: boolean;
}): Promise<UseCaseResult<{ documentRole: string; documentRoleSource: string }>> {
  const updated = await setDocumentRole({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    artifactId: input.artifactId,
    documentRole: input.documentRole as never,
    documentRoleSource: input.declared ? "USER_DECLARED" : "OBSERVED_FROM_CONTENT",
    declaredByUserId: input.declared ? input.actorUserId : null,
    store: input.store,
  });
  if (!updated) return fail(404, "SCOPE_ARTIFACT_NOT_FOUND", "The artifact is not part of this comparison scope for the active company.");
  return ok({ documentRole: updated.documentRole, documentRoleSource: updated.documentRoleSource });
}

export async function setRevisionPolicyUseCase(input: CrossDocumentContext & {
  comparisonScopeId: string;
  revisionPolicy: string;
}): Promise<UseCaseResult<{ revisionPolicy: string }>> {
  const updated = await setRevisionPolicy({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    revisionPolicy: input.revisionPolicy as never,
    updatedAt: new Date().toISOString(),
    store: input.store,
  });
  if (!updated) return fail(400, "REVISION_POLICY_REFUSED", "The revision policy is not one this phase implements, or the scope was not found.");
  return ok({ revisionPolicy: updated.revisionPolicy });
}

export async function runComparisonUseCase(input: CrossDocumentContext & {
  comparisonScopeId: string;
  decisions?: readonly ActiveRevisionDecisionCommand[];
}): Promise<UseCaseResult<Awaited<ReturnType<typeof runCrossDocumentComparison>>>> {
  const scope = await input.store.findScope({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
  if (!scope) return fail(404, "SCOPE_NOT_FOUND", "The comparison scope was not found for the active company.");
  const result = await runCrossDocumentComparison({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    actorUserId: input.actorUserId,
    dependencies: input.dependencies,
    decisions: input.decisions,
  });
  return ok(result);
}

export async function reviewFindingUseCase(input: CrossDocumentContext & {
  findingId: string;
  toState: string;
  reason: string;
}): Promise<UseCaseResult<ReviewTransitionResult>> {
  const result = await transitionFindingReview({
    store: input.store,
    command: {
      companyId: input.companyId,
      findingId: input.findingId,
      actorUserId: input.actorUserId,
      toState: input.toState as never,
      reason: input.reason,
      at: new Date().toISOString(),
    },
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return fail(status, result.code ?? "REVIEW_REFUSED", result.problem ?? "The review transition was refused.");
  }
  return ok(result);
}

export async function decideActiveRevisionUseCase(input: CrossDocumentContext & {
  command: Omit<ActiveRevisionDecisionCommand, "companyId" | "actorUserId">;
}): Promise<UseCaseResult<Awaited<ReturnType<typeof applyActiveRevisionDecision>>>> {
  const result = await applyActiveRevisionDecision({
    store: input.store,
    command: { ...input.command, companyId: input.companyId, actorUserId: input.actorUserId },
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return fail(status, result.code ?? "DECISION_REFUSED", result.problem);
  }
  return ok(result);
}

export async function listRevisionCandidateUseCase(input: CrossDocumentContext & { documentIdentityId: string }): Promise<UseCaseResult<Awaited<ReturnType<typeof listRevisionCandidates>>>> {
  const identity = await input.store.findDocumentIdentity({ companyId: input.companyId, documentIdentityId: input.documentIdentityId });
  if (!identity) return fail(404, "DOCUMENT_IDENTITY_NOT_FOUND", "The document identity was not found for the active company.");
  return ok(await listRevisionCandidates({ companyId: input.companyId, documentIdentityId: input.documentIdentityId, store: input.store }));
}

export async function handoffUseCase(input: CrossDocumentContext & { comparisonScopeId: string }): Promise<UseCaseResult<HandoffBundle>> {
  const bundle = await buildCrossDocumentHandoff({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, store: input.store });
  if (!bundle) return fail(404, "SCOPE_NOT_FOUND", "The comparison scope was not found for the active company.");
  return ok(bundle);
}

/**
 * The read surface, in one place, so a route never assembles its own query.
 * Every entry is company-scoped and locale-aware, and every raw token is
 * rendered through the bilingual label tables.
 */
export const readSurface = {
  status: getComparisonStatus,
  runs: listComparisonRuns,
  claims: listClaims,
  claim: getClaim,
  claimProvenance: getClaimProvenance,
  findings: listFindings,
  finding: getFindingDetail,
  participants: listFindingParticipants,
  reviewHistory: listFindingReviewHistory,
  matches: listSubjectMatches,
  clusters: listSubjectClusters,
  lineage: listLineage,
  documents: listDocumentIdentities,
  memberships: listRevisionMemberships,
  relations: listDocumentRelations,
  activeRevision: getActiveRevisionDecision,
  activeRevisionHistory: listActiveRevisionDecisionHistory,
};
