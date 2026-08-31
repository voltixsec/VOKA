export interface AISalesAssistantPort {
  reasonConversation?(input: {
    locale: "ar" | "en";
    currentTurn: string;
    history: Array<{ role: "USER" | "ASSISTANT"; text: string }>;
    committedFacts: Record<string, unknown>;
    activeQuestion: string | null;
    activeSystem: string | null;
    documentIntent: string | null;
    missingEngineeringFields?: string[];
    missingCommercialFields?: string[];
    conversationPhase?: "SOLUTION_EXPLORATION" | "TRANSITION_PROPOSED" | "COMMERCIAL_HANDOFF";
    attachmentAvailable?: boolean;
  }): Promise<unknown>;
  extractCustomerMention?(prompt: string, sourceLocale: "ar" | "en"): Promise<unknown>;
  estimatePrices?(input: { currency: string; region: string | null; lines: Array<{ key: string; name: string; unit: string | null }> }): Promise<unknown>;
  extractIntent(
    prompt: string,
    sourceLocale: "ar" | "en",
  ): Promise<unknown>;
  generateConversationResponse?(input: {
    locale: "ar" | "en";
    userMessage: string;
    conversationHistory: Array<{ role: "USER" | "ASSISTANT"; text: string }>;
    committedTruth: Record<string, unknown>;
    nextQuestion: { ar: string; en: string } | null;
    limitations: string[];
  }): Promise<unknown>;
}
