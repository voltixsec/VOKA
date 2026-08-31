export type ConversationLocale = "ar" | "en";
export type ConversationMessageSource = "TEXT" | "VOICE" | "CHIP";
export type FactProvenance = "USER_CORRECTION" | "USER_EXPLICIT" | "VERIFIED_DOCUMENT" | "VERIFIED_DATABASE" | "TRUSTED_PROFILE" | "DETERMINISTIC_DERIVATION" | "RESEARCHED" | "AI_INFERRED" | "DEFAULT";
export type FactValue = string | number | boolean;

export type RuntimeMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  text: string;
  source: ConversationMessageSource | "AI";
  createdAt: string;
};

export type ConfirmedFact = {
  key: string;
  value: FactValue;
  provenance: FactProvenance;
  evidence: string;
  updatedAt: string;
};

export type CandidateFact = ConfirmedFact & { status: "COMMITTED" | "REJECTED"; rejectionReason: string | null };
export type SolutionReadiness = "EXPLORING" | "MATURE" | "AWAITING_USER_CONFIRMATION" | "READY_FOR_HANDOFF";
export type TransitionState = "EXPLORING" | "PROPOSED" | "COMMERCIAL_HANDOFF";
export type ConversationToolKind = "ENGINEERING_KNOWLEDGE" | "RESEARCH" | "CATALOG_LOOKUP" | "PRICING_LOOKUP" | "CUSTOMER_LOOKUP" | "ATTACHMENT_INSPECTION" | "DRAWING_INSPECTION" | "BOQ_INSPECTION";

export type ToolRequest = { kind: ConversationToolKind; query: string; attachmentId: string | null };
export type ToolObservation = { kind: ConversationToolKind; status: "COMPLETED" | "UNAVAILABLE" | "ATTACHMENT_REQUIRED"; summary: string; evidence: Array<{ title: string; url: string; publisher: string }>; createdAt: string };

export type ConfirmedCommercialLine = {
  catalogItemId: string;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  unitName?: string | null;
  quantity: number;
  unitPrice: number;
  type: "PRODUCT" | "SERVICE";
  authority: "VERIFIED_PROFILE" | "VERIFIED_DATABASE";
};

export type CommercialSolutionHandoff = {
  runtimeId: string;
  confirmedFacts: Record<string, ConfirmedFact>;
  commercialLines: ConfirmedCommercialLine[];
  toolEvidence: ToolObservation[];
  createdAt: string;
};

export type ConversationRuntimeState = {
  runtimeId: string;
  version: 1;
  locale: ConversationLocale;
  messages: RuntimeMessage[];
  confirmedFacts: Record<string, ConfirmedFact>;
  candidateFacts: CandidateFact[];
  unresolvedImportantQuestions: string[];
  toolResults: ToolObservation[];
  solutionReadiness: SolutionReadiness;
  transitionState: TransitionState;
  compactMemory: string;
  suggestedReplies: string[];
  handoff: CommercialSolutionHandoff | null;
  /** Server-signed envelope. Required by consequential handoff consumers. */
  handoffToken?: string | null;
};

export type BrainFactProposal = { key: string; value: FactValue; provenance: "USER_EXPLICIT" | "USER_CORRECTION" | "AI_INFERRED" | "RESEARCHED"; evidence: string };
export type ConversationBrainDecision = {
  reply: string;
  factProposals: BrainFactProposal[];
  unresolvedImportantQuestions: string[];
  toolRequest: ToolRequest | null;
  solutionReadiness: SolutionReadiness;
  transition: "NONE" | "PROPOSE" | "CONFIRM" | "REOPEN";
  compactMemory: string;
  suggestedReplies: string[];
};

export type ConversationTurnInput = {
  state: ConversationRuntimeState | null;
  message: string;
  locale: ConversationLocale;
  source: ConversationMessageSource;
  attachment?: { id?: string; name: string; type: string; size: number } | null;
  companyId: string;
};
