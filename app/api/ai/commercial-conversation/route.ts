import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { applyCanonicalIntelligence, ConversationalDraftEngine, type AdvanceConversationInput, type ConversationBuildMode, type ConversationDocumentMode, type DraftAttachment, type WorkingCommercialDraft } from "@/src/application/commercial-conversation";
import { createAISalesAssistantService } from "@/src/infrastructure/ai/createAISalesAssistantService";

const operations = new Set(["QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER", "DRAWING_TAKEOFF"]);
const sources = new Set(["TEXT", "VOICE", "CHIP"]);
const documentModes = new Set(["AUTO", "QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER"]);
const buildModes = new Set(["AUTO", "CATALOG_ONLY", "SUPPLY_INSTALL_SYSTEM", "DRAWING"]);

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.reply !== "string" || body.reply.trim().length < 2 || body.reply.length > 4000) throw ApiError.badRequest("CONVERSATION_REPLY_INVALID", "reply must contain 2 to 4000 characters.");
  if (body.locale !== "ar" && body.locale !== "en") throw ApiError.badRequest("CONVERSATION_LOCALE_INVALID", "locale must be ar or en.");
  if (!sources.has(String(body.replySource))) throw ApiError.badRequest("CONVERSATION_SOURCE_INVALID", "replySource must be TEXT, VOICE, or CHIP.");
  if (body.operation != null && !operations.has(String(body.operation))) throw ApiError.badRequest("CONVERSATION_OPERATION_INVALID", "Unsupported commercial operation.");
  if (body.documentMode != null && !documentModes.has(String(body.documentMode))) throw ApiError.badRequest("CONVERSATION_DOCUMENT_MODE_INVALID", "Unsupported document selector.");
  if (body.buildMode != null && !buildModes.has(String(body.buildMode))) throw ApiError.badRequest("CONVERSATION_BUILD_MODE_INVALID", "Unsupported build selector.");

  try {
    const documentMode = (body.documentMode ?? "AUTO") as ConversationDocumentMode;
    const buildMode = (body.buildMode ?? "AUTO") as ConversationBuildMode;
    const selectedOperation = buildMode === "DRAWING" ? "DRAWING_TAKEOFF" : documentMode === "AUTO" ? body.operation : documentMode;
    let draft = new ConversationalDraftEngine().advance({
      draft: (body.draft ?? null) as WorkingCommercialDraft | null,
      reply: body.reply,
      replySource: body.replySource as AdvanceConversationInput["replySource"],
      locale: body.locale,
      operation: selectedOperation as AdvanceConversationInput["operation"],
      attachment: body.attachment as DraftAttachment | null | undefined,
      documentMode,
      buildMode,
    });
    if (draft.operation !== "SALES_ORDER" && draft.operation !== "DRAWING_TAKEOFF") {
      const proposal = await createAISalesAssistantService().generateDraftProposal({
        companyId: company.companyId,
        prompt: draft.contextText,
        sourceLocale: draft.locale,
        buildMode: buildMode === "DRAWING" ? "AUTO" : buildMode,
      });
      draft = applyCanonicalIntelligence(draft, proposal);
    }
    return apiSuccess(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_REQUIRED") throw ApiError.badRequest(error.message, "A supported commercial operation is required.");
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_IMMUTABLE") throw ApiError.conflict(error.message, "A working draft cannot silently change document type.");
    throw error;
  }
});
