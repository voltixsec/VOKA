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

export function fieldTarget(field: MissingField): string {
  if (field.key === "customer") return "customerMention";
  if (field.key === "systemInput") return field.sourceField ?? "systemInput";
  if (field.key === "quantity" || field.key === "catalogChoice") return `${field.key}:${field.sourceField}`;
  return field.key;
}

/** All readiness/next-question projections are derived together, never toggled independently. */
export function completeFields(draft: WorkingCommercialDraft): WorkingCommercialDraft {
  const requirements = evaluateFormRequirements(draft.operation, draft.fields, Boolean(draft.attachment), draft.contextText, draft.canonicalProposal, { notApplicable: draft.notApplicable });
  const first = requirements.missingRequired[0];
  let activeQuestion: FieldQuestion | null = null;
  if (first) {
    const [ar, en] = questions[first.key] ?? [`يرجى تحديد: ${first.labelAr}.`, `Please provide: ${first.labelEn}.`];
    activeQuestion = { field: fieldTarget(first), ar, en, allowNotApplicable: ["projectName", "attentionName", "expiryDate", "delivery", "warranty"].includes(first.key) };
    if (first.key === "systemInput" && first.sourceField === "accessDirection") activeQuestion.options = [
      { ar: "دخول فقط", en: "Entry only", value: "ENTRY_ONLY" },
      { ar: "دخول وخروج", en: "Entry and exit", value: "ENTRY_EXIT" },
    ];
    if (first.key === "customer" && draft.clarification && ["AMBIGUOUS", "NOT_FOUND"].includes(draft.customerResolution.status)) {
      activeQuestion = { ...activeQuestion, ar: draft.clarification.ar, en: draft.clarification.en };
    }
  }
  return { ...draft, ...requirements, completionVersion: 1, activeQuestion,
    phase: first ? "FIELD_ANSWER_PENDING" : "DRAFT_READY_FOR_REVIEW",
    status: first ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW",
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
