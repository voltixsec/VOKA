import type { QuotationScopeType } from "../../../domain/quotation/types/QuotationScopeType";

export const SALES_ASSISTANT_PROMPT_MAX_LENGTH = 4_000;
export const SALES_ASSISTANT_MAX_LINES = 20;
export const SALES_ASSISTANT_MAX_CANDIDATES = 5;

export type SalesAssistantSourceLocale = "ar" | "en";
export type SalesItemIntent =
  | "PRODUCT"
  | "SERVICE"
  | "CUSTOM"
  | "UNKNOWN";

export interface AISalesAssistantRequest {
  companyId: string;
  prompt: string;
  sourceLocale?: SalesAssistantSourceLocale;
}

export interface ExtractedLineItem {
  text: string;
  description?: string | null;
  quantity?: number | null;
  requestedUnitText?: string | null;
  requestedPrice?: number | null;
  typeIntent?: SalesItemIntent;
  uncertainty?: string | null;
  warnings?: string[];
}

export interface ExtractedSalesIntent {
  sourceLocale?: SalesAssistantSourceLocale;
  customerMention?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  projectName?: string | null;
  subject?: string | null;
  attentionName?: string | null;
  brief?: string | null;
  scopeType?: QuotationScopeType | null;
  scopeOfWork?: string | null;
  warranty?: string | null;
  paymentTerms?: string | null;
  currencyCode?: string | null;
  lines: ExtractedLineItem[];
  notes?: string | null;
  uncertainty?: string | null;
  warnings?: string[];
}

export interface ExtractedIntentResult {
  intent: ExtractedSalesIntent;
  extractionMode: "provider" | "heuristic";
  warnings: string[];
}

export interface CustomerCandidateOption {
  id: string;
  code: string;
  name: string;
  email: string | null;
  status: "LEAD" | "ACTIVE";
}

export interface ResolvedCustomerCandidate {
  status: "MATCHED" | "MISSING" | "AMBIGUOUS";
  id: string | null;
  mention: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  candidates: CustomerCandidateOption[];
  reviewRequired: boolean;
}

export interface CatalogCandidateOption {
  id: string;
  code: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
}

export interface ResolvedLineItem {
  resolutionStatus:
    | "MATCHED"
    | "MISSING"
    | "AMBIGUOUS"
    | "CUSTOM";
  type: "PRODUCT" | "SERVICE" | "CUSTOM";
  catalogItemId: string | null;
  catalogCandidates: CatalogCandidateOption[];
  itemName: string;
  itemNameAr: string | null;
  itemNameEn: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  quantity: number | null;
  requestedUnitText: string | null;
  unitName: string | null;
  unitNameAr: string | null;
  unitNameEn: string | null;
  requestedPrice: number | null;
  unitPrice: number | null;
  subtotal: number | null;
  taxRateId: string | null;
  taxPercentage: number;
  reviewRequired: boolean;
}

export interface DraftProposalFinancials {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface SalesAssistantDraftProposal {
  customer: ResolvedCustomerCandidate;
  proposal: {
    subject: string;
    subjectAr: string | null;
    subjectEn: string | null;
    brief: string | null;
    briefAr: string | null;
    briefEn: string | null;
    projectName: string | null;
    attentionName: string | null;
    scopeType: QuotationScopeType | null;
    currencyCode: string;
    priceListId: string | null;
  };
  lines: ResolvedLineItem[];
  financials: DraftProposalFinancials | null;
  notes: string | null;
  notesAr: string | null;
  notesEn: string | null;
  termsAndConditions: string | null;
  termsAndConditionsAr: string | null;
  termsAndConditionsEn: string | null;
  reviewRequired: boolean;
  metadata: {
    sourceLocale: SalesAssistantSourceLocale;
    extractionMode: "provider" | "heuristic";
    confidenceSummary: string;
    warnings: string[];
  };
}
