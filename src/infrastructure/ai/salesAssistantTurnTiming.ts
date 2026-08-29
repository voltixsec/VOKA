import type { CompleteConversationOptions, SalesAssistantTurnTiming } from "@/src/application/commercial-conversation/CompleteCommercialConversation";

/** Development-only observer. Production receives no logger and emits nothing. */
export function salesAssistantTurnTimingOptions(
  environment = process.env.NODE_ENV,
  log: (message: string, timing: SalesAssistantTurnTiming) => void = console.info,
): CompleteConversationOptions {
  if (environment !== "development") return {};
  return {
    onTiming: (timing) => log("[SalesAssistantTurnLatency]", timing),
  };
}
