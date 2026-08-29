import type { AISalesAssistantPort } from "@/src/application/ai-sales-assistant/ports/AISalesAssistantPort";
import { OpenAISalesAssistantAdapter } from "./openai/OpenAISalesAssistantAdapter";
import { OllamaSalesAssistantAdapter } from "./ollama/OllamaSalesAssistantAdapter";
import { buildModelProfile, isCloudModel } from "./ollama/OllamaModelProfile";

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_TIMEOUT_MS = 45_000; // 45 s — cloud interactive
const DEFAULT_LOCAL_TIMEOUT_MS = 30_000; // 30 s — local default
const MAX_TIMEOUT_MS = 120_000;

function resolveTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1_000) return fallback;
  return Math.min(Math.trunc(parsed), MAX_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * createSalesAssistantPort
 *
 * Reads environment variables and returns a wired AISalesAssistantPort.
 *
 * Model routing priority:
 *   1. VOKA_SALES_AI_MODEL          (primary)
 *   2. VOKA_SALES_AI_FALLBACK_MODEL (fallback, optional)
 *   3. Legacy: VOKA_AI_PROVIDER=ollama + OLLAMA_MODEL (backward compat)
 *
 * Both primary and fallback use the same Ollama endpoint; cloud models
 * receive cloud-compatible generation options automatically via OllamaModelProfile.
 *
 * Returns null when no provider is configured.
 */
export function createSalesAssistantPort(): AISalesAssistantPort | null {
  if ((process.env.VOKA_AI_PROVIDER?.toLowerCase() === "openai" || !process.env.VOKA_AI_PROVIDER) && process.env.OPENAI_API_KEY && process.env.VOKA_SALES_AI_MODEL) {
    return new OpenAISalesAssistantAdapter(process.env.OPENAI_API_KEY, process.env.VOKA_SALES_AI_MODEL, process.env.OPENAI_BASE_URL, {
      enabled: process.env.VOKA_COMMERCIAL_RESEARCH_ENABLED !== "false",
      model: process.env.VOKA_COMMERCIAL_RESEARCH_MODEL?.trim() || undefined,
      timeoutMs: resolveTimeoutMs(process.env.VOKA_COMMERCIAL_RESEARCH_TIMEOUT_MS, 20_000),
      cacheTtlMs: Number(process.env.VOKA_COMMERCIAL_RESEARCH_CACHE_TTL_MS) || 3_600_000,
      maxSources: Number(process.env.VOKA_COMMERCIAL_RESEARCH_MAX_SOURCES) || 6,
      maxToolCalls: Number(process.env.VOKA_COMMERCIAL_RESEARCH_MAX_CALLS) || 2,
      preferredDomains: process.env.VOKA_COMMERCIAL_RESEARCH_PREFERRED_DOMAINS?.split(",").map((value) => value.trim()).filter(Boolean),
      blockedDomains: process.env.VOKA_COMMERCIAL_RESEARCH_BLOCKED_DOMAINS?.split(",").map((value) => value.trim()).filter(Boolean),
      minimumEvidence: Number(process.env.VOKA_COMMERCIAL_RESEARCH_MIN_EVIDENCE) || 1,
      telemetry: (event) => console.info("[CommercialSystemResearch]", event),
    });
  }
  if (process.env.VOKA_AI_PROVIDER?.toLowerCase() === "openai") return null;
  const baseUrl =
    process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";

  // New fine-grained Sales AI configuration
  const salesModel = process.env.VOKA_SALES_AI_MODEL?.trim();
  const salesFallbackModel = process.env.VOKA_SALES_AI_FALLBACK_MODEL?.trim();

  if (salesModel) {
    const cloudTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_SALES_AI_CLOUD_TIMEOUT_MS,
      DEFAULT_CLOUD_TIMEOUT_MS,
    );
    const localTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_AI_TIMEOUT_MS,
      DEFAULT_LOCAL_TIMEOUT_MS,
    );

    const primaryProfile = buildModelProfile(salesModel, cloudTimeoutMs);
    const fallbackProfile = salesFallbackModel
      ? buildModelProfile(salesFallbackModel, localTimeoutMs)
      : undefined;

    return new OllamaSalesAssistantAdapter(
      baseUrl,
      primaryProfile,
      fallbackProfile,
    );
  }

  // Legacy: VOKA_AI_PROVIDER=ollama
  const provider = (process.env.VOKA_AI_PROVIDER || "").trim().toLowerCase();
  const legacyModel =
    process.env.OLLAMA_MODEL?.trim() || "qwen3:1.7b";

  if (provider === "ollama") {
    const localTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_AI_TIMEOUT_MS,
      DEFAULT_LOCAL_TIMEOUT_MS,
    );
    const primaryProfile = buildModelProfile(legacyModel, localTimeoutMs);
    return new OllamaSalesAssistantAdapter(baseUrl, primaryProfile);
  }

  // Backward-compatible local default when OLLAMA_BASE_URL is set without provider
  if (!provider && process.env.OLLAMA_BASE_URL) {
    const localTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_AI_TIMEOUT_MS,
      DEFAULT_LOCAL_TIMEOUT_MS,
    );
    const primaryProfile = buildModelProfile(legacyModel, localTimeoutMs);
    return new OllamaSalesAssistantAdapter(baseUrl, primaryProfile);
  }

  return null;
}
