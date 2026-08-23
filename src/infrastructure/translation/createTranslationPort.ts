import type { TranslationPort } from "@/src/application/translation";
import { OllamaTranslationAdapter } from "./ollama/OllamaTranslationAdapter";
import { GeminiTranslationAdapter } from "./gemini/GeminiTranslationAdapter";
import { GoogleCloudTranslationAdapter } from "./google/GoogleCloudTranslationAdapter";
import { OpenAITranslationAdapter } from "./openai/OpenAITranslationAdapter";
import { buildModelProfile } from "../ai/ollama/OllamaModelProfile";

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_TIMEOUT_MS = 45_000; // 45 s — cloud interactive
const DEFAULT_LOCAL_TIMEOUT_MS = 60_000; // 60 s — local translation (longer docs)
const MAX_TIMEOUT_MS = 180_000;

function resolveTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1_000) return fallback;
  return Math.min(Math.trunc(parsed), MAX_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * createTranslationPort
 *
 * Reads environment variables and returns a wired TranslationPort.
 *
 * Provider & Model routing priority:
 *   1. VOKA_TRANSLATION_PROVIDER=openai|ollama|gemini|google
 *   2. VOKA_TRANSLATION_MODEL (primary Ollama model, enables Ollama routing)
 *   3. VOKA_TRANSLATION_FALLBACK_MODEL (optional fallback Ollama model)
 *   4. Legacy: VOKA_AI_PROVIDER=openai|ollama|google|gemini (backward compat)
 *
 * Returns null when no valid provider is configured or required API key is missing.
 */
export function createTranslationPort(): TranslationPort | null {
  const translationProvider = (
    process.env.VOKA_TRANSLATION_PROVIDER || ""
  ).trim().toLowerCase();
  const legacyProvider = (
    process.env.VOKA_AI_PROVIDER || ""
  ).trim().toLowerCase();

  const activeProvider = translationProvider || legacyProvider;

  // ── OpenAI Provider Strategy ─────────────────────────────────────────────
  if (activeProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }
    const model =
      process.env.VOKA_TRANSLATION_OPENAI_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-5.6-sol";
    const timeoutMs = resolveTimeoutMs(
      process.env.VOKA_TRANSLATION_CLOUD_TIMEOUT_MS ||
        process.env.VOKA_TRANSLATION_TIMEOUT_MS,
      DEFAULT_CLOUD_TIMEOUT_MS,
    );
    return new OpenAITranslationAdapter({
      apiKey,
      model,
      timeoutMs,
    });
  }

  // ── Ollama explicit translation model routing ────────────────────────────
  const translationModel = process.env.VOKA_TRANSLATION_MODEL?.trim();
  const translationFallbackModel =
    process.env.VOKA_TRANSLATION_FALLBACK_MODEL?.trim();

  if (translationModel) {
    const baseUrl =
      process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";

    const cloudTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_TRANSLATION_CLOUD_TIMEOUT_MS,
      DEFAULT_CLOUD_TIMEOUT_MS,
    );
    const localTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_TRANSLATION_TIMEOUT_MS,
      DEFAULT_LOCAL_TIMEOUT_MS,
    );

    const primaryProfile = buildModelProfile(translationModel, cloudTimeoutMs);
    const fallbackProfile = translationFallbackModel
      ? buildModelProfile(translationFallbackModel, localTimeoutMs)
      : undefined;

    return new OllamaTranslationAdapter(baseUrl, primaryProfile, fallbackProfile);
  }

  // ── Legacy provider routing ──────────────────────────────────────────────

  if (activeProvider === "ollama") {
    const baseUrl =
      process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL?.trim() || "qwen3:1.7b";
    const localTimeoutMs = resolveTimeoutMs(
      process.env.VOKA_TRANSLATION_TIMEOUT_MS,
      DEFAULT_LOCAL_TIMEOUT_MS,
    );
    const primaryProfile = buildModelProfile(model, localTimeoutMs);
    return new OllamaTranslationAdapter(baseUrl, primaryProfile);
  }

  if (activeProvider === "google") {
    const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY?.trim();
    if (!apiKey) return null;
    return new GoogleCloudTranslationAdapter(apiKey);
  }

  if (activeProvider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;
    return new GeminiTranslationAdapter(apiKey);
  }

  return null;
}
