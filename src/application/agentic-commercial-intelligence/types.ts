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
  provenance: "RESEARCHED";
};

export type ProvisionalSystemInput = {
  name: string;
  labelAr: string;
  labelEn: string;
  value: string | number | boolean | null;
  unit?: string | null;
  required: boolean;
  provenance: AgentKnowledgeProvenance;
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
