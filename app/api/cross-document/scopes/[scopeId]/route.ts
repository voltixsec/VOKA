import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { getComparisonStatus } from "@/src/application/cross-document/ReadModels";
import { setRevisionPolicyUseCase, setRoleUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";

/**
 * Phase 2A-10 scope status and explicit scope edits.
 *
 * GET returns the truthful readiness, the latest run, and every block reason.
 * PATCH changes a revision policy or one artifact's document role. A document
 * role organizes and filters; it never selects a winner, never makes a source
 * authoritative, and never changes a finding's severity.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request);
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const status = await getComparisonStatus({ companyId: company.companyId, store: context.store, locale: context.locale, comparisonScopeId });
  if (!status) throw new ApiError(404, "CROSS_DOCUMENT_SCOPE_NOT_FOUND", "The comparison scope was not found for the active company.");
  return apiSuccess({
    comparisonScopeId,
    readiness: status.readiness,
    blockReasons: status.blockReasons,
    revisionPolicy: status.scope.revisionPolicy,
    claimCount: status.latestRun?.claimCount ?? 0,
    findingCount: status.latestRun?.findingCount ?? 0,
    latestRun: status.latestRun
      ? {
        comparisonRunId: status.latestRun.comparisonRunId,
        status: status.latestRun.status,
        startedAt: status.latestRun.startedAt,
        finishedAt: status.latestRun.finishedAt,
        engineVersion: status.latestRun.engineVersion,
        truncated: status.latestRun.truncated,
        limitations: status.latestRun.limitations,
        inputDigest: status.latestRun.inputDigest,
      }
      : null,
  }, { headers: NO_STORE });
});

export const PATCH = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request);
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "CROSS_DOCUMENT_BODY_INVALID", "A JSON body is required.");
  }
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  if (typeof payload.revisionPolicy === "string") {
    const result = await setRevisionPolicyUseCase({ ...context, comparisonScopeId, revisionPolicy: payload.revisionPolicy });
    if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
    return apiSuccess({ revisionPolicy: result.value.revisionPolicy }, { headers: NO_STORE });
  }
  if (typeof payload.artifactId === "string" && typeof payload.documentRole === "string") {
    const result = await setRoleUseCase({
      ...context,
      comparisonScopeId,
      artifactId: payload.artifactId,
      documentRole: payload.documentRole,
      declared: payload.declared !== false,
    });
    if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
    return apiSuccess(result.value, { headers: NO_STORE });
  }
  throw new ApiError(400, "CROSS_DOCUMENT_PATCH_INVALID", "Provide either revisionPolicy, or artifactId with documentRole.");
});
