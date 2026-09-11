import type { ConversationToolKind, ToolObservation } from "@/src/application/conversation-runtime";
import type { OcrPageRequest, OcrPageResult, VisualInspectionRequest, VisualInspectionResult } from "@/src/domain/source-artifact";

export interface SourceArtifactInspectionPort {
  /**
   * `governedFacts` are the facts the workspace already holds, so observed values can be
   * checked for conflicts without ever overwriting governed state.
   */
  /**
   * `locale` is the runtime/user locale. It drives the language of the inspection brief only;
   * it is never inferred from the artifact or its contents.
   */
  inspect(input: { runtimeId?: string; companyId: string; artifactId: string; kind: Extract<ConversationToolKind, "ATTACHMENT_INSPECTION" | "BOQ_INSPECTION" | "DRAWING_INSPECTION">; query: string; locale?: import("@/src/application/conversation-runtime").ConversationLocale; governedFacts?: Array<{ key: string; value: import("@/src/application/conversation-runtime").FactValue; provenance: import("@/src/application/conversation-runtime").FactProvenance }> }): Promise<ToolObservation>;
}

/**
 * Phase 2A-2 OCR boundary.
 *
 * An OCR engine turns one scanned page into candidate text. It owns no
 * business rules: no classification, no observation extraction, no approval.
 * Implementations must echo the request page number (never invent one) and
 * must never fabricate text when recognition did not run.
 */
export interface OcrPort {
  /** Engine/provider identity, carried through as provenance. */
  readonly engineId: string;
  recognize(request: OcrPageRequest): Promise<OcrPageResult>;
}

/**
 * Phase 2A-3 visual-inspection boundary.
 *
 * A vision provider turns one image into bounded candidate descriptions. It
 * owns no business rules: no classification, no approval, no product
 * selection, no quantity approval. Implementations must echo the request page
 * number (null for standalone images, never invented) and must never
 * fabricate observations when inspection did not run.
 */
export interface VisualInspectionPort {
  /** Provider identity, carried through as provenance. */
  readonly providerId: string;
  inspect(request: VisualInspectionRequest): Promise<VisualInspectionResult>;
}

export interface NormalizedRequirementPort {
  synchronize(input: { runtimeId: string; companyId: string; userId?: string | null; facts: Record<string, import("@/src/application/conversation-runtime").ConfirmedFact>; graph: import("@/src/application/conversation-runtime").SystemConfigurationGraph; citations: import("@/src/application/conversation-runtime").ToolCitation[] }): Promise<void>;
}
