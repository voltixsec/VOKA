import type { ConversationToolKind, ToolObservation } from "@/src/application/conversation-runtime";

export interface SourceArtifactInspectionPort {
  inspect(input: {
    companyId: string;
    artifactId: string;
    kind: Extract<ConversationToolKind, "ATTACHMENT_INSPECTION" | "BOQ_INSPECTION" | "DRAWING_INSPECTION">;
    query: string;
    /** Conversation/runtime identity used to scope any Requirement produced from the inspection. */
    conversationRuntimeId?: string | null;
  }): Promise<ToolObservation>;
}

export interface NormalizedRequirementPort {
  synchronize(input: {
    companyId: string;
    userId?: string | null;
    /** Conversation/runtime identity; Requirement stable keys are scoped by it so conversations never collide. */
    conversationRuntimeId: string;
    facts: Record<string, import("@/src/application/conversation-runtime").ConfirmedFact>;
    graph: import("@/src/application/conversation-runtime").SystemConfigurationGraph;
    citations: import("@/src/application/conversation-runtime").ToolCitation[];
  }): Promise<void>;
}
