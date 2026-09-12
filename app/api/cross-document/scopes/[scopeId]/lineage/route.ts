import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { listLineage } from "@/src/application/cross-document/ReadModels";

/**
 * GET /api/cross-document/scopes/<scopeId>/lineage
 *
 * Read-only Phase 2A-9 lineage the comparison used: one derivation family is one
 * voice, and both warning channels stay separate. Nothing here writes a
 * derivation row.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request, 1);
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const lineage = await listLineage({ companyId: company.companyId, store: context.store, locale: context.locale, comparisonScopeId });
  return apiSuccess({ lineages: lineage }, { headers: NO_STORE });
});
