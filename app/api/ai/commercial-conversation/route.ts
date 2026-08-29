import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { CompleteCommercialConversation, type CompleteConversationInput } from "@/src/application/commercial-conversation/CompleteCommercialConversation";
import { createAISalesAssistantService } from "@/src/infrastructure/ai/createAISalesAssistantService";
import { salesAssistantTurnTimingOptions } from "@/src/infrastructure/ai/salesAssistantTurnTiming";

const choices = {
  locale: ["ar", "en"], replySource: ["TEXT", "VOICE", "CHIP"],
  operation: ["QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER", "DRAWING_TAKEOFF"],
  documentMode: ["AUTO", "QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER"],
  buildMode: ["AUTO", "CATALOG_ONLY", "SUPPLY_INSTALL_SYSTEM", "DRAWING"],
};

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.reply !== "string" || !body.reply.trim() || body.reply.length > 4000) throw ApiError.badRequest("CONVERSATION_REPLY_INVALID", "reply must contain 1 to 4000 characters.");
  for (const [key, values] of Object.entries(choices)) {
    if ((body[key] != null || key === "locale" || key === "replySource") && !values.includes(String(body[key]))) throw ApiError.badRequest("CONVERSATION_INPUT_INVALID", `Invalid ${key}.`);
  }
  const input = body as unknown as CompleteConversationInput;
  const selectedCustomer = input.selection?.customer ?? input.draft?.selection?.customer;
  if (selectedCustomer && (typeof selectedCustomer.id !== "string" || typeof selectedCustomer.name !== "string" || selectedCustomer.name.length > 300)) throw ApiError.badRequest("SELECTION_INVALID", "Invalid customer selection.");
  try {
    const draft = await new CompleteCommercialConversation(createAISalesAssistantService(), salesAssistantTurnTimingOptions()).execute({ ...input, companyId: company.companyId });
    return apiSuccess(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_REQUIRED") throw ApiError.badRequest(error.message, "A supported commercial operation is required.");
    if (error instanceof Error && error.message === "CONVERSATION_OPERATION_IMMUTABLE") throw ApiError.conflict(error.message, "A working draft cannot silently change document type.");
    if (error instanceof Error && error.message === "CONVERSATION_ANSWER_INVALID") throw ApiError.badRequest(error.message, "Invalid field answer.");
    throw error;
  }
});
