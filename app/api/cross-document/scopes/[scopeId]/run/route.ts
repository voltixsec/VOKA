import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { runComparisonUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";
import { isActiveRevisionDecisionStatus } from "@/src/domain/cross-document";
import type { ActiveRevisionDecisionCommand } from "@/src/application/cross-document/ActiveRevisionDecisionService";

/**
 * POST /api/cross-document/scopes/<scopeId>/run
 *
 * Runs one governed comparison. Explicit active-revision decisions may be
 * supplied and are applied BEFORE the run, so a decision recorded here is the
 * decision the run obeys. A blocked run still writes a run record: a reviewer
 * sees why nothing was compared instead of an empty result.
 *
 * The response contains evidence, not decisions: no approved quantity, no
 * winner, no preferred source, and no downstream object.
 */

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request, 1);
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const rawDecisions = Array.isArray(payload.decisions) ? payload.decisions.slice(0, 32) : [];
  const decisions = rawDecisions.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const documentIdentityId = typeof record.documentIdentityId === "string" ? record.documentIdentityId : "";
    const status = typeof record.status === "string" ? record.status : "";
    const reason = typeof record.reason === "string" ? record.reason : "";
    if (!documentIdentityId || !isActiveRevisionDecisionStatus(status)) return [];
    const selectedMembershipIds = Array.isArray(record.selectedMembershipIds)
      ? record.selectedMembershipIds.filter((item): item is string => typeof item === "string").slice(0, 64)
      : [];
    const evidenceClaimIds = Array.isArray(record.evidenceClaimIds)
      ? record.evidenceClaimIds.filter((item): item is string => typeof item === "string").slice(0, 64)
      : [];
    return [{
      companyId: company.companyId,
      actorUserId: auth.user.id,
      documentIdentityId,
      comparisonScopeId,
      status,
      selectedMembershipIds,
      evidenceClaimIds,
      reason,
      decidedAt: new Date().toISOString(),
    } satisfies ActiveRevisionDecisionCommand];
  });

  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const result = await runComparisonUseCase({ ...context, comparisonScopeId, decisions });
  if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
  const run = result.value;
  return apiSuccess({
    comparisonRunId: run.comparisonRunId,
    status: run.status,
    readiness: run.blockReasons.length ? "BLOCKED" : "READY",
    blockReasons: run.blockReasons,
    claimCount: run.claimCount,
    matchCount: run.matchCount,
    clusterCount: run.clusterCount,
    findingCount: run.findingCount,
    newFindingCount: run.newFindingCount,
    reproducedFindingCount: run.reproducedFindingCount,
    notReproducedFindingCount: run.notReproducedFindingCount,
    voiceCount: run.voiceCount,
    truncated: run.truncated,
    limitations: run.limitations,
  }, { headers: NO_STORE });
});
