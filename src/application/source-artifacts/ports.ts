import type { ConversationToolKind, ToolObservation } from "@/src/application/conversation-runtime";

export interface SourceArtifactInspectionPort {
  inspect(input: { runtimeId?: string; companyId: string; artifactId: string; kind: Extract<ConversationToolKind, "ATTACHMENT_INSPECTION" | "BOQ_INSPECTION" | "DRAWING_INSPECTION">; query: string }): Promise<ToolObservation>;
}

export interface NormalizedRequirementPort {
  synchronize(input: { runtimeId: string; companyId: string; userId?: string | null; facts: Record<string, import("@/src/application/conversation-runtime").ConfirmedFact>; graph: import("@/src/application/conversation-runtime").SystemConfigurationGraph; citations: import("@/src/application/conversation-runtime").ToolCitation[] }): Promise<void>;
}
