import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { decideActiveRevisionUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";
import { listActiveRevisionDecisionHistory } from "@/src/application/cross-document/ReadModels";
import { isActiveRevisionDecisionStatus } from "@/src/domain/cross-document";

/**
 * The active-revision governance surface.
 *
 * GET  — the append-only decision history.
 * POST — record a decision. Only a human act can select an active revision: the
 *        comparison engine may identify candidates but never chooses one, and
 *        incompatible actives block comparison readiness instead of being
 *        silently compared as current.
 *
 * Recording a decision creates no downstream object and approves no quantity.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const documentIdentityId = pathSegment(request, 1);
  if (!documentIdentityId) throw new ApiError(400, "CROSS_DOCUMENT_DOCUMENT_REQUIRED", "A document identity id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const history = await listActiveRevisionDecisionHistory({ companyId: company.companyId, store: context.store, locale: context.locale, documentIdentityId, limit: 50 });
  return apiSuccess({ documentIdentityId, history }, { headers: NO_STORE });
});

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const documentIdentityId = pathSegment(request, 1);
  if (!documentIdentityId) throw new ApiError(400, "CROSS_DOCUMENT_DOCUMENT_REQUIRED", "A document identity id is required.");
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "CROSS_DOCUMENT_BODY_INVALID", "A JSON body is required.");
  }
  const status = typeof payload.status === "string" ? payload.status : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
  if (!isActiveRevisionDecisionStatus(status)) throw new ApiError(400, "CROSS_DOCUMENT_DECISION_STATUS_INVALID", "The decision status is not one this phase implements.");
  const selectedMembershipIds = Array.isArray(payload.selectedMembershipIds)
    ? payload.selectedMembershipIds.filter((item): item is string => typeof item === "string").slice(0, 64)
    : [];
  const evidenceClaimIds = Array.isArray(payload.evidenceClaimIds)
    ? payload.evidenceClaimIds.filter((item): item is string => typeof item === "string").slice(0, 64)
    : [];
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const result = await decideActiveRevisionUseCase({
    ...context,
    command: {
      documentIdentityId,
      status,
      selectedMembershipIds,
      evidenceClaimIds,
      reason,
      decidedAt: new Date().toISOString(),
      comparisonScopeId: typeof payload.comparisonScopeId === "string" ? payload.comparisonScopeId : null,
    },
  });
  if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
  const value = result.value;
  if (!value.ok) throw new ApiError(400, value.code, value.problem);
  return apiSuccess({
    documentIdentityId,
    decisionId: value.decision.decisionId,
    decisionVersion: value.decision.decisionVersion,
    status: value.decision.status,
    recordsApprovedQuantity: false,
    createsDownstreamObject: false,
  }, { status: 201, headers: NO_STORE });
});
