import type { CommercialOperation } from "../commercial-entry";
import type { SalesAssistantDraftProposal } from "../ai-sales-assistant";
import type { CommercialSelection, CommercialAnswers } from "../ai-sales-assistant/dto/AISalesAssistantDto";

export type ConversationalOperation = Exclude<CommercialOperation, "PAYMENT">;
export type ConversationReplySource = "TEXT" | "VOICE" | "CHIP";
export type ConversationLocale = "ar" | "en";
export type ConversationDocumentMode = "AUTO" | "QUOTATION" | "INVOICE" | "CONTRACT" | "SALES_ORDER";
export type ConversationBuildMode = "AUTO" | "CATALOG_ONLY" | "SUPPLY_INSTALL_SYSTEM" | "DRAWING";

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
  source: ConversationReplySource;
  text: string;
};

export type MissingFieldKey = "customer" | "lines" | "sourceReference" | "attachment" | "userIntent" | "systemInput" | "catalogChoice" | "quantity";

export type MissingField = {
  key: MissingFieldKey;
  required: true;
  labelAr: string;
  labelEn: string;
  sourceField?: string;
};

export type RecommendedField = {
  key: "currency" | "paymentTerms" | "scopeType";
  labelAr: string;
  labelEn: string;
};

export type WorkingCommercialDraft = {
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
