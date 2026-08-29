import type { AISalesAssistantPort } from "../ai-sales-assistant/ports/AISalesAssistantPort";
import type { WorkingCommercialDraft } from "./types";

const internalTerms = /RESEARCHED|SYSTEM_PLANNED|PROVISIONAL_MODEL_CREATED|materializ|readiness|engineering review|catalog mapping|تحويل المتطلبات|المراجعة الهندسية|حالة الجاهزية/i;

function isRecommendation(text: string) {
  return /(?:إيه|ايه|ما|وش)\s*(?:هو\s*)?(?:الأفضل|الأنسب)|اختارلي|رشحلي|what(?:'s| is) best|recommend|choose for me/i.test(text);
}

function isUnknown(text: string) {
  return /مش\s*عارف|ما\s*أعرف|لا\s*أعلم|i\s*(?:do not|don't)\s*know|not sure/i.test(text);
}

function isContinue(text: string) {
  return /^(?:كمل|كمّل|تابع|استمر|continue|go on|carry on)[.!؟\s]*$/i.test(text.trim());
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
}

function responseIsGrounded(text: string, truth: Record<string, unknown>) {
  const serialized = JSON.stringify(truth);
  const allowedNumbers = new Set(serialized.match(/\d+(?:\.\d+)?/g) ?? []);
  if ((text.match(/\d+(?:\.\d+)?/g) ?? []).some((number) => !allowedNumbers.has(number))) return false;
  const hasVerifiedPrice = Array.isArray(truth.lines) && truth.lines.some((line) => typeof line === "object" && line && (line as { priceStatus?: string }).priceStatus === "VERIFIED");
  if (!hasVerifiedPrice && /(?:price|cost|سعر|تكلفة).{0,30}(?:KWD|USD|EUR|SAR|AED|د\.?\s*ك)/i.test(text)) return false;
  return true;
}

function fallback(draft: WorkingCommercialDraft, userMessage: string) {
  const ar = draft.locale === "ar";
  const plan = draft.systemWorkingPlan;
  const question = draft.activeQuestion ? (ar ? draft.activeQuestion.ar : draft.activeQuestion.en) : null;
  const researched = draft.canonicalProposal?.agenticState?.researchStatus === "COMPLETED";
  const vehicleClass = plan?.knownInputs.vehicleClass;
  const facts = Object.entries(plan?.knownInputs ?? {}).map(([key, value]) => `${key}: ${String(value)}`);

  if (isRecommendation(userMessage) || isUnknown(userMessage)) {
    if (plan && /vehicle|car|مصعد سيارات/i.test(plan.systemIdentity)) {
      return ar
        ? `أقدر أرشح لك تكوينًا مبدئيًا مناسبًا لـ${vehicleClass === "SUV" ? " سيارات SUV" : " الاستخدام المطلوب"}، مع أبواب وتحكم ووسائل أمان مناسبة لعدد الوقفات. الحمولة والأبعاد النهائية لا يصح اعتمادها من غير أبعاد البئر والمخطط. ${question ?? "لو عندك مخطط ارفعه وأنا أكمل عليه."}`
        : `I can recommend a preliminary configuration for ${vehicleClass === "SUV" ? "SUV use" : "the requested use"}, with doors, controls, and safety provisions suited to the stops. Final load and dimensions cannot be approved without the shaft dimensions or drawing. ${question ?? "Attach a drawing when available and I can continue from it."}`;
    }
    return ar
      ? `أقدر أقترح خيارًا مبدئيًا وأوضح الافتراضات، لكن لن أعتمد قيمة هندسية غير مؤكدة. ${question ?? "أكمل معك بالمعلومات المتاحة."}`
      : `I can suggest a preliminary option and make the assumptions clear, but I will not approve an uncertain engineering value. ${question ?? "I can continue with the information available."}`;
  }

  if (isContinue(userMessage)) {
    return ar ? `تمام، مكمل معاك من نفس السياق. ${question ?? "الملخص المبدئي محدث بالأسفل."}` : `All right, I’m continuing from the same context. ${question ?? "The preliminary summary below is up to date."}`;
  }

  const intro = researched
    ? (ar ? "راجعت المصادر المتاحة وحدثت التكوين المبدئي." : "I reviewed the available sources and updated the preliminary configuration.")
    : (ar ? "تمام، حدثت الطلب بالمعلومات الجديدة." : "Got it — I updated the request with the new information.");
  const context = facts.length ? (ar ? ` المؤكد حتى الآن: ${facts.join("، ")}.` : ` Confirmed so far: ${facts.join(", ")}.`) : "";
  return `${intro}${context}${question ? ` ${question}` : ""}`;
}

export async function generateGroundedResponse(input: {
  draft: WorkingCommercialDraft;
  userMessage: string;
  provider?: Pick<AISalesAssistantPort, "generateConversationResponse"> | null;
}) {
  const { draft, userMessage, provider } = input;
  const fallbackText = fallback(draft, userMessage);
  if (!provider?.generateConversationResponse) return { ar: fallbackText, en: fallbackText };
  const ledger = draft.transactionalState?.ledger.facts ?? {};
  const committedTruth = {
    facts: Object.fromEntries(Object.entries(ledger).map(([key, fact]) => [key, { value: fact.value, source: fact.source }])),
    system: draft.systemWorkingPlan,
    customer: draft.canonicalProposal?.customer ? {
      status: draft.canonicalProposal.customer.status,
      name: draft.canonicalProposal.customer.name ?? draft.canonicalProposal.customer.proposedCustomerName,
    } : null,
    lines: draft.canonicalProposal?.lines.map((line) => ({ name: line.itemName, quantity: line.quantity, priceStatus: line.unitPrice == null ? "PRICE_REQUIRED" : "VERIFIED" })) ?? [],
    research: draft.canonicalProposal?.agenticState?.provisionalSystem?.evidence.map((item) => ({ title: item.title, publisher: item.publisher })) ?? [],
  };
  try {
    const raw = await provider.generateConversationResponse({
      locale: draft.locale,
      userMessage,
      conversationHistory: (draft.conversationMessages ?? draft.turns.map((turn) => ({ role: turn.role ?? "USER", source: turn.source, text: turn.text }))).slice(-12).map((turn) => ({ role: turn.role, text: turn.text })),
      committedTruth,
      nextQuestion: draft.activeQuestion ? { ar: draft.activeQuestion.ar, en: draft.activeQuestion.en } : null,
      limitations: draft.canonicalProposal?.agenticState?.provisionalSystem?.limitations ?? [],
    });
    const text = safeText((raw as { text?: unknown })?.text);
    if (!text || internalTerms.test(text) || !responseIsGrounded(text, committedTruth)) return { ar: fallbackText, en: fallbackText };
    return { ar: text, en: text };
  } catch {
    return { ar: fallbackText, en: fallbackText };
  }
}
