import { classifyCommercialOperation } from "../commercial-entry";
import type { AISalesAssistantService } from "../ai-sales-assistant/services/AISalesAssistantService";
import type { CommercialAnswerField, CommercialAnswers, CommercialSelection } from "../ai-sales-assistant/dto/AISalesAssistantDto";
import { latinDigits, parseValidityDuration } from "../ai-sales-assistant/services/commercial-field-values";
import { applyCanonicalIntelligence, ConversationalDraftEngine } from "./ConversationalDraftEngine";
import { completeFields } from "./field-completion";
import type { AdvanceConversationInput, FieldAnswer } from "./types";
import { labelledFieldAnswer } from "./labelled-field-answer";
import { systemTurnValues } from "./system-turn-values";
import { explicitPaymentTerms, renderPaymentSchedule } from "../ai-sales-assistant/services/payment-terms";
import { commitTurnDecision, projectFactLedger, proposalDecision, type CommercialReadiness } from "./transactional-state";
import { generateGroundedResponse } from "./chat-first-response";
import { projectStructuredResult } from "./live-result";

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

export type SalesAssistantTurnTiming = {
  semanticProviderMs: number;
  researchMs: number;
  deterministicToolsMs: number;
  naturalResponseMs: number;
  totalMs: number;
  researchInvoked: boolean;
};

export type CompleteConversationOptions = {
  onTiming?: (timing: SalesAssistantTurnTiming) => void;
};

/** Application orchestration: targeted answers -> existing intelligence -> one next field. */
export class CompleteCommercialConversation {
  constructor(
    private readonly intelligence: Pick<AISalesAssistantService, "generateDraftProposal"> & Partial<Pick<AISalesAssistantService, "generateConversationResponse" | "reasonConversation">>,
    private readonly options: CompleteConversationOptions = {},
  ) {}

  async execute(input: CompleteConversationInput) {
    const turnStarted = performance.now();
    let semanticProviderMs = 0;
    let researchMs = 0;
    const previous = input.draft;
    let semanticMode: string | null = null;
    let semanticDeferPayment = false;
    let semanticTargetField: string | null = null;
    let semanticIntent: unknown;
    let researchRequired: boolean | undefined;
    if (this.intelligence.reasonConversation) {
      const semanticStarted = performance.now();
      try {
        const raw = await this.intelligence.reasonConversation({
          locale: input.locale, currentTurn: input.reply,
          history: (previous?.conversationMessages ?? previous?.turns.map((turn) => ({ role: turn.role ?? "USER" as const, text: turn.text, source: turn.source })) ?? []).slice(-12).map(({ role, text }) => ({ role, text })),
          committedFacts: Object.fromEntries(Object.entries(previous?.transactionalState?.ledger.facts ?? {}).map(([key, fact]) => [key, fact.value])),
          activeQuestion: previous?.activeQuestion?.field ?? null,
          activeSystem: previous?.systemWorkingPlan?.systemIdentity ?? null,
          documentIntent: previous?.operation ?? input.operation ?? null,
        }) as { mode?: unknown; deferPayment?: unknown; targetField?: unknown; intent?: unknown; researchRequired?: unknown } | undefined;
        if (typeof raw?.mode === "string" && ["CONTINUE", "PROVIDE_FACTS", "CORRECTION", "QUESTION", "RECOMMENDATION", "UNKNOWN", "DEFER"].includes(raw.mode)) semanticMode = raw.mode;
        semanticDeferPayment = raw?.deferPayment === true;
        semanticTargetField = typeof raw?.targetField === "string" ? raw.targetField : null;
        semanticIntent = raw?.intent;
        researchRequired = typeof raw?.researchRequired === "boolean" ? raw.researchRequired : undefined;
      } catch { /* Conservative local interpretation remains available. */ }
      semanticProviderMs = performance.now() - semanticStarted;
    }
    const implicitQuotationValidity = (previous?.operation === "QUOTATION" || input.operation === "QUOTATION" || input.documentMode === "QUOTATION")
      && previous?.missingRequired.some((field) => field.key === "expiryDate")
      && /(?:من\s+تاريخ\s+(?:الاعتماد|الموافقة|العرض|إصدار\s+العرض)|from\s+(?:the\s+)?(?:approval|quotation|quote|issue)\s+date)/i.test(input.reply)
      && !/(?:تسليم|توريد|ضمان|دفع|delivery|supply|warranty|payment)/i.test(input.reply);
    if (implicitQuotationValidity) {
      semanticTargetField = "expiryDate";
      if (semanticIntent && typeof semanticIntent === "object" && !Array.isArray(semanticIntent)) {
        semanticIntent = { ...semanticIntent as Record<string, unknown>, expiryDate: input.reply.trim(), delivery: null };
      }
    }
    const deterministicStarted = performance.now();
    const answers: CommercialAnswers = { ...previous?.answers };
    const systemAnswers = { ...previous?.systemAnswers };
    const notApplicable = new Set(previous?.notApplicable?.filter((field) => nullableFields.has(field)) ?? []);
    const deferredFields = new Set(previous?.deferredFields ?? []);
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
    if (!answers.customerMention && retainedCustomer && !deferredFields.has("customerMention")) answers.customerMention = retainedCustomer;
    if (!selection.customer && prior?.customer.id && prior.customer.name) selection.customer = { id: prior.customer.id, name: prior.customer.name };

    const active = previous ? completeFields(previous).activeQuestion : null;
    const provisionalInputs = prior?.agenticState?.provisionalSystem?.inputs ?? [];
    const isDeferIntent = Boolean(
      input.answer?.action === "DEFER" ||
      input.answer?.action === "SKIP" ||
      (active && !input.reanalyze && !input.selection && /^(?:تجاوز\s*الآن|تجاوز|تخطي|skip\s*for\s*now|skip)$/i.test(input.reply.trim()))
    );
    const deferPaymentIntent = semanticDeferPayment || /(?:سيب|أجل|اجل|تجاوز)\s*(?:شروط\s*)?الدفع|خل(?:ي|يه)\s*(?:شروط\s*)?الدفع\s*(?:دلوقتي|حاليًا|حاليا|لبعدين|لوقت\s+لاحق)|defer\s+(?:the\s+)?payment|leave\s+(?:the\s+)?payment\s+(?:for\s+)?(?:now|later)/i.test(input.reply);

    const activeMissingField = previous?.missingRequired.find((f) => f.sourceField === active?.field || f.key === active?.field || (f.key === "customer" && active?.field === "customerMention"));
    const deferAllowed = activeMissingField ? activeMissingField.deferPolicy === "DEFER_ALLOWED" : active?.allowDefer ?? false;
    let nonDeferrableAttempt = false;

    let answer: FieldAnswer | undefined;
    if (deferPaymentIntent) {
      deferredFields.add("paymentTerms");
      delete answers.paymentTerms;
      answer = { field: "paymentTerms", value: "DEFERRED", action: "DEFER" };
    }
    if (isDeferIntent && active) {
      if (deferAllowed) {
        deferredFields.add(active.field);
        delete answers[active.field as CommercialAnswerField];
        answer = { field: active.field, value: "DEFERRED", action: "DEFER" };
      } else {
        nonDeferrableAttempt = true;
      }
    }

    const systemPatch = previous && !input.reanalyze && !input.selection && !input.answer?.action && !isDeferIntent
      ? systemTurnValues(input.answer?.value ?? input.reply, provisionalInputs)
      : {};
    Object.assign(systemAnswers, systemPatch);
    const patchedSystemFields = Object.keys(systemPatch);
    const labelled = previous && !input.reanalyze && !input.selection && !input.answer?.action && !isDeferIntent ? labelledFieldAnswer(input.answer?.value ?? input.reply) : undefined;
    const firstPaymentPercentage = input.reply.search(/[٠-٩\d]+(?:[.,٫]\d+)?\s*(?:%|٪|percent\b|بالمئة|في المئة)/i);
    const conversationalPayment = explicitPaymentTerms(input.reply) ?? (firstPaymentPercentage >= 0 && /الدفع|payment/i.test(input.reply) ? input.reply.slice(firstPaymentPercentage) : null);
    const conversationalControl = ["CONTINUE", "QUESTION", "RECOMMENDATION", "UNKNOWN"].includes(semanticMode ?? "") || /^(?:كمل|كمّل|تابع|استمر|continue|go on|خلينا|دعنا|let'?s)|مش\s*عارف|ما\s*أعرف|i\s*(?:do not|don't)\s*know|(?:إيه|ايه|what).*?(?:الأفضل|الأنسب|best)|اختارلي|recommend/i.test(input.reply.trim());
    const contextualAnswer = active && !conversationalControl && !isDeferIntent && !input.reanalyze && !input.selection
      ? { field: active.field, value: input.reply } : undefined;
    const semanticAnswer = semanticTargetField && (answerFields.has(semanticTargetField) || provisionalInputs.some((field) => field.name === semanticTargetField))
      ? { field: semanticTargetField, value: input.reply } : undefined;
    const submittedAnswer = input.answer?.action || !conversationalControl ? input.answer : undefined;
    answer ??= patchedSystemFields.length ? undefined : labelled ?? (conversationalPayment ? { field: "paymentTerms", value: conversationalPayment } : undefined) ?? semanticAnswer ?? submittedAnswer ?? contextualAnswer;
    const systemInput = prior?.smartSystem?.inputs.find((field) => field.name === answer?.field)
      ?? prior?.agenticState?.provisionalSystem?.inputs.find((field) => field.name === answer?.field);
    if (answer && (typeof answer.value !== "string" || !answer.value.trim() || answer.value.length > 4000)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer?.action && !["VALUE", "NOT_APPLICABLE", "DEFER", "SKIP"].includes(answer.action)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer && !systemInput && !answerFields.has(answer.field) && !["sourceReference", "lines", "userIntent", "attachment"].includes(answer.field) && !/^(quantity|catalogChoice):\d+$/.test(answer.field)) throw new Error("CONVERSATION_ANSWER_INVALID");
    if (answer?.action === "NOT_APPLICABLE") {
      if (!nullableFields.has(answer.field)) throw new Error("CONVERSATION_ANSWER_INVALID");
      notApplicable.add(answer.field as CommercialAnswerField);
      delete answers[answer.field as CommercialAnswerField];
    } else if (answer && answer.action === "DEFER") {
      // Defer action handled via deferredFields
    } else if (answer && answerFields.has(answer.field)) {
      let value = answer.value.trim();
      if (numericFields.has(answer.field)) {
        value = latinDigits(value);
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error("CONVERSATION_ANSWER_INVALID");
      }
      answers[answer.field as CommercialAnswerField] = value;
      notApplicable.delete(answer.field as CommercialAnswerField);
      deferredFields.delete(answer.field);
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
      deferredFields.delete(answer.field);
    }
    if (input.selection?.customer) {
      answers.customerMention = input.selection.customer.name;
      deferredFields.delete("customerMention");
    }
    const documentMode = input.documentMode ?? previous?.documentMode ?? "AUTO";
    const buildMode = input.buildMode ?? previous?.buildMode ?? "AUTO";
    let operation = buildMode === "DRAWING" ? "DRAWING_TAKEOFF" as const : documentMode === "AUTO" ? previous?.operation ?? input.operation ?? classifyCommercialOperation(input.reply).operation : documentMode;
    if (previous && operation && previous.operation !== operation) throw new Error("CONVERSATION_OPERATION_IMMUTABLE");
    const targeted = Boolean(patchedSystemFields.length || (answer && !["lines", "userIntent"].includes(answer.field)) || input.selection || input.reanalyze || isDeferIntent);
    const previousIntelligence = previous?.intelligenceText ?? previous?.turns.filter((turn) => !turn.target).map((turn) => turn.text).join("\n");
    const intelligenceText = targeted && previousIntelligence ? previousIntelligence : [previousIntelligence, input.reply].filter(Boolean).join("\n");
    const retainedLines = targeted ? prior?.lines.map((line, index) => {
      const quantityReply = answer?.field === `quantity:${index}` ? Number(latinDigits(answer.value)) : line.quantity;
      if (quantityReply != null && (!Number.isFinite(quantityReply) || quantityReply <= 0)) throw new Error("CONVERSATION_ANSWER_INVALID");
      return { text: line.itemName, itemNameAr: line.itemNameAr ?? undefined, itemNameEn: line.itemNameEn ?? undefined, quantity: quantityReply, description: line.description, requestedUnitText: line.requestedUnitText, requestedPrice: line.requestedPrice, typeIntent: line.type };
    }) : undefined;
    let proposal = operation === "SALES_ORDER" || operation === "DRAWING_TAKEOFF" ? null : await this.intelligence.generateDraftProposal({
      companyId: input.companyId, prompt: intelligenceText, sourceLocale: input.locale,
      currentTurn: input.reply,
      validityBaseDate: prior?.proposal.validityBaseDate,
      buildMode: buildMode === "DRAWING" ? "AUTO" : buildMode, selection, answers, systemAnswers, notApplicable: [...notApplicable], retainedLines,
      retainedContext: prior ? {
        subject: prior.proposal.subject, brief: prior.proposal.brief, scopeType: prior.proposal.scopeType,
        currencyCode: prior.completion?.currency === "USER_PROVIDED" ? prior.proposal.currencyCode : undefined,
      } : undefined,
      retainedAgentState: prior?.agenticState,
    }, {
      preinterpretedIntent: semanticIntent,
      researchRequired,
      onResearchLatency: (milliseconds) => { researchMs += milliseconds; },
    });
    operation ??= proposal?.documentType ?? null;
    let draft = new ConversationalDraftEngine().advance({ ...input, operation: operation as AdvanceConversationInput["operation"], documentMode, buildMode });
    draft = { ...draft, completionVersion: 1, answers, systemAnswers, selection, notApplicable: [...notApplicable], deferredFields: [...deferredFields], intelligenceText };
    if (answer) draft.turns[draft.turns.length - 1].target = answer.field;
    if (patchedSystemFields.length) draft.turns[draft.turns.length - 1].target = patchedSystemFields.join(",");
    if (input.selection) draft.turns[draft.turns.length - 1].target = input.selection.customer ? "customerMention" : "catalogChoice";
    if (answer?.field === "sourceReference") draft.fields.sourceReference = answer.value.trim();
    if (proposal) {
      const systemMissing = proposal.smartSystem?.missingInputs.length ?? proposal.agenticState?.missingInputs.length ?? 0;
      const meaningfulLines = proposal.lines.filter((line) => Boolean(line.itemName.trim()) && line.quantity != null && line.quantity > 0);
      const readiness: CommercialReadiness = systemMissing ? "NEEDS_INFORMATION" : proposal.agenticState && !meaningfulLines.length ? "SYSTEM_PLANNED" : meaningfulLines.length ? "COMMERCIAL_MATERIALIZED" : "CONVERSATION_UNDERSTOOD";
      const correctionFields = new Set<string>();
      const explicitField = answer?.field;
      if (explicitField) correctionFields.add(explicitField);
      if (explicitField === "paymentTerms") correctionFields.add("paymentSchedule");
      const userTurn = draft.turns.filter((turn) => (turn.role ?? "USER") === "USER").length;
      const decision = proposalDecision({ requestId: draft.id, turn: userTurn, proposal, correctionFields, readiness });
      if (answer?.action === "DEFER") {
        const replacing = Boolean(previous?.transactionalState?.ledger.facts[answer.field]);
        decision.patches.push({ field: answer.field, operation: replacing ? "REPLACE" : "SET", value: "DEFERRED", provenance: replacing ? "USER_CORRECTION" : "USER_EXPLICIT", evidence: "User explicitly deferred this field." });
        correctionFields.add(answer.field);
      }
      const systemFacts = proposal.smartSystem?.inputs ?? proposal.agenticState?.provisionalSystem?.inputs ?? [];
      const systemIdentity = proposal.smartSystem?.systemNameEn ?? proposal.agenticState?.systemName;
      if (systemIdentity) decision.patches.push({ field: "system.identity", operation: previous?.transactionalState?.ledger.facts["system.identity"] ? "REPLACE" : "SET", value: systemIdentity,
        provenance: proposal.smartSystem ? "DETERMINISTIC_DERIVATION" : proposal.agenticState?.provisionalSystem?.provenance === "RESEARCHED" ? "RESEARCHED" : "AI_INFERRED", evidence: "Validated canonical system identity." });
      const systemJurisdiction = proposal.agenticState?.provisionalSystem?.jurisdiction;
      if (systemJurisdiction) decision.patches.push({ field: "system.jurisdiction", operation: previous?.transactionalState?.ledger.facts["system.jurisdiction"] ? "REPLACE" : "SET", value: systemJurisdiction, provenance: "DETERMINISTIC_DERIVATION", evidence: "Jurisdiction derived from explicit request context." });
      const hasRelativeValidityAnchor = answer?.field === "expiryDate" && /(?:من\s+تاريخ\s+(?:الاعتماد|الموافقة|العرض|إصدار\s+العرض)|from\s+(?:the\s+)?(?:approval|quotation|quote|issue)\s+date)/i.test(answer.value);
      if (answer?.field === "expiryDate" && (parseValidityDuration(answer.value) || hasRelativeValidityAnchor)) {
        decision.patches.push({ field: "validity", operation: previous?.transactionalState?.ledger.facts.validity ? "REPLACE" : "SET", value: answer.value.trim(), provenance: previous?.transactionalState?.ledger.facts.validity ? "USER_CORRECTION" : "USER_EXPLICIT", evidence: "User-supplied quotation validity wording." });
        correctionFields.add("validity");
      }
      for (const fact of systemFacts) {
        if (fact.value == null) continue;
        const field = `system.${fact.name}`;
        const corrected = previous?.systemAnswers?.[fact.name] != null && systemAnswers[fact.name] !== previous.systemAnswers[fact.name];
        decision.patches.push({ field, operation: corrected ? "REPLACE" : "SET", value: fact.value,
          provenance: corrected ? "USER_CORRECTION" : fact.provenance === "USER_PROVIDED" ? "USER_EXPLICIT" : fact.provenance === "RESEARCHED" ? "RESEARCHED" : "TRUSTED_PROFILE",
          evidence: "Validated system working input." });
        if (corrected || patchedSystemFields.includes(fact.name) || answer?.field === fact.name) correctionFields.add(field);
      }
      const allFields = new Set(decision.patches.map((patch) => patch.field));
      const permitted = !previous || input.reanalyze ? allFields : new Set([
        ...correctionFields,
        ...decision.patches.filter((patch) => !previous.transactionalState?.ledger.facts[patch.field]).map((patch) => patch.field),
      ]);
      const committed = commitTurnDecision(previous?.transactionalState?.ledger, decision, permitted);
      proposal = projectFactLedger(proposal, committed.ledger, input.locale, renderPaymentSchedule);
      draft = { ...draft, transactionalState: committed, readinessStage: committed.readiness,
        systemWorkingPlan: proposal.smartSystem ? {
          systemIdentity: proposal.smartSystem.systemNameEn,
          knownInputs: Object.fromEntries(proposal.smartSystem.inputs.filter((item) => item.value != null).map((item) => [item.name, item.value!])),
          missingInputs: proposal.smartSystem.missingInputs,
          componentRequirements: (proposal.smartSystem.requirements ?? []).map((item) => item.componentKey),
          engineeringVerificationRequired: proposal.smartSystem.status !== "COMPLETE",
          commercializationStatus: meaningfulLines.length ? "MATERIALIZED" : "PENDING",
        } : proposal.agenticState?.provisionalSystem ? {
          systemIdentity: proposal.agenticState.systemName,
          knownInputs: Object.fromEntries(proposal.agenticState.provisionalSystem.inputs.filter((item) => item.value != null).map((item) => [item.name, item.value!])),
          missingInputs: proposal.agenticState.missingInputs,
          componentRequirements: proposal.agenticState.provisionalSystem.componentCategories,
          engineeringVerificationRequired: true,
          commercializationStatus: meaningfulLines.length ? "MATERIALIZED" : "PENDING",
        } : null };
      draft = applyCanonicalIntelligence(draft, proposal);
      // Store an absolute date, not a duration that drifts on every later turn.
      if (answers.expiryDate && proposal.proposal.expiryDate) draft.answers = { ...answers, expiryDate: proposal.proposal.expiryDate };
      if (answers.attentionName) draft.answers = { ...draft.answers, attentionName: proposal.proposal.attentionName ?? '' };
    }
    const completed = completeFields(draft);
    if (nonDeferrableAttempt && completed.activeQuestion) {
      completed.activeQuestion = {
        ...completed.activeQuestion,
        nonDeferrableNotice: {
          ar: "المعلومة دي لازمة علشان نكوّن النظام بشكل صحيح. تقدر تدخلها أو ترفق مخطط/BOQ لو موجود.",
          en: "This information is required to configure the system properly. You can enter it or attach a drawing/BOQ if available.",
        },
      };
      completed.clarification = {
        ar: "المعلومة دي لازمة علشان نكوّن النظام بشكل صحيح. تقدر تدخلها أو ترفق مخطط/BOQ لو موجود.",
        en: "This information is required to configure the system properly. You can enter it or attach a drawing/BOQ if available.",
        suggestions: [{ ar: "إرفاق مخطط", en: "Attach drawing", reply: "أرفق ملف الرسم" }],
      };
    }
    const deterministicToolsMs = Math.max(0, performance.now() - deterministicStarted - researchMs);
    const responseStarted = performance.now();
    const assistantResponse = await generateGroundedResponse({ draft: completed, userMessage: input.reply, provider: this.intelligence });
    const naturalResponseMs = performance.now() - responseStarted;
    const priorMessages = previous?.conversationMessages ?? previous?.turns.map((turn) => ({ role: turn.role ?? "USER" as const, source: turn.source, text: turn.text })) ?? [];
    const withResponse = {
      ...completed,
      assistantResponse,
      internalIterations: proposal?.agenticState?.researchStatus === "COMPLETED" ? 4 : 3,
      conversationMessages: [
        ...priorMessages,
        { role: "USER" as const, source: input.replySource, text: input.reply.trim() },
        { role: "ASSISTANT" as const, source: "TEXT" as const, text: input.locale === "ar" ? assistantResponse.ar : assistantResponse.en },
      ],
    };
    const result = { ...withResponse, structuredResult: projectStructuredResult(withResponse) };
    this.options.onTiming?.({
      semanticProviderMs: Math.round(semanticProviderMs),
      researchMs: Math.round(researchMs),
      deterministicToolsMs: Math.round(deterministicToolsMs),
      naturalResponseMs: Math.round(naturalResponseMs),
      totalMs: Math.round(performance.now() - turnStarted),
      researchInvoked: researchMs > 0,
    });
    return result;
  }
}
