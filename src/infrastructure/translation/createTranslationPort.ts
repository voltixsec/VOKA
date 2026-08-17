import type { TranslationPort } from "@/src/application/translation";
import { OllamaTranslationAdapter } from "./ollama/OllamaTranslationAdapter";
import { GeminiTranslationAdapter } from "./gemini/GeminiTranslationAdapter";
import { GoogleCloudTranslationAdapter } from "./google/GoogleCloudTranslationAdapter";
import { buildModelProfile, isCloudModel } from "../ai/ollama/OllamaModelProfile";

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
 * Model routing priority:
 *   1. VOKA_TRANSLATION_MODEL          (primary Ollama model, enables routing)
 *   2. VOKA_TRANSLATION_FALLBACK_MODEL (optional fallback Ollama model)
 *   3. Legacy: VOKA_AI_PROVIDER=ollama|google|gemini (backward compat)
 *
 * Both primary and fallback run through the local Ollama endpoint.
 * Cloud model profiles receive cloud-compatible options automatically.
 *
 * Returns null when no provider is configured.
 */
export function createTranslationPort(): TranslationPort | null {
  const provider = (process.env.VOKA_AI_PROVIDER || "").trim().toLowerCase();

  // ── New fine-grained Translation configuration ──────────────────────────
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

  if (provider === "ollama") {
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

  if (provider === "google") {
    const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY?.trim();
    if (!apiKey) return null;
    return new GoogleCloudTranslationAdapter(apiKey);
  }

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;
    return new GeminiTranslationAdapter(apiKey);
  }

  return null;
}