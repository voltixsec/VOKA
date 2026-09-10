import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import type { ConversationRuntimeState } from "@/src/application/conversation-runtime";
import { createConversationRuntime } from "@/src/infrastructure/ai/createConversationRuntime";
import { signCommercialHandoff } from "@/src/infrastructure/ai/CommercialHandoffToken";
import { signConversationState, verifyConversationState } from "@/src/infrastructure/ai/ConversationStateToken";

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action === "RECONCILE" ? "RECONCILE" as const : "TURN" as const;
  const message = action === "RECONCILE"
    ? "Reconcile the full conversation into the governed workspace using the user's latest corrections and approvals."
    : typeof body.message === "string" ? body.message.trim() : "";
  const attachment = parseAttachment(body.attachment);
  if ((!message && !attachment?.id) || message.length > 4_000) throw ApiError.badRequest("CONVERSATION_RUNTIME_MESSAGE_INVALID", "message must contain 1 to 4000 characters.");
  if (body.locale !== "ar" && body.locale !== "en") throw ApiError.badRequest("CONVERSATION_RUNTIME_LOCALE_INVALID", "locale must be ar or en.");
  if (body.source !== "TEXT" && body.source !== "VOICE" && body.source !== "CHIP") throw ApiError.badRequest("CONVERSATION_RUNTIME_SOURCE_INVALID", "source is invalid.");
  if (action === "RECONCILE" && !body.state) throw ApiError.badRequest("CONVERSATION_STATE_REQUIRED", "A conversation state is required for reconciliation.");
  const runtime = createConversationRuntime();
  if (!runtime) throw new ApiError(503, "CONVERSATION_BRAIN_NOT_CONFIGURED", "The conversational AI runtime is not configured.");
  let priorState: ConversationRuntimeState | null = null;
  if (body.state) {
    const supplied = body.state as ConversationRuntimeState;
    if (typeof supplied.stateToken !== "string" || !supplied.stateToken) throw ApiError.forbidden("CONVERSATION_STATE_INVALID", "The conversation state cannot be verified.");
    try { priorState = await verifyConversationState(supplied.stateToken, company.companyId); }
    catch { throw ApiError.forbidden("CONVERSATION_STATE_INVALID", "The conversation state is invalid or belongs to another company."); }
  }
  const state = await runtime.execute({ state: priorState, message, locale: body.locale, source: body.source, attachment, companyId: company.companyId, userId: _auth.user.id, action });
  if (state.handoff) state.handoffToken = await signCommercialHandoff(state.handoff, company.companyId);
  state.stateToken = await signConversationState(state, company.companyId);
  return apiSuccess(state, { headers: { "Cache-Control": "private, no-store" } });
});

function parseAttachment(value: unknown): { id: string; name: string; type: string; size: number } | null {
  if (value == null) return null;
  if (typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id.trim()
    || !("name" in value) || typeof value.name !== "string" || !("type" in value) || typeof value.type !== "string"
    || !("size" in value) || typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 1) {
    throw ApiError.badRequest("SOURCE_ARTIFACT_REFERENCE_INVALID", "A stored artifact reference is required.");
  }
  return { id: value.id, name: value.name, type: value.type, size: value.size };
}
