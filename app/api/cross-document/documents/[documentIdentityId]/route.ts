import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { listRevisionCandidates } from "@/src/application/cross-document/ActiveRevisionDecisionService";
import { listActiveRevisionDecisionHistory, listDocumentRelations, listRevisionMemberships } from "@/src/application/cross-document/ReadModels";

/**
 * GET /api/cross-document/documents/<documentIdentityId>
 *
 * One governed document identity: its observed family key (non-unique by
 * design, so ambiguity survives), its revision memberships, its relations, its
 * revision CANDIDATES, and its append-only decision history.
 *
 * The candidates are candidates: this payload never recommends one.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const documentIdentityId = pathSegment(request);
  if (!documentIdentityId) throw new ApiError(400, "CROSS_DOCUMENT_DOCUMENT_REQUIRED", "A document identity id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const identity = await context.store.findDocumentIdentity({ companyId: company.companyId, documentIdentityId });
  if (!identity) throw new ApiError(404, "CROSS_DOCUMENT_DOCUMENT_NOT_FOUND", "The document identity was not found for the active company.");
  const [memberships, relations, decisions, candidateView] = await Promise.all([
    listRevisionMemberships({ companyId: company.companyId, store: context.store, locale: context.locale, documentIdentityId, limit: 64 }),
    listDocumentRelations({ companyId: company.companyId, store: context.store, locale: context.locale, documentIdentityId, limit: 64 }),
    listActiveRevisionDecisionHistory({ companyId: company.companyId, store: context.store, locale: context.locale, documentIdentityId, limit: 50 }),
    listRevisionCandidates({ companyId: company.companyId, documentIdentityId, store: context.store }),
  ]);
  return apiSuccess({
    documentIdentity: {
      documentIdentityId: identity.documentIdentityId,
      kind: identity.kind,
      label: identity.label,
      observedFamilyKey: identity.observedFamilyKey,
      identityBasis: identity.identityBasis,
      ambiguous: identity.ambiguous,
      limitations: identity.limitations,
      evidence: identity.evidence,
    },
    memberships,
    relations,
    revisionCandidates: candidateView.candidates,
    activeRevisionHistory: decisions,
    latestDecisionStatus: candidateView.latestDecision?.status ?? "UNDECIDED",
  }, { headers: NO_STORE });
});
