import type { ConversationBrainDecision, ConversationLocale, ConversationRuntimeState, ToolObservation, ToolRequest } from "./types";

export interface ConversationBrainPort {
  decide(input: {
    locale: ConversationLocale;
    currentMessage: string;
    recentMessages: ConversationRuntimeState["messages"];
    confirmedFacts: ConversationRuntimeState["confirmedFacts"];
    compactMemory: string;
    toolResults: ToolObservation[];
    attachmentAvailable: boolean;
    attachment: { id: string | null; name: string; type: string } | null;
    availableTools: ToolRequest["kind"][];
  }): Promise<ConversationBrainDecision>;
}

export interface ConversationToolPort {
  execute(input: { request: ToolRequest; companyId: string; locale: ConversationLocale }): Promise<ToolObservation>;
}
