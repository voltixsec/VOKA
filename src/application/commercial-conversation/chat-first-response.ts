import { projectStructuredResult } from "./live-result";
import type { ConversationOrchestratorDecision, WorkingCommercialDraft } from "./types";
import { isGuidanceRequest, type GuidanceSelection } from "./engineering-guidance";

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
  const activeField = draft.activeQuestion?.field;
  const systemInputs = [
    ...(draft.canonicalProposal?.smartSystem?.inputs ?? []),
    ...(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs ?? []),
  ];
  const guidedInput = systemInputs.find((field) =>
    field.name === activeField && field.value == null && field.guidance?.options.length
  ) ?? systemInputs.find((field) => field.value == null && field.guidance?.options.length);
  const guidance = guidedInput?.guidance;

  if (guidedInput && guidance) {
    const options = guidance.options.map((option, index) => {
      const label = locale === "ar" ? option.labelAr : option.labelEn;
      const explanation = locale === "ar" ? option.explanationAr : option.explanationEn;
      return `${index + 1}) ${label}${explanation ? ` — ${explanation}` : ""}`;
    });
    const recommended = guidance.recommendedValue == null
      ? null
      : guidance.options.find((option) => option.value === guidance.recommendedValue) ?? null;
    const recommendedLabel = recommended ? (locale === "ar" ? recommended.labelAr : recommended.labelEn) : null;
    const rationale = locale === "ar" ? guidance.rationaleAr : guidance.rationaleEn;
    const fieldLabel = locale === "ar" ? guidedInput.labelAr : guidedInput.labelEn;

    if (locale === "ar") {
      const introduction = `بالنسبة لـ${fieldLabel}، عندنا اختيارات مبدئية ممكن نقارن بينها: ${options.join("؛ ")}.`;
      const recommendation = recommendedLabel ? ` ترشيحي المبدئي هو ${recommendedLabel}.` : "";
      const reason = rationale ? ` السبب: ${rationale}` : "";
      const boundary = guidance.requiresConfirmation ? " الترشيح ده مبدئي ومش هاعتمده كبيان للمشروع من غير تأكيدك." : "";
      return `${introduction}${recommendation}${reason}${boundary}${question ? ` ${question}` : ""}`.trim();
    }

    const introduction = `For ${fieldLabel}, there are preliminary options we can compare: ${options.join("; ")}.`;
    const recommendation = recommendedLabel ? ` My preliminary recommendation is ${recommendedLabel}.` : "";
    const reason = rationale ? ` Reason: ${rationale}` : "";
    const boundary = guidance.requiresConfirmation ? " This remains provisional and will not be recorded as a project fact without your confirmation." : "";
    return `${introduction}${recommendation}${reason}${boundary}${question ? ` ${question}` : ""}`.trim();
  }

  // A prerequisite question already contains the governed explanation for this
  // level. Replaying the generic recommendation would hide recursive progress.
  if (draft.activeQuestion?.guidanceFor && question) return question;

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

function guidanceSelectionText(draft: WorkingCommercialDraft, selection: GuidanceSelection, locale: "ar" | "en") {
  if (selection.status === "NONE") return null;
  const question = draft.activeQuestion ? draft.activeQuestion[locale] : null;
  if (selection.status === "INVALID") {
    const options = selection.input.guidance.options.map((option, index) =>
      `${index + 1}) ${locale === "ar" ? option.labelAr : option.labelEn}`
    ).join(locale === "ar" ? "، " : ", ");
    return locale === "ar"
      ? `الاختيار ده مش ضمن الخيارات المتاحة: ${options}. ${question ?? ""}`.trim()
      : `That choice is not among the available options: ${options}. ${question ?? ""}`.trim();
  }
  const label = locale === "ar" ? selection.option.labelAr : selection.option.labelEn;
  return locale === "ar"
    ? `تمام، ثبتُّ اختيار ${label} كبيان مؤكد منك للمشروع.${question ? ` ${question}` : " الملخص المحدث جاهز للمراجعة."}`
    : `Confirmed — I recorded ${label} as your explicit project selection.${question ? ` ${question}` : " The updated summary is ready for review."}`;
}

function orchestratedText(draft: WorkingCommercialDraft, locale: "ar" | "en", decision: ConversationOrchestratorDecision) {
  const question = draft.activeQuestion ? draft.activeQuestion[locale] : null;
  const system = value(draft, "system.identity", locale);
  if (draft.conversationPhase === "TRANSITION_PROPOSED") {
    return locale === "ar"
      ? `الحل${system ? ` الخاص بـ${system}` : ""} بقى محدد بدرجة كافية للانتقال للعرض التجاري. تحب تضيف أو تغيّر أي حاجة، ولا أبدأ تجهيز العرض؟`
      : `The${system ? ` ${system}` : ""} solution is now sufficiently defined to move into the commercial draft. Would you like to add or change anything, or shall I prepare the quotation?`;
  }
  if (draft.conversationPhase === "COMMERCIAL_HANDOFF") {
    return locale === "ar"
      ? `تمام، نقلت الحل المتفق عليه لتجهيز العرض من المعلومات المؤكدة فقط.${question ? ` ${question}` : " تقدر تراجع المسودة قبل أي اعتماد."}`
      : `Done — I moved the agreed solution into quotation preparation using confirmed information only.${question ? ` ${question}` : " You can review the draft before any approval."}`;
  }
  if (decision.action === "REQUEST_DRAWING" || decision.action === "REQUEST_ATTACHMENT") return question;
  if ((decision.action === "ANSWER_USER" || decision.action === "EXPLAIN") && !question) {
    const understanding = projectStructuredResult(draft).systemUnderstanding;
    const limitation = understanding ? (locale === "ar" ? understanding.descriptionAr : understanding.descriptionEn) : null;
    return locale === "ar"
      ? `فاهم سؤالك${system ? ` بخصوص ${system}` : ""}.${limitation ? ` ${limitation}` : " هجاوب في حدود المعلومات المؤكدة من غير ما أفترض قيمة فنية."}`
      : `I understand your question${system ? ` about ${system}` : ""}.${limitation ? ` ${limitation}` : " I’ll stay within confirmed information and won’t assume a technical value."}`;
  }
  if (decision.action === "CONTINUE_EXPLORATION" && !question) {
    const hasPriorAssistant = (draft.conversationMessages ?? []).some((message) => message.role === "ASSISTANT");
    if (!hasPriorAssistant) return null;
    return locale === "ar" ? "تمام، فهمت التحديث ومكمل معاك في استكشاف الحل." : "Got it — I understand the update and will continue exploring the solution with you.";
  }
  return null;
}

function groundedText(draft: WorkingCommercialDraft, userMessage: string, locale: "ar" | "en", guidanceSelection: GuidanceSelection, guidanceRequested: boolean, orchestratorDecision?: ConversationOrchestratorDecision) {
  const orchestrated = orchestratorDecision ? orchestratedText(draft, locale, orchestratorDecision) : null;
  if (orchestrated) return orchestrated;
  const selectionText = guidanceSelectionText(draft, guidanceSelection, locale);
  if (selectionText) return selectionText;
  if (guidanceRequested || isGuidanceRequest(userMessage)) return boundedRecommendation(draft, locale);
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
export async function generateGroundedResponse(input: { draft: WorkingCommercialDraft; userMessage: string; guidanceSelection?: GuidanceSelection; guidanceRequested?: boolean; orchestratorDecision?: ConversationOrchestratorDecision }) {
  const guidanceSelection = input.guidanceSelection ?? { status: "NONE" as const };
  return {
    ar: groundedText(input.draft, input.userMessage, "ar", guidanceSelection, input.guidanceRequested === true, input.orchestratorDecision),
    en: groundedText(input.draft, input.userMessage, "en", guidanceSelection, input.guidanceRequested === true, input.orchestratorDecision),
  };
}
