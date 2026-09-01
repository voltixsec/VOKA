import type { ProvisionalSystemModel, ResearchDiagnosticCode } from "./types";

export interface CommercialSystemResearchPort {
  researchSystem(input: {
    companyId: string;
    /** Generalized technical query: customer/project identity must not be included. */
    query: string;
    locale: "ar" | "en";
    jurisdiction: string | null;
    /** Called only when the adapter performs an external provider request. */
    onProviderCall?: () => void;
  }): Promise<ProvisionalSystemModel | null>;
  researchSystemWithDiagnostic?(input: Parameters<CommercialSystemResearchPort["researchSystem"]>[0]): Promise<{ model: ProvisionalSystemModel | null; diagnostic: ResearchDiagnosticCode | null }>;
}

/** Future BOQ/drawing/specification adapters provide facts, never authority. */
export interface AttachmentEvidencePort {
  readEvidence(input: { companyId: string; attachmentId: string }): Promise<Array<{
    name: string;
    value: string | number | boolean;
    evidenceReference: string;
    provenance: "DOCUMENT_PROVIDED";
  }>>;
}
