export type ConversationLocale = "ar" | "en";
export type ConversationMessageSource = "TEXT" | "VOICE" | "CHIP";
export type FactProvenance = "USER_CORRECTION" | "USER_APPROVED" | "USER_EXPLICIT" | "VERIFIED_DOCUMENT" | "VERIFIED_DATABASE" | "TRUSTED_PROFILE" | "DETERMINISTIC_DERIVATION" | "RESEARCHED" | "AI_INFERRED" | "DEFAULT";
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

export type CandidateFact = ConfirmedFact & {
  status: "COMMITTED" | "PENDING_APPROVAL" | "REJECTED";
  rejectionReason: string | null;
  proposalGroupId?: string | null;
};
export type SolutionReadiness = "EXPLORING" | "MATURE" | "AWAITING_USER_CONFIRMATION" | "READY_FOR_HANDOFF";
export type TransitionState = "EXPLORING" | "PROPOSED" | "TRANSITION_REQUESTED" | "COMMERCIAL_HANDOFF";
export type ConversationToolKind = "ENGINEERING_KNOWLEDGE" | "RESEARCH" | "CATALOG_LOOKUP" | "PRICING_LOOKUP" | "CUSTOMER_LOOKUP" | "ATTACHMENT_INSPECTION" | "DRAWING_INSPECTION" | "BOQ_INSPECTION";

export type ToolRequest = { kind: ConversationToolKind; query: string; attachmentId: string | null };
export type ToolObservation = { kind: ConversationToolKind; status: "COMPLETED" | "UNAVAILABLE" | "ATTACHMENT_REQUIRED"; summary: string; evidence: Array<{ title: string; url: string; publisher: string }>; createdAt: string };

export type PendingState = "CONFIRMED" | "PENDING";
export type SolutionBomLine = {
  id: string;
  componentKeys: string[];
  category: string;
  itemName: string;
  itemNameAr: string;
  itemNameEn: string;
  description?: string | null;
  unitName: string | null;
  quantity: number | null;
  quantityState: PendingState;
  unitPrice: number | null;
  priceState: PendingState;
  type: "PRODUCT" | "SERVICE";
  provenance: FactProvenance | "VERIFIED_CATALOG" | "GOVERNED_TEMPLATE";
  catalogItemId?: string | null;
  brand?: string | null;
  model?: string | null;
};

export type CandidateProduct = {
  id: string;
  componentKey: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  price: number | null;
  source: "VERIFIED_CATALOG" | "RESEARCHED" | "SUGGESTED";
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  jurisdictionRelevance?: string | null;
  confidence?: number | null;
  evidenceBasis?: string[];
  evidenceRole?: "TECHNICAL_AND_AVAILABILITY" | "AVAILABILITY" | "DISCOVERY_ONLY";
};

export type SystemConfigurationGraph = {
  system: { key: string; nameAr: string; nameEn: string } | null;
  requirements: Array<{ key: string; labelAr: string; labelEn: string; value: FactValue; provenance: FactProvenance }>;
  unresolvedDecisions: Array<{ key: string; labelAr: string; labelEn: string; safetyCritical: boolean }>;
  assumptions: Array<{ key: string; textAr: string; textEn: string }>;
  engineeringCalculations: Array<{ key: string; labelAr: string; labelEn: string; value: string; provenance: "DETERMINISTIC_DERIVATION" | "GOVERNED_TEMPLATE" }>;
  engineeringBom: SolutionBomLine[];
  salesBom: SolutionBomLine[];
  candidateProducts: CandidateProduct[];
  catalogResolution: "NOT_REQUIRED" | "PENDING" | "CATALOG_MATCHED" | "CATALOG_INSUFFICIENT" | "RESEARCHED_SUGGESTIONS";
  readiness: { draftReady: boolean; pendingBeforeDraftOpen: string[]; pendingBeforeFinalIssue: string[] };
};

export type ConfirmedCommercialLine = {
  catalogItemId: string | null;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  unitName?: string | null;
  quantity: number | null;
  unitPrice: number | null;
  type: "PRODUCT" | "SERVICE";
  authority: "VERIFIED_PROFILE" | "VERIFIED_DATABASE" | "DETERMINISTIC_DERIVATION" | "RESEARCHED";
  quantityState?: PendingState;
  priceState?: PendingState;
  componentKeys?: string[];
  brand?: string | null;
  model?: string | null;
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
  /** Server signature over the complete governed runtime snapshot. */
  stateToken?: string | null;
  /** Added after runtime v1 launch; absent only in safely hydrated legacy session state. */
  solutionGraph?: SystemConfigurationGraph;
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
