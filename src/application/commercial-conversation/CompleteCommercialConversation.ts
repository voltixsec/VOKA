import { classifyCommercialOperation } from "../commercial-entry";
import type { AISalesAssistantService } from "../ai-sales-assistant/services/AISalesAssistantService";
import type { CommercialAnswerField, CommercialAnswers, CommercialSelection } from "../ai-sales-assistant/dto/AISalesAssistantDto";
import { latinDigits } from "../ai-sales-assistant/services/commercial-field-values";
import { applyCanonicalIntelligence, ConversationalDraftEngine } from "./ConversationalDraftEngine";
import { completeFields } from "./field-completion";
import type { AdvanceConversationInput, FieldAnswer } from "./types";
import { labelledFieldAnswer } from "./labelled-field-answer";

const answerFields = new Set(["customerMention", "projectName", "attentionName", "expiryDate", "paymentTerms", "delivery", "warranty", "notes", "cameraCount", "storageDays", "bitrateMbps", "cableMetersPerCamera"]);
const nullableFields = new Set(["projectName", "attentionName", "expiryDate", "delivery", "warranty"]);
const numericFields = new Set(["cameraCount", "storageDays", "bitrateMbps", "cableMetersPerCamera"]);

export type CompleteConversationInput = AdvanceConversationInput & {
  companyId: string;
  selection?: CommercialSelection;
  answer?: FieldAnswer;
  /** Re-run unchanged visible request without mistaking it for a field answer. */
  reanalyze?: boolean;
};

/** Application orchestration: targeted answers -> existing intelligence -> one next field. */
export class CompleteCommercialConversation {
  constructor(private readonly intelligence: Pick<AISalesAssistantService, "generateDraftProposal">) {}

  async execute(input: CompleteConversationInput) {
    const previous = input.draft;
    const answers: CommercialAnswers = { ...previous?.answers };
    const systemAnswers = { ...previous?.systemAnswers };
    const notApplicable = new Set(previous?.notApplicable?.filter((field) => nullableFields.has(field)) ?? []);
    const selection: CommercialSelection = { ...previous?.selection, ...input.selection };
    const prior = previous?.canonicalProposal;
    // Preserve extracted user values, not customer/company defaults masquerading as user answers.
    for (const key of ["projectName", "attentionName", "expiryDate"] as const) {
      if (!answers[key] && prior?.proposal[key] && (key !== "expiryDate" || prior.fieldProvenance?.[key] === "USER_PROVIDED")) answers[key] = prior.proposal[key]!;
    }
    for (const key of ["paymentTerms", "delivery", "warranty"] as const) {
      if (!answers[key] && prior?.commercialTerms?.[key] && prior.fieldProvenance?.[key] === "USER_PROVIDED") answers[key] = prior.commercialTerms[key]!;
    }
    const retainedCustomer = prior?.customer.mention ?? prior?.customer.proposedCustomerName ?? prior?.customer.name ?? previous?.proposedCustomerName ?? previous?.fields.customerMention;
    if (!answers.customerMention && retainedCustomer) answers.customerMention = retainedCustomer;
    if (!selection.customer && prior?.customer.id && prior.customer.name) selection.customer = { id: prior.customer.id, name: prior.customer.name };

    const active = previous ? completeFields(previous).activeQuestion : null;
    const labelled = previous && !input.reanalyze && !input.selection && !input.answer?.action ? labelledFieldAnswer(input.answer?.value ?? input.reply) : undefined;
    const answer: FieldAnswer | undefined = labelled ?? input.answer ?? (!input.reanalyze && !input.selection && active ? { field: active.field, value: input.reply } : undefined);
    const systemInput = prior?.smartSystem?.inputs.find((field) => field.name === answer?.field)
      ?? prior?.agenticState?.provisionalSystem?.inputs.find((field) => field.name === answer?.field);
    if (answer && (typeof answer.value !== "string" || !answer.value.trim() || answer.value.length > 4000)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer?.action && !["VALUE", "NOT_APPLICABLE"].includes(answer.action)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer && !systemInput && !answerFields.has(answer.field) && !["sourceReference", "lines", "userIntent", "attachment"].includes(answer.field) && !/^(quantity|catalogChoice):\d+$/.test(answer.field)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer?.action === "NOT_APPLICABLE") {
      if (!nullableFields.has(answer.field)) throw new Error("CONVERSATION_ANSWER_INVALID");
      notApplicable.add(answer.field as CommercialAnswerField);
      delete answers[answer.field as CommercialAnswerField];
    } else if (answer && answerFields.has(answer.field)) {
      let value = answer.value.trim();
      if (numericFields.has(answer.field)) {
        value = latinDigits(value);
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error("CONVERSATION_ANSWER_INVALID");
      }
      answers[answer.field as CommercialAnswerField] = value;
      notApplicable.delete(answer.field as CommercialAnswerField);
      if (answer.field === "customerMention") delete selection.customer;
    } else if (answer && systemInput) {
      const value = latinDigits(answer.value.trim());
      if (typeof systemInput.value === "boolean") {
        if (!/^(true|false|yes|no|نعم|لا)$/i.test(value)) throw new Error("CONVERSATION_ANSWER_INVALID");
        systemAnswers[answer.field] = /^(true|yes|نعم)$/i.test(value);
      } else if (systemInput.unit || typeof systemInput.value === "number") {
        if (!Number.isFinite(Number(value))) throw new Error("CONVERSATION_ANSWER_INVALID");
        systemAnswers[answer.field] = Number(value);
      } else {
        systemAnswers[answer.field] = answer.field === "accessDirection"
          ? /^(دخول فقط|entry only)$/i.test(value) ? "ENTRY_ONLY" : /^(دخول وخروج|entry and exit)$/i.test(value) ? "ENTRY_EXIT" : value
          : value;
      }
    }
    if (input.selection?.customer) answers.customerMention = input.selection.customer.name;
    const documentMode = input.documentMode ?? previous?.documentMode ?? "AUTO";
    const buildMode = input.buildMode ?? previous?.buildMode ?? "AUTO";
    let operation = buildMode === "DRAWING" ? "DRAWING_TAKEOFF" as const : documentMode === "AUTO" ? previous?.operation ?? input.operation ?? classifyCommercialOperation(input.reply).operation : documentMode;
    if (previous && operation && previous.operation !== operation) throw new Error("CONVERSATION_OPERATION_IMMUTABLE");
    const targeted = Boolean((answer && !["lines", "userIntent"].includes(answer.field)) || input.selection || input.reanalyze);
    const previousIntelligence = previous?.intelligenceText ?? previous?.turns.filter((turn) => !turn.target).map((turn) => turn.text).join("\n");
    const intelligenceText = targeted && previousIntelligence ? previousIntelligence : [previousIntelligence, input.reply].filter(Boolean).join("\n");
    const retainedLines = targeted ? prior?.lines.map((line, index) => {
      const quantityReply = answer?.field === `quantity:${index}` ? Number(latinDigits(answer.value)) : line.quantity;
      if (quantityReply != null && (!Number.isFinite(quantityReply) || quantityReply <= 0)) throw new Error("CONVERSATION_ANSWER_INVALID");
      return { text: line.itemName, itemNameAr: line.itemNameAr ?? undefined, itemNameEn: line.itemNameEn ?? undefined, quantity: quantityReply, description: line.description, requestedUnitText: line.requestedUnitText, requestedPrice: line.requestedPrice, typeIntent: line.type };
    }) : undefined;
    const proposal = operation === "SALES_ORDER" || operation === "DRAWING_TAKEOFF" ? null : await this.intelligence.generateDraftProposal({
      companyId: input.companyId, prompt: intelligenceText, sourceLocale: input.locale,
      currentTurn: input.reply,
      validityBaseDate: prior?.proposal.validityBaseDate,
      buildMode: buildMode === "DRAWING" ? "AUTO" : buildMode, selection, answers, systemAnswers, notApplicable: [...notApplicable], retainedLines,
      retainedContext: targeted && prior ? {
        subject: prior.proposal.subject, brief: prior.proposal.brief, scopeType: prior.proposal.scopeType,
        currencyCode: prior.completion?.currency === "USER_PROVIDED" ? prior.proposal.currencyCode : undefined,
      } : undefined,
      retainedAgentState: targeted ? prior?.agenticState : undefined,
    });
    operation ??= proposal?.documentType ?? null;
    let draft = new ConversationalDraftEngine().advance({ ...input, operation: operation as AdvanceConversationInput["operation"], documentMode, buildMode });
    draft = { ...draft, completionVersion: 1, answers, systemAnswers, selection, notApplicable: [...notApplicable], intelligenceText };
    if (answer) draft.turns[draft.turns.length - 1].target = answer.field;
    if (input.selection) draft.turns[draft.turns.length - 1].target = input.selection.customer ? "customerMention" : "catalogChoice";
    if (answer?.field === "sourceReference") draft.fields.sourceReference = answer.value.trim();
    if (proposal) {
      draft = applyCanonicalIntelligence(draft, proposal);
      // Store an absolute date, not a duration that drifts on every later turn.
      if (answers.expiryDate && proposal.proposal.expiryDate) draft.answers = { ...answers, expiryDate: proposal.proposal.expiryDate };
      if (answers.attentionName) draft.answers = { ...draft.answers, attentionName: proposal.proposal.attentionName ?? '' };
    }
    return completeFields(draft);
  }
}
