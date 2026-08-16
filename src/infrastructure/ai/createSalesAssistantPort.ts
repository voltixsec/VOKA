import type { AISalesAssistantPort } from "@/src/application/ai-sales-assistant/ports/AISalesAssistantPort";
import { OllamaSalesAssistantAdapter } from "./ollama/OllamaSalesAssistantAdapter";

export function createSalesAssistantPort(): AISalesAssistantPort | null {
  const provider = (process.env.VOKA_AI_PROVIDER || "").trim().toLowerCase();

  if (provider === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL?.trim() || "qwen3:8b";
    return new OllamaSalesAssistantAdapter(baseUrl, model);
  }

  // Backward-compatible local default only when no provider was explicitly selected
  if (!provider && process.env.OLLAMA_BASE_URL) {
    return new OllamaSalesAssistantAdapter(
      process.env.OLLAMA_BASE_URL.trim(),
      process.env.OLLAMA_MODEL?.trim() || "qwen3:8b",
    );
  }

  return null;
}
