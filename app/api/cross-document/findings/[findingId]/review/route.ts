import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { NO_STORE, contextFor, pathSegment } from "@/lib/cross-document/route-context";
import { reviewFindingUseCase } from "@/src/application/cross-document/CrossDocumentUseCases";

/**
 * POST /api/cross-document/findings/<findingId>/review
 *
 * The ONLY path that changes a human review state. It is append-only: every
 * transition writes an audit event before the state moves, reopening a RESOLVED
 * or DISMISSED finding requires an explicit reason, and the comparison engine
 * has no route to this endpoint's behaviour (it cannot even call the store
 * method that writes the state).
 *
 * Resolution is not approval: the response says plainly that no approved
 * quantity, no winning side, and no correct value were recorded.
 */

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const findingId = pathSegment(request, 1);
  if (!findingId) throw new ApiError(400, "CROSS_DOCUMENT_FINDING_REQUIRED", "A finding id is required.");
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "CROSS_DOCUMENT_BODY_INVALID", "A JSON body is required.");
  }
  const toState = typeof payload.reviewState === "string" ? payload.reviewState : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
  if (!toState) throw new ApiError(400, "CROSS_DOCUMENT_REVIEW_STATE_REQUIRED", "A target review state is required.");
  const context = contextFor({ request, actorUserId: auth.user.id, company });
  const result = await reviewFindingUseCase({ ...context, findingId, toState, reason });
  if (!result.ok) throw new ApiError(result.status, result.code, result.problem);
  const value = result.value;
  if (!value.ok) throw new ApiError(400, value.code, value.problem);
  return apiSuccess({
    findingId,
    fromState: value.fromState,
    reviewState: value.toState,
    reviewEventId: value.event.eventId,
    // Resolution is not approval. The response states the boundary explicitly
    // so no consumer can read an approval into it.
    resolution: {
      resolvesFinding: true,
      recordsApprovedQuantity: false,
      recordsWinningSide: false,
      recordsCorrectValue: false,
      mutatesEngineeringOrCommercialData: false,
    },
  }, { headers: NO_STORE });
});
