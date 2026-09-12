import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { listFindings } from "@/src/application/cross-document/ReadModels";

/**
 * GET /api/cross-document/scopes/<scopeId>/findings
 *
 * The review list. Findings are never deleted when they stop reproducing: a
 * stale finding stays visible with its engine-owned stale reason. Human review
 * state is reported, never computed.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request, 1);
  const search = new URL(request.url).searchParams;
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const staleParam = search.get("stale");
  const limit = Number(search.get("limit") ?? "50");
  const findings = await listFindings({
    companyId: company.companyId,
    store: context.store,
    locale: context.locale,
    comparisonScopeId: comparisonScopeId || undefined,
    findingKind: search.get("findingKind") ?? undefined,
    reviewState: search.get("reviewState") ?? undefined,
    stale: staleParam === null ? undefined : staleParam === "true",
    limit: Number.isFinite(limit) ? limit : 50,
  });
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  return apiSuccess({ findings, count: findings.length }, { headers: NO_STORE });
});
