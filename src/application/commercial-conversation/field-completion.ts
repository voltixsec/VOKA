import { evaluateFormRequirements } from "./form-requirements";
import type { CommercialPhase, FieldQuestion, MissingField, WorkingCommercialDraft } from "./types";

const questions: Partial<Record<MissingField["key"], [string, string]>> = {
  customer: ["من العميل المقصود؟", "Who is the customer?"],
  projectName: ["ما اسم المشروع؟", "What is the project name?"],
  attentionName: ["المستند بعناية من؟", "Who should the document be addressed to?"],
  expiryDate: ["ما مدة صلاحية العرض بالأيام أو تاريخ انتهائه؟", "What is the quotation validity in days or its expiry date?"],
  paymentTerms: ["ما شروط الدفع؟", "What are the payment terms?"],
  delivery: ["ما مدة أو تاريخ التسليم؟", "What is the delivery period or date?"],
  warranty: ["ما مدة وشروط الضمان؟", "What are the warranty period and terms?"],
  lines: ["ما المنتج أو الخدمة المطلوبة وكميتها؟", "Which product or service and quantity are required?"],
  sourceReference: ["ما رقم عرض السعر المعتمد؟", "What is the approved quotation reference?"],
  attachment: ["أرفق ملف الرسم للمتابعة.", "Attach the drawing to continue."],
  userIntent: ["ما المطلوب من الرسم؟", "What is needed from the drawing?"],
};

const systemQuestions: Record<string, [string, string]> = {
  elevatorQuantity: ["كم عدد المصاعد المطلوبة؟", "How many elevators are required?"],
  numberOfElevators: ["كم عدد المصاعد المطلوبة؟", "How many elevators are required?"],
  numberOfStops: ["كم عدد الطوابق أو الوقفات التي سيخدمها المصعد؟", "How many floors or stops will the elevator serve?"],
  floors: ["كم عدد الطوابق التي سيخدمها المصعد؟", "How many floors will the elevator serve?"],
  capacity: ["ما الحمولة المطلوبة للمصعد؟", "What elevator capacity is required?"],
  loadCapacity: ["ما الحمولة المطلوبة للمصعد؟", "What elevator capacity is required?"],
  projectConfiguration: ["المصعد هيخدم كام دور أو وقفة؟", "How many floors or stops will the elevator serve?"],
};

function systemQuestion(field: MissingField): [string, string] {
  const explicit = systemQuestions[field.sourceField ?? ""];
  if (explicit) return explicit;
  if (/elevator|lift|مصعد/i.test(`${field.sourceField} ${field.labelAr} ${field.labelEn}`)) {
    return ["المصعد هيخدم كام دور أو وقفة؟", "How many floors or stops will the elevator serve?"];
  }
  if (/configuration|تكوين|بيانات/i.test(`${field.sourceField} ${field.labelAr} ${field.labelEn}`)) {
    return ["ما تفاصيل وتكوين النظام المطلوب للمشروع؟", "What are the required system configuration details for this project?"];
  }
  const cleanLabelAr = field.labelAr.replace(/بيانات التكوين الأساسية للمشروع|بيانات التكوين الأساسية|تكوين/g, "متطلبات النظام").trim();
  const cleanLabelEn = field.labelEn.replace(/Basic project configuration|configuration/gi, "system requirements").trim();
  return [`ما القيمة المطلوبة لـ ${cleanLabelAr}؟`, `What is the required ${cleanLabelEn}?`];
}

export function fieldTarget(field: MissingField): string {
  if (field.key === "customer") return "customerMention";
  if (field.key === "systemInput") return field.sourceField ?? "systemInput";
  if (field.key === "quantity" || field.key === "catalogChoice") return `${field.key}:${field.sourceField}`;
  return field.key;
}

/** All readiness/next-question projections are derived together, never toggled independently. */
export function completeFields(draft: WorkingCommercialDraft): WorkingCommercialDraft {
  const requirements = evaluateFormRequirements(draft.operation, draft.fields, Boolean(draft.attachment), draft.contextText, draft.canonicalProposal, {
    notApplicable: draft.notApplicable,
    validity: typeof draft.transactionalState?.ledger.facts.validity?.value === "string" ? draft.transactionalState.ledger.facts.validity.value : null,
  });
  const deferredSet = new Set(draft.deferredFields ?? []);

  // Update missingRequired state based on whether fields are deferred
  const allMissingWithState = requirements.missingRequired.map((field) => ({
    ...field,
    state: deferredSet.has(fieldTarget(field)) ? ("DEFERRED" as const) : ("UNRESOLVED" as const),
  }));
  const engineeringKeys = new Set(["systemInput", "catalogChoice", "quantity", "lines", "attachment", "userIntent"]);
  const completionDiagnostics = {
    missingEngineering: allMissingWithState.filter((field) => engineeringKeys.has(field.key)).map(fieldTarget),
    missingCommercial: allMissingWithState.filter((field) => !engineeringKeys.has(field.key)).map(fieldTarget),
  };
  const actionableMissing = draft.conversationPhase === "SOLUTION_EXPLORATION" || draft.conversationPhase === "TRANSITION_PROPOSED"
    ? allMissingWithState.filter((field) => engineeringKeys.has(field.key))
    : allMissingWithState;

  const first = actionableMissing.find((field) => !deferredSet.has(fieldTarget(field)));
  // During solution exploration this is diagnostic only. The conversation
  // orchestrator may choose this candidate, another useful question, or a
  // different conversational action altogether.
  const conversationalField = draft.conversationPhase === "SOLUTION_EXPLORATION" || draft.conversationPhase === "TRANSITION_PROPOSED"
    ? null
    : first;
  let activeQuestion: FieldQuestion | null = null;
  if (conversationalField) {
    const [ar, en] = conversationalField.key === "systemInput"
      ? systemQuestion(conversationalField)
      : questions[conversationalField.key] ?? [`يرجى تحديد: ${conversationalField.labelAr}.`, `Please provide: ${conversationalField.labelEn}.`];
    activeQuestion = {
      field: fieldTarget(conversationalField), ar, en,
      allowNotApplicable: ["projectName", "attentionName", "expiryDate", "delivery", "warranty"].includes(conversationalField.key),
      allowDefer: conversationalField.deferPolicy === "DEFER_ALLOWED",
      deferLabelAr: conversationalField.deferPolicy === "DEFER_ALLOWED" ? "تجاوز الآن" : undefined,
      deferLabelEn: conversationalField.deferPolicy === "DEFER_ALLOWED" ? "Skip for now" : undefined,
    };
    const paymentReview = draft.canonicalProposal?.paymentTermsReview;
    if (conversationalField.key === "paymentTerms" && paymentReview) {
      activeQuestion = { ...activeQuestion,
        ar: paymentReview.reason === 'TOTAL_NOT_100' ? `مجموع نسب الدفع المدخلة ${paymentReview.totalPercentage}% وليس 100%. ما جدول الدفع الكامل؟` : 'يرجى تحديد نسبة كل دفعة وموعدها بوضوح؛ لم يتم تعديل النسب أو استكمالها تلقائياً.',
        en: paymentReview.reason === 'TOTAL_NOT_100' ? `The supplied payment percentages total ${paymentReview.totalPercentage}%, not 100%. What is the complete payment schedule?` : 'Please specify each payment percentage and milestone clearly; no percentages were changed or filled in automatically.',
      };
    }
    if (conversationalField.key === "systemInput" && conversationalField.sourceField === "accessDirection") activeQuestion.options = [
      { ar: "دخول فقط", en: "Entry only", value: "ENTRY_ONLY" },
      { ar: "دخول وخروج", en: "Entry and exit", value: "ENTRY_EXIT" },
    ];
    if (conversationalField.key === "customer" && draft.clarification && ["AMBIGUOUS", "NOT_FOUND"].includes(draft.customerResolution.status)) {
      activeQuestion = { ...activeQuestion, ar: draft.clarification.ar, en: draft.clarification.en };
    }
  }

  const hasUnresolvedSystem = actionableMissing.some((f) => f.key === "systemInput");
  const hasDeferredGaps = actionableMissing.some((f) => deferredSet.has(fieldTarget(f)));
  const readinessStage = first
    ? "NEEDS_INFORMATION"
    : hasUnresolvedSystem || draft.systemWorkingPlan?.commercializationStatus === "PENDING"
      ? "SYSTEM_PLANNED"
      : hasDeferredGaps
        ? "COMMERCIAL_MATERIALIZED"
        : "READY_FOR_DRAFT";

  return { ...draft, missingRequired: allMissingWithState, recommended: requirements.recommended, completionDiagnostics, completionVersion: 1, activeQuestion,
    readinessStage,
    phase: first ? "FIELD_ANSWER_PENDING" : hasDeferredGaps ? "NEEDS_INFO" : "DRAFT_READY_FOR_REVIEW",
    status: first || hasDeferredGaps ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW",
    clarification: activeQuestion ? { ar: activeQuestion.ar, en: activeQuestion.en, suggestions: [] } : null,
    requiresHumanReview: true, executed: false,
  };
}

/** Capture/transcript states deliberately have no input into commercial readiness. */
export function commercialPhase(draft: WorkingCommercialDraft | null, analyzing: boolean, stale: boolean): CommercialPhase {
  if (analyzing) return draft ? "RECALCULATING" : "ANALYZING";
  if (stale || !draft) return "COMPOSING";
  if (draft.missingRequired.length) return draft.activeQuestion ? "FIELD_ANSWER_PENDING" : "NEEDS_INFO";
  return "DRAFT_READY_FOR_REVIEW";
}
