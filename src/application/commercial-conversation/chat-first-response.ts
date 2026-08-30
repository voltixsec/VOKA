import { projectStructuredResult } from "./live-result";
import type { WorkingCommercialDraft } from "./types";

function isRecommendation(text: string) {
  return /(?:إيه|ايه|ما|وش)\s*(?:هو\s*)?(?:الأفضل|الأنسب)|اختارلي|رشحلي|what(?:'s| is) best|recommend|choose for me/i.test(text);
}

function isUnknown(text: string) {
  return /مش\s*عارف|ما\s*أعرف|لا\s*أعلم|i\s*(?:do not|don't)\s*know|not sure/i.test(text);
}

function isContinue(text: string) {
  return /^(?:كمل|كمّل|تابع|استمر|continue|go on|carry on)[.!؟\s]*$/i.test(text.trim());
}

function isResearchRequest(text: string) {
  return /(?:search|research|ابحث|دور\s+(?:على|في)|راجع\s+(?:المصادر|النت)|على\s+النت)/i.test(text);
}

function value(draft: WorkingCommercialDraft, key: string, locale: "ar" | "en") {
  const fact = projectStructuredResult(draft).summary.find((item) => item.key === key);
  return fact ? (locale === "ar" ? fact.valueAr ?? fact.value : fact.valueEn ?? fact.value) : null;
}

function join(items: string[], locale: "ar" | "en") {
  if (items.length < 2) return items[0] ?? "";
  const last = items.at(-1)!;
  return `${items.slice(0, -1).join(locale === "ar" ? "، " : ", ")}${locale === "ar" ? "، و" : ", and "}${last}`;
}

function boundedRecommendation(draft: WorkingCommercialDraft, locale: "ar" | "en") {
  const plan = draft.systemWorkingPlan;
  const question = draft.activeQuestion ? draft.activeQuestion[locale] : null;
  const vehicleClass = plan?.knownInputs.vehicleClass;
  if (plan && /vehicle|car|مصعد سيارات/i.test(plan.systemIdentity)) {
    return locale === "ar"
      ? `أقدر أرشح لك تكوينًا مبدئيًا مناسبًا${vehicleClass === "SUV" ? " لسيارات SUV" : " للاستخدام المطلوب"}، مع مجموعة رفع وتحكم وأبواب ووسائل أمان مناسبة لعدد الوقفات. لن أفترض الحمولة أو الأبعاد النهائية من غير أبعاد البئر والمخطط.${question ? ` ${question}` : ""}`
      : `I can recommend a preliminary configuration${vehicleClass === "SUV" ? " for SUV use" : " for the intended use"}, including a drive assembly, controls, doors, and safety provisions suited to the stops. I will not assume the final rated load or dimensions without the shaft dimensions and drawing.${question ? ` ${question}` : ""}`;
  }
  return locale === "ar"
    ? `أقدر أقترح خيارًا مبدئيًا وأوضح الافتراضات، لكن لن أعتمد قيمة هندسية غير مؤكدة.${question ? ` ${question}` : ""}`
    : `I can suggest a preliminary option and make the assumptions clear, but I will not approve an uncertain engineering value.${question ? ` ${question}` : ""}`;
}

function groundedText(draft: WorkingCommercialDraft, userMessage: string, locale: "ar" | "en") {
  if (isRecommendation(userMessage) || isUnknown(userMessage)) return boundedRecommendation(draft, locale);
  const question = draft.activeQuestion ? draft.activeQuestion[locale] : null;
  if (isContinue(userMessage)) {
    return locale === "ar"
      ? `تمام، مكمل معاك من نفس السياق.${question ? ` ${question}` : " الملخص المحدث موجود بالأسفل."}`
      : `All right, I’m continuing from the same context.${question ? ` ${question}` : " The updated summary is below."}`;
  }

  const result = projectStructuredResult(draft);
  const understanding = result.systemUnderstanding;
  const system = value(draft, "system.identity", locale);
  const jurisdiction = value(draft, "system.jurisdiction", locale);
  const scope = value(draft, "scopeType", locale);
  const stops = value(draft, "system.numberOfStops", locale);
  const hasPriorAssistant = (draft.conversationMessages ?? []).some((message) => message.role === "ASSISTANT");
  const researched = draft.canonicalProposal?.agenticState?.researchStatus === "COMPLETED";

  if (understanding && system && !hasPriorAssistant) {
    const context = scope && jurisdiction ? (locale === "ar" ? `${scope} في ${jurisdiction}` : `${scope} in ${jurisdiction}`) : scope ?? jurisdiction;
    const opening = locale === "ar"
      ? `تمام، فهمت النظام. إحنا بنتكلم عن ${system}${context ? ` ${context}` : ""}${stops ? `، ويخدم ${stops} طوابق أو وقفات` : ""}.`
      : `Got it — I understand the system. We’re discussing ${system}${context ? ` for ${context}` : ""}${stops ? ` serving ${stops} floors or stops` : ""}.`;
    const componentLabels = understanding.components.map((item) => item[`label${locale === "ar" ? "Ar" : "En"}`]);
    const components = componentLabels.length
      ? locale === "ar"
        ? ` التكوين العام الذي فهمته يشمل ${join(componentLabels.slice(0, 6), locale)}.`
        : ` The general structure I understand includes ${join(componentLabels.slice(0, 6), locale)}.`
      : "";
    const confidence = locale === "ar" ? understanding.descriptionAr : understanding.descriptionEn;
    return `${opening}${components} ${confidence}${question ? ` ${question}` : ""}`.trim();
  }

  if (isResearchRequest(userMessage) && researched) {
    const confidence = understanding ? (locale === "ar" ? understanding.descriptionAr : understanding.descriptionEn) : "";
    return locale === "ar"
      ? `راجعت المصادر الفنية المتاحة وحدثت فهم النظام من دون تغيير معلوماتك المؤكدة.${confidence ? ` ${confidence}` : ""}${question ? ` ${question}` : ""}`
      : `I reviewed the available technical sources and updated the system understanding without changing your confirmed facts.${confidence ? ` ${confidence}` : ""}${question ? ` ${question}` : ""}`;
  }

  const committed = [stops ? (locale === "ar" ? `${stops} طوابق أو وقفات` : `${stops} floors or stops`) : null]
    .filter((item): item is string => Boolean(item));
  const update = locale === "ar"
    ? `تمام، حدثت الطلب${committed.length ? ` وثبتُّ ${join(committed, locale)}` : " بالمعلومات الجديدة"}.`
    : `Got it — I updated the request${committed.length ? ` and recorded ${join(committed, locale)}` : " with the new information"}.`;
  return `${update}${question ? ` ${question}` : ""}`;
}

/**
 * Presentation-only response projected after the reducer commits. Keeping this
 * deterministic removes a second model interpretation of the same turn.
 */
export async function generateGroundedResponse(input: { draft: WorkingCommercialDraft; userMessage: string }) {
  return {
    ar: groundedText(input.draft, input.userMessage, "ar"),
    en: groundedText(input.draft, input.userMessage, "en"),
  };
}
