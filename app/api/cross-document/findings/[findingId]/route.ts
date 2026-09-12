import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { getFindingDetail } from "@/src/application/cross-document/ReadModels";
import { listFindingParticipants, listFindingReviewHistory } from "@/src/application/cross-document/FindingReviewService";

/**
 * GET /api/cross-document/findings/<findingId>
 *
 * The full review view of one finding: the bilingual statement, every
 * participant with its verbatim value, unit, locator and citation, the current
 * evidence signature, the engine-owned staleness flags, and the human review
 * history. There is no approved value, no winner, and no preferred source in
 * this payload, and there never will be.
 */

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const findingId = pathSegment(request);
  if (!findingId) throw new ApiError(400, "CROSS_DOCUMENT_FINDING_REQUIRED", "A finding id is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const detail = await getFindingDetail({ companyId: company.companyId, store: context.store, locale: context.locale, findingId });
  if (!detail) throw new ApiError(404, "CROSS_DOCUMENT_FINDING_NOT_FOUND", "The finding was not found for the active company.");
  const events = await listFindingReviewHistory({ companyId: company.companyId, store: context.store, findingId });
  const participants = await listFindingParticipants({ companyId: company.companyId, store: context.store, findingId });
  return apiSuccess({
    finding: {
      findingId: detail.findingId,
      findingKind: detail.findingKind,
      findingKindLabel: detail.findingKindLabel,
      severity: detail.severity,
      statement: detail.statement,
      subjectClusterId: detail.subjectClusterId,
      subjectKeys: detail.subjectKeys,
      reviewState: detail.reviewState,
      reviewStateLabel: detail.reviewStateLabel,
      engineFlags: { reproduced: detail.reproduced, stale: detail.stale, staleReason: detail.staleReason, staleReasonLabel: detail.staleReasonLabel, evidenceChanged: detail.evidenceChanged },
      evidenceSignatureHash: detail.evidenceSignatureHash,
      participantFamilies: detail.participantFamilies,
      limitations: detail.localized.limitations,
      truncated: detail.truncated,
      participants,
      reviewHistory: events,
    },
  }, { headers: NO_STORE });
});
