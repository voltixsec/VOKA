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

// ---------------------------------------------------------------------------
// Phase 2A-9: governed proprietary artifact derivation seam.
//
// A ConversionProvider turns the immutable bytes of a proprietary ORIGINAL
// artifact (DWG/RVT) into candidate derived bytes (DXF/IFC). It owns no
// business rules: no validation of its own output, no lineage, no ingest.
// The orchestrator re-validates every output through the accepted format
// detectors before anything is stored, so a converter is never trusted.
// ---------------------------------------------------------------------------

/** Static, bounded safety limits for one conversion. */
export type ConversionLimits = {
  /** Wall-clock budget for the whole conversion. */
  wallClockMs: number;
  /** Hard cap on the size of the derived output bytes. */
  maxOutputBytes: number;
  /** Hard cap on retained provider warnings. */
  maxWarnings: number;
  /** Hard cap on retained fidelity limitations. */
  maxFidelityLimitations: number;
  /**
   * Network posture of the provider. Production defaults to and requires
   * NONE unless a future provider is separately authorized.
   */
  networkAccess: "NONE";
};

export const DEFAULT_CONVERSION_LIMITS: ConversionLimits = {
  wallClockMs: 120_000,
  maxOutputBytes: 25 * 1024 * 1024,
  maxWarnings: 10,
  maxFidelityLimitations: 12,
  networkAccess: "NONE",
};

export type ConversionRequest = {
  derivationKind: import("@/src/domain/source-artifact").ArtifactDerivationKind;
  /** Immutable original bytes. Providers never receive a mutable reference. */
  sourceBytes: Uint8Array;
  /** SHA-256 of the source bytes, as persisted on the original artifact. */
  sourceHash: string;
  targetFormat: "DXF" | "IFC";
  options: import("@/src/domain/source-artifact").DerivationOptions;
  limits: ConversionLimits;
  /** Cooperative cancellation; providers must honor it at safe boundaries. */
  signal?: AbortSignal | null;
};

export type ConversionResult =
  | {
    status: "SUCCEEDED";
    /** Candidate derived bytes. ALWAYS re-validated before ingest. */
    outputBytes: Uint8Array;
    /** Channel A: provider warnings, bounded by the request limits. */
    warnings: string[];
    /** Version string the provider itself declares. Never fabricated. */
    converterVersion: string;
  }
  | {
    status: "FAILED";
    reason: string;
    warnings: string[];
    converterVersion: string | null;
  }
  | {
    status: "UNAVAILABLE";
    reason: string;
    warnings: string[];
    converterVersion: null;
  };

export interface ConversionProvider {
  /** Deterministic provider identity, carried into derivation lineage. */
  readonly providerId: string;
  /**
   * Deterministic converter version declared up front. It participates in the
   * automated derivation key, so a version change produces a new derivation
   * instead of overwriting history.
   */
  readonly converterVersion: string;
  /** Derivation kinds this provider can serve. */
  readonly supportedDerivationKinds: readonly import("@/src/domain/source-artifact").ArtifactDerivationKind[];
  convert(request: ConversionRequest): Promise<ConversionResult>;
}
