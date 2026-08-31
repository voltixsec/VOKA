import type { CommercialOperation } from "../commercial-entry";
import type { SalesAssistantDraftProposal } from "../ai-sales-assistant";
import type { CommercialSelection, CommercialAnswers, CommercialAnswerField, SystemFieldAnswers } from "../ai-sales-assistant/dto/AISalesAssistantDto";
import type { TransactionCommit, CommercialReadiness } from "./transactional-state";

export type ConversationalOperation = Exclude<CommercialOperation, "PAYMENT">;
export type ConversationReplySource = "TEXT" | "VOICE" | "CHIP";
export type ConversationLocale = "ar" | "en";
export type ConversationDocumentMode = "AUTO" | "QUOTATION" | "INVOICE" | "CONTRACT" | "SALES_ORDER";
export type ConversationBuildMode = "AUTO" | "CATALOG_ONLY" | "SUPPLY_INSTALL_SYSTEM" | "DRAWING";
export type ConversationAction =
  | "ANSWER_USER" | "EXPLAIN" | "ASK_ENGINEERING" | "OFFER_OPTIONS" | "RECOMMEND"
  | "ASK_FOR_CONFIRMATION" | "REQUEST_ATTACHMENT" | "REQUEST_DRAWING" | "RESEARCH"
  | "CONTINUE_EXPLORATION" | "PROPOSE_COMMERCIAL_HANDOFF" | "COMMERCIAL_FOLLOWUP";
export type SolutionReadiness = "NOT_READY" | "READY_TO_PROPOSE" | "AWAITING_USER_TRANSITION" | "READY_FOR_COMMERCIAL_HANDOFF";
export type ConversationPhase = "SOLUTION_EXPLORATION" | "TRANSITION_PROPOSED" | "COMMERCIAL_HANDOFF";
export type ConversationTransition = "NONE" | "PROPOSE" | "CONFIRM" | "REOPEN";
export type ConversationToolAction = "NONE" | "RESEARCH" | "INSPECT_ATTACHMENT" | "REQUEST_DRAWING";
export type ConversationResponseFocus =
  | "ACKNOWLEDGE_FACTS" | "ADDRESS_QUESTION" | "EXPLAIN_LIMITATION" | "PRESENT_OPTIONS"
  | "ASK_REFERENCED_FIELD" | "OFFER_HANDOFF" | "CONFIRM_HANDOFF" | "REQUEST_ATTACHMENT" | "CONTINUE";

export type ConversationOrchestratorDecision = {
  action: ConversationAction;
  readiness: SolutionReadiness;
  transition: ConversationTransition;
  referencedField: string | null;
  toolAction: ConversationToolAction;
  responseFocus: ConversationResponseFocus;
  reasonCode: string | null;
  providerAvailable: boolean;
};

export type CommercialSolutionHandoff = {
  createdAtTurn: number;
  systemIdentity: string | null;
  scopeType: string | null;
  jurisdiction: string | null;
  confirmedEngineeringInputs: Array<{ field: string; value: string | number | boolean; source: string }>;
  limitations: string[];
  evidence: Array<{ title: string; url: string; publisher: string }>;
  unresolvedEngineeringFields: string[];
};

export type DraftAttachment = {
  name: string;
  type: string;
  size: number;
};

export type DraftLine = {
  itemName: string;
  quantity: number | null;
};

export type DraftFields = {
  customerId: string | null;
  customerMention: string | null;
  currencyCode: string | null;
  paymentTerms: string | null;
  scopeType: string | null;
  sourceReference: string | null;
  lines: DraftLine[];
};

export type CustomerCandidate = { id: string; name: string; aliases?: string[] };
export type CustomerResolution = {
  status: "UNRESOLVED" | "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";
  candidates: CustomerCandidate[];
};

export type ConversationTurn = {
  role?: "USER" | "ASSISTANT";
  source: ConversationReplySource;
  text: string;
  target?: string;
};
export type ConversationMessage = { role: "USER" | "ASSISTANT"; source: ConversationReplySource; text: string };

export type LiveResultStatus = "CONFIRMED" | "PROVISIONAL" | "DEFERRED" | "NEEDS_CONFIRMATION" | "PRICE_REQUIRED" | "VERIFIED";
export type LiveResultItem = { key: string; labelAr: string; labelEn: string; value: string; valueAr?: string; valueEn?: string; status: LiveResultStatus };
export type StructuredLiveResult = {
  /** Passive, user-facing projection. Keys are never rendered directly. */
  summary: LiveResultItem[];
  stillNeeded: Array<{ key: string; labelAr: string; labelEn: string }>;
  commercial: { lineCount: number; priceRequiredCount: number; draftReady: boolean };
  /** Detailed committed facts remain available behind one optional disclosure. */
  facts: LiveResultItem[];
  evidence: Array<{ title: string; url: string; publisher: string }>;
  /** Human-facing projection of governed system knowledge. No internal keys. */
  systemUnderstanding: {
    recognized: boolean;
    confidence: "TRUSTED" | "PROVISIONAL" | "SAFETY_CRITICAL";
    headingAr: string;
    headingEn: string;
    descriptionAr: string;
    descriptionEn: string;
    components: Array<{ labelAr: string; labelEn: string }>;
  } | null;
  readiness: CommercialReadiness;
};

export type MissingFieldKey = "customer" | "lines" | "sourceReference" | "attachment" | "userIntent" | "systemInput" | "catalogChoice" | "quantity" | "projectName" | "attentionName" | "expiryDate" | "paymentTerms" | "delivery" | "warranty";

export type FieldAnswer = { field: string; value: string; action?: "VALUE" | "NOT_APPLICABLE" | "DEFER" | "SKIP" };
export type FieldQuestion = {
  field: string;
  /** Engineering decision this prerequisite is helping the user resolve. */
  guidanceFor?: string;
  ar: string;
  en: string;
  allowNotApplicable: boolean;
  allowDefer?: boolean;
  deferLabelAr?: string;
  deferLabelEn?: string;
  nonDeferrableNotice?: { ar: string; en: string } | null;
  options?: Array<{ ar: string; en: string; value: string }>;
};
export type CommercialPhase = "COMPOSING" | "ANALYZING" | "NEEDS_INFO" | "FIELD_ANSWER_PENDING" | "RECALCULATING" | "DRAFT_READY_FOR_REVIEW";

export type MissingField = {
  key: MissingFieldKey;
  required: true;
  labelAr: string;
  labelEn: string;
  sourceField?: string;
  deferPolicy: "DEFER_ALLOWED" | "DEFER_NOT_ALLOWED";
  state?: "UNRESOLVED" | "DEFERRED" | "PROPOSED" | "AMBIGUOUS" | "RESOLVED";
};

export type RecommendedField = {
  key: "currency" | "paymentTerms" | "scopeType";
  labelAr: string;
  labelEn: string;
};

export type WorkingCommercialDraft = {
  /** Request-scoped committed facts and safe diagnostics; never model chain-of-thought. */
  transactionalState?: TransactionCommit;
  readinessStage?: CommercialReadiness;
  systemWorkingPlan?: {
    systemIdentity: string;
    knownInputs: Record<string, string | number | boolean>;
    missingInputs: string[];
    componentRequirements: string[];
    engineeringVerificationRequired: boolean;
    commercializationStatus: "PENDING" | "MATERIALIZED";
  } | null;
  /** Natural response is a projection of committed truth, never its authority. */
  assistantResponse?: { ar: string; en: string } | null;
  conversationMessages?: ConversationMessage[];
  structuredResult?: StructuredLiveResult;
  internalIterations?: number;
  conversationPhase?: ConversationPhase;
  solutionReadiness?: SolutionReadiness;
  orchestratorDecision?: ConversationOrchestratorDecision;
  commercialHandoff?: CommercialSolutionHandoff | null;
  pendingToolAction?: ConversationToolAction;
  completionDiagnostics?: { missingEngineering: string[]; missingCommercial: string[] };
  /** Versioned so previously persisted draft payloads can be upgraded on analysis. */
  completionVersion?: 1;
  phase?: CommercialPhase;
  activeQuestion?: FieldQuestion | null;
  notApplicable?: CommercialAnswerField[];
  deferredFields?: string[];
  /** Conversation-control only: prerequisites the user cannot currently answer. */
  temporarilyUnanswerable?: string[];
  systemAnswers?: SystemFieldAnswers;
  intelligenceText?: string;
  proposedCustomerName?: string | null;
  customerState?: "CUSTOMER_MISSING" | "CUSTOMER_PROPOSED_UNREGISTERED" | "CUSTOMER_AMBIGUOUS" | "CUSTOMER_RESOLVED";
  selection?: CommercialSelection;
  answers?: CommercialAnswers;
  id: string;
  operation: ConversationalOperation;
  documentMode: ConversationDocumentMode;
  buildMode: ConversationBuildMode;
  locale: ConversationLocale;
  fields: DraftFields;
  customerResolution: CustomerResolution;
  canonicalProposal: SalesAssistantDraftProposal | null;
  attachment: DraftAttachment | null;
  turns: ConversationTurn[];
  contextText: string;
  missingRequired: MissingField[];
  recommended: RecommendedField[];
  status: "NEEDS_CLARIFICATION" | "READY_FOR_REVIEW";
  clarification: { ar: string; en: string; suggestions: Array<{ ar: string; en: string; reply: string }> } | null;
  requiresHumanReview: true;
  executed: false;
};

export type AdvanceConversationInput = {
  draft?: WorkingCommercialDraft | null;
  reply: string;
  replySource: ConversationReplySource;
  locale: ConversationLocale;
  operation?: ConversationalOperation | null;
  attachment?: DraftAttachment | null;
  documentMode?: ConversationDocumentMode;
  buildMode?: ConversationBuildMode;
};
