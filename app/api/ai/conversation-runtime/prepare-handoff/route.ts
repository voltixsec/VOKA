import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { buildSystemConfigurationGraph, type CommercialSolutionHandoff, type ConfirmedFact, type ConversationRuntimeState } from "@/src/application/conversation-runtime";
import { signCommercialHandoff } from "@/src/infrastructure/ai/CommercialHandoffToken";
import { verifyConversationState } from "@/src/infrastructure/ai/ConversationStateToken";

const TRUSTED = new Set(["USER_EXPLICIT", "USER_APPROVED", "USER_CORRECTION", "VERIFIED_DOCUMENT", "VERIFIED_DATABASE", "TRUSTED_PROFILE", "DETERMINISTIC_DERIVATION"]);

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const body = await request.json().catch(() => ({})) as { state?: ConversationRuntimeState };
  const supplied = body.state;
  let state: ConversationRuntimeState;
  if (!supplied || typeof supplied.stateToken !== "string" || !supplied.stateToken) throw ApiError.forbidden("CONVERSATION_STATE_INVALID", "The conversation state cannot be verified.");
  try { state = await verifyConversationState(supplied.stateToken, company.companyId); }
  catch { throw ApiError.forbidden("CONVERSATION_STATE_INVALID", "The conversation state is invalid or belongs to another company."); }
  if (!state || state.version !== 1 || typeof state.runtimeId !== "string" || !Array.isArray(state.messages) || !state.confirmedFacts) throw ApiError.badRequest("INVALID_CONVERSATION_STATE", "A valid conversation state is required.");
  const userText = state.messages.filter((message) => message.role === "USER").map((message) => message.text.normalize("NFKC").toLocaleLowerCase());
  const confirmedFacts = Object.fromEntries(Object.entries(state.confirmedFacts).filter((entry): entry is [string, ConfirmedFact] => {
    const fact = entry[1];
    if (!fact || !TRUSTED.has(fact.provenance)) return false;
    if (fact.provenance === "USER_EXPLICIT" || fact.provenance === "USER_APPROVED" || fact.provenance === "USER_CORRECTION") return Boolean(fact.evidence?.trim()) && userText.some((message) => message.includes(fact.evidence.normalize("NFKC").toLocaleLowerCase()));
    return true;
  }));
  if (!confirmedFacts["system.identity"]) throw ApiError.badRequest("CONFIRMED_SYSTEM_REQUIRED", "A confirmed system is required.");
  if (!confirmedFacts["customer.name"]) throw ApiError.badRequest("CONFIRMED_CUSTOMER_REQUIRED", "A confirmed customer is required before opening a quotation Draft.");
  if (!confirmedFacts["system.jurisdiction"]) throw ApiError.badRequest("CONFIRMED_JURISDICTION_REQUIRED", "A confirmed jurisdiction is required before opening a quotation Draft.");
  const target = confirmedFacts["document.target"]?.value;
  if (typeof target === "string" && target !== "QUOTATION") throw new ApiError(409, "NOT_YET_CONNECTED", `${target} persistence is not connected to the clean conversation runtime yet.`);
  const graph = buildSystemConfigurationGraph(confirmedFacts);
  const commercialLines = graph.salesBom.map((line) => ({
    catalogItemId: line.catalogItemId ?? null, itemName: line.itemName, itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn,
    description: line.description ?? null, unitName: line.unitName, quantity: line.quantity, unitPrice: line.unitPrice, type: line.type,
    authority: line.provenance === "VERIFIED_CATALOG" ? "VERIFIED_DATABASE" as const : line.provenance === "RESEARCHED" ? "RESEARCHED" as const : "DETERMINISTIC_DERIVATION" as const,
    quantityState: line.quantityState, priceState: line.priceState, componentKeys: line.componentKeys, brand: line.brand ?? null, model: line.model ?? null,
  }));
  const createdAt = state.messages[0]?.createdAt ?? new Date().toISOString();
  const handoff: CommercialSolutionHandoff = { runtimeId: state.runtimeId, confirmedFacts, commercialLines, toolEvidence: state.toolResults.filter((result) => result.status === "COMPLETED"), createdAt };
  return apiSuccess({ handoffToken: await signCommercialHandoff(handoff, company.companyId) }, { headers: { "Cache-Control": "private, no-store" } });
});
