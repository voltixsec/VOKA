export interface AISalesAssistantPort {
  extractIntent(
    prompt: string,
    sourceLocale: "ar" | "en",
  ): Promise<unknown>;
}
