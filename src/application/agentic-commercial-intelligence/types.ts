import type { SystemInputGuidance } from "../../domain/smart-system/types";

export type AgentKnowledgeProvenance =
  | "VERIFIED_PROFILE"
  | "USER_PROVIDED"
  | "DOCUMENT_PROVIDED"
  | "DATABASE_RESOLVED"
  | "RESEARCHED"
  | "AI_INTERPRETED"
  | "DETERMINISTIC_CALCULATION"
  | "NEEDS_CONFIRMATION";

export type ResearchEvidence = {
  title: string;
  url: string;
  publisher: string;
  sourceType?: ResearchSourceType;
  claimSupport?: string[];
  qualityScore?: number;
  provenance: "RESEARCHED";
};

export type ResearchSourceType =
  | "GOVERNMENT_AUTHORITY"
  | "MANUFACTURER_TECHNICAL"
  | "MANUFACTURER_PRODUCT"
  | "STANDARDS_ORGANIZATION"
  | "SPECIALIST_TECHNICAL"
  | "LOCAL_DISTRIBUTOR"
  | "SUPPLIER_DEALER"
  | "MARKETPLACE"
  | "SOCIAL_DISCOVERY"
  | "OTHER";

export type ResearchedProductAlternative = {
  componentKey: string;
  productName: string;
  brand: string | null;
  model: string | null;
  sourceUrl: string;
  sourceTitle: string;
  jurisdictionRelevance: string | null;
  confidence: number;
  evidenceBasis: string[];
  evidenceRole: "TECHNICAL_AND_AVAILABILITY" | "AVAILABILITY" | "LOCAL_SUPPLIER_EVIDENCE" | "GLOBAL_PRODUCT_AUTHORITY" | "DISCOVERY_ONLY";
  imageUrl?: string | null;
  marketPrice?: MarketPriceEvidence | null;
};

export type MarketPriceEvidence = {
  priceAmount: number | null;
  priceCurrency: string;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string | null;
  priceType: "LISTED_RETAIL" | "LISTED_WHOLESALE" | "PROMOTIONAL" | "FROM_PRICE" | "RANGE" | "UNKNOWN";
  priceSourceUrl: string;
  priceSourceTitle: string;
  priceObservedAt: string;
};

export type ResearchDiagnosticCode =
  | "WEB_SEARCH_HTTP_429" | "WEB_SEARCH_HTTP_5XX" | "WEB_SEARCH_TIMEOUT" | "WEB_SEARCH_INCOMPLETE"
  | "WEB_SEARCH_NO_SOURCES" | "WEB_SEARCH_NO_NORMALIZABLE_PRODUCTS" | "WEB_SEARCH_ALL_CANDIDATES_REJECTED"
  | "WEB_SEARCH_MALFORMED" | "WEB_SEARCH_PROVIDER_FAILURE";

export type ProvisionalSystemInput = {
  name: string;
  labelAr: string;
  labelEn: string;
  value: string | number | boolean | null;
  unit?: string | null;
  required: boolean;
  provenance: AgentKnowledgeProvenance;
  guidance?: SystemInputGuidance;
  /** Optional conversational dependency; it narrows another input but never derives its value. */
  prerequisiteFor?: string;
  prerequisiteReasonAr?: string;
  prerequisiteReasonEn?: string;
};

export type ProvisionalSystemModel = {
  systemName: string;
  aliases: string[];
  purpose: string;
  componentCategories: string[];
  inputs: ProvisionalSystemInput[];
  limitations: string[];
  confidence: number;
  jurisdiction: string | null;
  evidence: ResearchEvidence[];
  productAlternatives?: ResearchedProductAlternative[];
  provenance: "RESEARCHED" | "AI_INTERPRETED";
  requiresEngineeringVerification: true;
};

export type AgenticCommercialState = {
  route: "VERIFIED_PROFILE" | "PROVISIONAL_RESEARCH" | "PROVISIONAL_INTERPRETATION";
  systemName: string;
  profileId: string | null;
  profileVersion: string | null;
  provisionalSystem: ProvisionalSystemModel | null;
  researchQuery: string | null;
  researchStatus: "NOT_REQUIRED" | "COMPLETED" | "UNAVAILABLE";
  missingInputs: string[];
  readiness: "NEEDS_CLARIFICATION" | "PROVISIONAL_REVIEW" | "VERIFIED_CALCULATION";
  requiresHumanReview: true;
};
