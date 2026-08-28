export interface AISalesAssistantPort {
  extractCustomerMention?(prompt: string, sourceLocale: "ar" | "en"): Promise<unknown>;
  estimatePrices?(input: { currency: string; region: string | null; lines: Array<{ key: string; name: string; unit: string | null }> }): Promise<unknown>;
  extractIntent(
    prompt: string,
    sourceLocale: "ar" | "en",
  ): Promise<unknown>;
}
