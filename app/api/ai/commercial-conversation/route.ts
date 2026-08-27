import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { ConversationalDraftEngine, type AdvanceConversationInput, type DraftAttachment, type WorkingCommercialDraft } from "@/src/application/commercial-conversation";

const operations = new Set(["QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER", "DRAWING_TAKEOFF"]);
const sources = new Set(["TEXT", "VOICE", "CHIP"]);

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.reply !== "string" || body.reply.trim().length < 2 || body.reply.length > 4000) throw ApiError.badRequest("CONVERSATION_REPLY_INVALID", "reply must contain 2 to 4000 characters.");
  if (body.locale !== "ar" && body.locale !== "en") throw ApiError.badRequest("CONVERSATION_LOCALE_INVALID", "locale must be ar or en.");
  if (!sources.has(String(body.replySource))) throw ApiError.badRequest("CONVERSATION_SOURCE_INVALID", "replySource must be TEXT, VOICE, or CHIP.");
  if (body.operation != null && !operations.has(String(body.operation))) throw ApiError.badRequest("CONVERSATION_OPERATION_INVALID", "Unsupported commercial operation.");

  try {
    const draft = new ConversationalDraftEngine().advance({
      draft: (body.draft ?? null) as WorkingCommercialDraft | null,
      reply: body.reply,
      replySource: body.replySource as AdvanceConversationInput["replySource"],
      locale: body.locale,
      operation: body.operation as AdvanceConversationInput["operation"],
      attachment: body.attachment as DraftAttachment | null | undefined,
    });
    return apiSuccess(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_REQUIRED") throw ApiError.badRequest(error.message, "A supported commercial operation is required.");
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_IMMUTABLE") throw ApiError.conflict(error.message, "A working draft cannot silently change document type.");
    throw error;
  }
});
