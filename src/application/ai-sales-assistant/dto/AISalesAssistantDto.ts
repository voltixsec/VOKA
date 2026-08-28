import type { QuotationScopeType } from "../../../domain/quotation/types/QuotationScopeType";
import type { CommercialRequirement } from "./CommercialRequirement";
import type { SystemCalculationResult, SystemInputParameter, SystemComponent } from "../../../domain/smart-system";

export const SALES_ASSISTANT_PROMPT_MAX_LENGTH = 4_000;
export const SALES_ASSISTANT_MAX_LINES = 20;
export const SALES_ASSISTANT_MAX_CANDIDATES = 5;

export type SalesAssistantSourceLocale = "ar" | "en";
export type CommercialProvenance = "USER_PROVIDED" | "COMPANY_DEFAULT" | "CUSTOMER_DEFAULT" | "CATALOG_MATCHED" | "RULE_CALCULATED" | "AI_ESTIMATED" | "NEEDS_CONFIRMATION";
export interface CommercialFact { name: string; value: string; evidence: string; provenance?: "USER_PROVIDED"; }
export interface CommercialSelection { customer?: { id: string; name: string }; catalog?: Record<string, { id: string; name: string }> }
export type CommercialAnswerField = "customerMention" | "projectName" | "attentionName" | "expiryDate" | "paymentTerms" | "delivery" | "warranty" | "notes" | "cameraCount" | "storageDays" | "bitrateMbps" | "cableMetersPerCamera";
export type CommercialAnswers = Partial<Record<CommercialAnswerField, string>>;
export type CommercialTerms = { paymentTerms: string | null; delivery: string | null; warranty: string | null };
export type PaymentTermsReview = { reason: 'TOTAL_NOT_100' | 'MALFORMED' | 'UNTRANSLATED'; totalPercentage: number | null };
export type SystemFieldAnswers = Record<string, NonNullable<SystemInputParameter["value"]>>;
export type SalesItemIntent =
  | "PRODUCT"
  | "SERVICE"
  | "CUSTOM"
  | "UNKNOWN";

export interface AISalesAssistantRequest {
  companyId: string;
  prompt: string;
  sourceLocale?: SalesAssistantSourceLocale;
  buildMode?: "AUTO" | "CATALOG_ONLY" | "SUPPLY_INSTALL_SYSTEM";
  selection?: CommercialSelection;
  answers?: CommercialAnswers;
  systemAnswers?: SystemFieldAnswers;
  /** Calendar date anchoring validity while a working draft is being clarified. */
  validityBaseDate?: string;
  notApplicable?: CommercialAnswerField[];
  /** Editable line intent only; never authoritative IDs, prices, tax or engineering formulas. */
  retainedLines?: ExtractedLineItem[];
  retainedContext?: Pick<ExtractedSalesIntent, "subject" | "brief" | "scopeType" | "currencyCode">;
}

export interface ExtractedLineItem {
  /** Assigned only by deterministic commercialization, never provider output. */
  commercialRequirement?: CommercialRequirement;
  /** Server-owned provisional commercial scope; not an engineered SKU/count. */
  commercializationPending?: boolean;
  text: string;
  itemNameAr?: string;
  itemNameEn?: string;
  description?: string | null;
  quantity?: number | null;
  requestedUnitText?: string | null;
  requestedPrice?: number | null;
  typeIntent?: SalesItemIntent;
  uncertainty?: string | null;
  warnings?: string[];
  provenance?: "USER_PROVIDED" | "CALCULATED" | "SUGGESTED";
  formulaExplanation?: string;
  formulaExplanationAr?: string;
  componentKey?: string;
}

export interface ExtractedSalesIntent {
  /** Assigned by the application, never accepted from structured provider output. */
  commercialSourceText?: string;
  documentType?: "QUOTATION" | "INVOICE" | "CONTRACT" | "SALES_ORDER" | "DRAWING_TAKEOFF" | null;
  facts?: CommercialFact[];
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
  delivery?: string | null;
  expiryDate?: string | null;
  paymentTerms?: string | null;
  currencyCode?: string | null;
  lines: ExtractedLineItem[];
  notes?: string | null;
  uncertainty?: string | null;
  warnings?: string[];
  /** Server-owned deterministic context. Provider output is never allowed to set this. */
  smartSystem?: SystemCalculationResult | null;
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
  proposedCustomerName?: string | null;
  preferredCurrency?: string | null;
  paymentTermDays?: number | null;
  countryCode?: string | null;
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
  nameAr?: string | null;
  nameEn?: string | null;
  quantity?: number;
  unitName?: string;
  id: string;
  code: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
}

export interface ResolvedLineItem {
  commercialRequirement?: CommercialRequirement;
  itemCode?: string | null;
  commercializationPending?: boolean;
  priceSource?: CommercialProvenance;
  priceEstimate?: { region: string | null; reference: string; confidence: "LOW"; verified: false };
  quantitySource?: CommercialProvenance;
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
  provenance?: "USER_PROVIDED" | "CALCULATED" | "SUGGESTED";
  formulaExplanation?: string;
  formulaExplanationAr?: string;
  componentKey?: string;
}

export interface DraftProposalFinancials {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface SalesAssistantDraftProposal {
  /** Internal clarification diagnostic; never inserted into customer-facing Terms. */
  paymentTermsReview?: PaymentTermsReview;
  commercialTerms?: CommercialTerms;
  fieldDefaults?: { expiryDate: string | null; paymentTerms: string | null; delivery: string | null; warranty: string | null };
  fieldProvenance?: Partial<Record<CommercialAnswerField, CommercialProvenance>>;
  documentType?: ExtractedSalesIntent["documentType"];
  facts?: CommercialFact[];
  completion?: { subject: CommercialProvenance; brief: CommercialProvenance; currency: CommercialProvenance; terms: CommercialProvenance; scope: CommercialProvenance };
  estimateNotice?: boolean;
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
    expiryDate?: string | null;
    validityBaseDate?: string;
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
  smartSystem?: {
    /** Internal engineering requirements, never customer quotation lines. */
    requirements?: SystemComponent[];
    systemType: string;
    templateVersion: string;
    systemNameAr: string;
    systemNameEn: string;
    status: "COMPLETE" | "NEEDS_CONFIRMATION" | "INVALID_INPUT";
    inputs: Array<{
      name: string;
      labelAr: string;
      labelEn: string;
      value: number | string | boolean | null;
      unit?: string | null;
      provenance: "USER_PROVIDED" | "CALCULATED" | "SUGGESTED";
      isDefault?: boolean;
    }>;
    missingInputs: string[];
    warnings: string[];
  } | null;
  metadata: {
    region?: string | null;
    sourceLocale: SalesAssistantSourceLocale;
    extractionMode: "provider" | "heuristic";
    confidenceSummary: string;
    warnings: string[];
  };
}
