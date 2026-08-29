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
  const requirements = evaluateFormRequirements(draft.operation, draft.fields, Boolean(draft.attachment), draft.contextText, draft.canonicalProposal, { notApplicable: draft.notApplicable });
  const deferredSet = new Set(draft.deferredFields ?? []);

  // Update missingRequired state based on whether fields are deferred
  const missingWithState = requirements.missingRequired.map((field) => ({
    ...field,
    state: deferredSet.has(fieldTarget(field)) ? ("DEFERRED" as const) : ("UNRESOLVED" as const),
  }));

  const first = missingWithState.find((field) => !deferredSet.has(fieldTarget(field)));
  let activeQuestion: FieldQuestion | null = null;
  if (first) {
    const [ar, en] = first.key === "systemInput"
      ? systemQuestion(first)
      : questions[first.key] ?? [`يرجى تحديد: ${first.labelAr}.`, `Please provide: ${first.labelEn}.`];
    activeQuestion = {
      field: fieldTarget(first), ar, en,
      allowNotApplicable: ["projectName", "attentionName", "expiryDate", "delivery", "warranty"].includes(first.key),
      allowDefer: first.deferPolicy === "DEFER_ALLOWED",
      deferLabelAr: first.deferPolicy === "DEFER_ALLOWED" ? "تجاوز الآن" : undefined,
      deferLabelEn: first.deferPolicy === "DEFER_ALLOWED" ? "Skip for now" : undefined,
    };
    const paymentReview = draft.canonicalProposal?.paymentTermsReview;
    if (first.key === "paymentTerms" && paymentReview) {
      activeQuestion = { ...activeQuestion,
        ar: paymentReview.reason === 'TOTAL_NOT_100' ? `مجموع نسب الدفع المدخلة ${paymentReview.totalPercentage}% وليس 100%. ما جدول الدفع الكامل؟` : 'يرجى تحديد نسبة كل دفعة وموعدها بوضوح؛ لم يتم تعديل النسب أو استكمالها تلقائياً.',
        en: paymentReview.reason === 'TOTAL_NOT_100' ? `The supplied payment percentages total ${paymentReview.totalPercentage}%, not 100%. What is the complete payment schedule?` : 'Please specify each payment percentage and milestone clearly; no percentages were changed or filled in automatically.',
      };
    }
    if (first.key === "systemInput" && first.sourceField === "accessDirection") activeQuestion.options = [
      { ar: "دخول فقط", en: "Entry only", value: "ENTRY_ONLY" },
      { ar: "دخول وخروج", en: "Entry and exit", value: "ENTRY_EXIT" },
    ];
    if (first.key === "customer" && draft.clarification && ["AMBIGUOUS", "NOT_FOUND"].includes(draft.customerResolution.status)) {
      activeQuestion = { ...activeQuestion, ar: draft.clarification.ar, en: draft.clarification.en };
    }
  }

  const materializationBlocked = !first && draft.systemWorkingPlan?.commercializationStatus === "PENDING";
  if (materializationBlocked) {
    return { ...draft, missingRequired: missingWithState, recommended: requirements.recommended, completionVersion: 1, activeQuestion: null,
      readinessStage: "SYSTEM_PLANNED", phase: "NEEDS_INFO", status: "NEEDS_CLARIFICATION",
      clarification: {
        ar: "اكتمل فهم النظام، لكن يلزم استكمال المراجعة الهندسية وتحويل المتطلبات إلى بنود تجارية قبل إنشاء المسودة.",
        en: "The system is understood, but engineering review and commercial materialization must be completed before creating the draft.",
        suggestions: [],
      },
      requiresHumanReview: true, executed: false,
    };
  }

  const hasUnresolvedSystem = missingWithState.some((f) => f.key === "systemInput");
  const hasDeferredGaps = missingWithState.some((f) => deferredSet.has(fieldTarget(f)));
  const readinessStage = first
    ? "NEEDS_INFORMATION"
    : hasUnresolvedSystem || draft.systemWorkingPlan?.commercializationStatus === "PENDING"
      ? "SYSTEM_PLANNED"
      : hasDeferredGaps
        ? "COMMERCIAL_MATERIALIZED"
        : "READY_FOR_DRAFT";

  return { ...draft, missingRequired: missingWithState, recommended: requirements.recommended, completionVersion: 1, activeQuestion,
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
