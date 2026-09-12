import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { listClaims } from "@/src/application/cross-document/ReadModels";

/**
 * GET /api/cross-document/scopes/<scopeId>/claims
 *
 * The persisted immutable claims for a scope, with their exact locators. A
 * claim is always OBSERVED_NOT_APPROVED and CROSS_DOCUMENT_COMPARISON_ONLY, and
 * its verbatim literal is never rewritten.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const comparisonScopeId = pathSegment(request, 1);
  if (!comparisonScopeId) throw new ApiError(400, "CROSS_DOCUMENT_SCOPE_REQUIRED", "A comparison scope id is required.");
  const search = new URL(request.url).searchParams;
  const limit = Number(search.get("limit") ?? "200");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const claims = await listClaims({
    companyId: company.companyId,
    store: context.store,
    locale: context.locale,
    comparisonScopeId,
    sourceArtifactId: search.get("sourceArtifactId") ?? undefined,
    predicate: search.get("predicate") ?? undefined,
    subjectMatchKey: search.get("subjectMatchKey") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  });
  return apiSuccess({
    claims: claims.map((claim) => ({
      claimId: claim.claimId,
      sourceArtifactId: claim.sourceArtifactId,
      readingChannel: claim.readingChannel,
      predicate: claim.assertion.predicate,
      predicateLabel: claim.predicateLabel,
      subjectMatchKey: claim.subject.subjectMatchKey,
      subjectLabel: claim.subject.subjectLabel,
      valueLiteral: claim.assertion.valueLiteral,
      valueNumber: claim.assertion.valueNumber,
      unitLiteral: claim.assertion.unitLiteral,
      quantityOrigin: claim.assertion.quantityOrigin,
      quantityOriginLabel: claim.quantityOriginLabel,
      locator: claim.provenance.locator,
      humanLocator: claim.provenance.humanLocator,
      pageNumber: claim.provenance.pageNumber,
      reliability: claim.provenance.reliability,
      status: claim.status,
      purpose: claim.purpose,
    })),
  }, { headers: NO_STORE });
});
