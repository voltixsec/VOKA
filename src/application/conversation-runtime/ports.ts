import type { ConversationBrainDecision, ConversationLocale, ConversationRuntimeState, FlexibleTurnProposal, SystemConfigurationGraph, ToolObservation, ToolRequest } from "./types";

export interface ConversationBrainPort {
  decide(input: {
    locale: ConversationLocale;
    currentMessage: string;
    recentMessages: ConversationRuntimeState["messages"];
    confirmedFacts: ConversationRuntimeState["confirmedFacts"];
    workspace: ConversationRuntimeState["workspace"];
    compactMemory: string;
    toolResults: ToolObservation[];
    attachmentAvailable: boolean;
    attachment: { id: string | null; name: string; type: string } | null;
    availableTools: ToolRequest["kind"][];
  }): Promise<ConversationBrainDecision>;
}

export interface ConversationToolPort {
  execute(input: { request: ToolRequest; companyId: string; locale: ConversationLocale; graph: SystemConfigurationGraph }): Promise<ToolObservation>;
}

export interface SolutionCandidateResolverPort {
  resolve(input: {
    graph: SystemConfigurationGraph;
    companyId: string;
    locale: ConversationLocale;
    mode: "CATALOG_ONLY" | "WEB_FALLBACK";
    query: string;
    requestedCount: number;
  }): Promise<{ graph: SystemConfigurationGraph; researchObservation?: ToolObservation }>;
}

export interface FlexibleBrainPort {
  decide(input: Parameters<ConversationBrainPort["decide"]>[0]): Promise<FlexibleTurnProposal>;
}

export interface WorkspaceDefaultsPort {
  loadDefaults(companyId: string, scopeType: import("@/src/domain/quotation").QuotationScopeType | null, locale?: ConversationLocale): Promise<import("./commercial-defaults").CommercialDefaultsProfile>;
}
