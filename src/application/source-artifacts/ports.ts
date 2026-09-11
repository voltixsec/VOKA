import type { ConversationToolKind, ToolObservation } from "@/src/application/conversation-runtime";

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

export interface NormalizedRequirementPort {
  synchronize(input: { runtimeId: string; companyId: string; userId?: string | null; facts: Record<string, import("@/src/application/conversation-runtime").ConfirmedFact>; graph: import("@/src/application/conversation-runtime").SystemConfigurationGraph; citations: import("@/src/application/conversation-runtime").ToolCitation[] }): Promise<void>;
}
