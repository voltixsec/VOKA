import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import { openAICompatibleVisionProvider } from "./OpenAICompatibleVisionProvider";
import { unavailableVisionProvider } from "./UnavailableVisionProvider";

/**
 * Phase 2A-3 production vision resolution.
 *
 * - `VOKA_VISION_PROVIDER` unset/""/"off"/"none" -> null (native behavior:
 *   images stay undescribed, truthfully reported);
 * - `"openai-compatible"` -> the real OpenAI-compatible vision provider when
 *   base URL, API key, and model are all configured;
 * - anything else, or a missing key/model -> an explicit unavailable provider
 *   carrying the configuration reason.
 *
 * The deterministic test double is never returned here, under any
 * environment. Tests assert that structurally.
 */

export type ProductionVisionConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxImageBytes: number;
};

/** Minimal environment surface the factory reads; `process.env` satisfies it. */
export type ProductionVisionEnv = Record<string, string | undefined>;

export const VISION_DEFAULT_TIMEOUT_MS = 60_000;
export const VISION_DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const VISION_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function resolveProductionVisionConfig(env: ProductionVisionEnv = process.env): ProductionVisionConfig {
  return {
    provider: (env.VOKA_VISION_PROVIDER ?? "").trim().toLowerCase(),
    baseUrl: env.VOKA_VISION_BASE_URL?.trim() || VISION_DEFAULT_BASE_URL,
    model: env.VOKA_VISION_MODEL?.trim() ?? "",
    timeoutMs: positiveInt(env.VOKA_VISION_TIMEOUT_MS, VISION_DEFAULT_TIMEOUT_MS),
    maxImageBytes: positiveInt(env.VOKA_VISION_MAX_IMAGE_BYTES, VISION_DEFAULT_MAX_IMAGE_BYTES),
  };
}

export function createProductionVisionPort(env: ProductionVisionEnv = process.env): VisualInspectionPort | null {
  const config = resolveProductionVisionConfig(env);
  if (!config.provider || config.provider === "off" || config.provider === "none") return null;
  if (config.provider !== "openai-compatible") {
    return unavailableVisionProvider(`unknown vision provider "${config.provider}"; supported values are "openai-compatible" and "off"`);
  }
  const apiKey = env.VOKA_VISION_API_KEY?.trim() ?? "";
  if (!apiKey) return unavailableVisionProvider("the vision provider is not configured: VOKA_VISION_API_KEY is missing");
  if (!config.model) return unavailableVisionProvider("the vision provider is not configured: VOKA_VISION_MODEL is missing");
  return openAICompatibleVisionProvider({ baseUrl: config.baseUrl, apiKey, model: config.model, timeoutMs: config.timeoutMs });
}
