import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { handoffUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";

/**
 * GET /api/cross-document/scopes/<scopeId>/handoff
 *
 * The stable read contract Phase 2A-11 consumes: claims, subject matches and
 * clusters, findings, document identities, revision memberships, active
 * revision decisions, lineage, coverage, staleness, block reasons, and
 * citations — and nothing downstream. The bundle explicitly declares which
 * fields it does not expose.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request, 1);
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const result = await handoffUseCase({ ...context, comparisonScopeId });
  if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
  return apiSuccess({ handoff: result.value, contractVersion: "2a-10.handoff.v1" }, { headers: NO_STORE });
});
