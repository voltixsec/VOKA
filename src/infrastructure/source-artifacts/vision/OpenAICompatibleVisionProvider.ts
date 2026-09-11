import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import {
  MAX_VISUAL_OBSERVATIONS,
  VISUAL_OBSERVATION_TYPES,
  visualReliabilityFor,
  type VisualInspectionRequest,
  type VisualInspectionResult,
  type VisualObservationDraft,
} from "@/src/domain/source-artifact";

/**
 * Real vision provider over any OpenAI-compatible `/chat/completions`
 * endpoint (OpenAI, Azure OpenAI, OpenRouter, vLLM, or local Ollama `/v1`
 * with a vision model). It uses only the global fetch API: no SDK, no new
 * dependency.
 *
 * The provider performs wire mapping only. The bounded vocabulary, bounds,
 * and reliability mapping are enforced by the domain normalizer
 * (`normalizeVisualDrafts`), which stays authoritative even if an endpoint
 * ignores the JSON schema. Failures (HTTP errors, timeouts, malformed
 * payloads) become FAILED results; this provider never throws from
 * `inspect` and never fabricates observations.
 */

export const OPENAI_COMPATIBLE_VISION_PROVIDER_ID = "openai-compatible-vision";

const VISUAL_REGIONS = [
  "upper-left",
  "upper-right",
  "center",
  "lower-left",
  "lower-right",
  "left",
  "right",
  "top",
  "bottom",
] as const;

const SYSTEM_PROMPT = [
  "You inspect a single image for a sales assistant. Describe only what is plainly visible.",
  `Emit at most ${MAX_VISUAL_OBSERVATIONS} observations using ONLY these types: ${VISUAL_OBSERVATION_TYPES.join(", ")}.`,
  "VISIBLE_OBJECT: a visible equipment/object described literally (mounting, approximate size, visible parts).",
  "VISIBLE_PRODUCT: a visible product or package described literally.",
  "VISIBLE_BRAND: brand or logo text ONLY when it is clearly legible in the image; otherwise emit nothing for brand.",
  "VISIBLE_MODEL_REFERENCE: a model/reference marking ONLY when it is clearly legible; never guess a model from resemblance.",
  "IMAGE_TYPE_HINT: one short hint such as photo, screenshot, scanned document, product render, or site photo.",
  "VISIBLE_CONDITION: visible damage, wear, or condition as a plain observation, never as a certified assessment.",
  "VISUAL_CONTEXT: layout, setting, or context in one short sentence.",
  "Rules: keep each description under 200 characters. Give a 0..1 confidence per observation. Name an image region only when the observation is clearly localized. Do not transcribe text content (that is a separate text-recovery task). Do not state quantities as facts, do not select products, do not name suppliers, and do not infer what is outside the frame. When identity is uncertain, describe generically instead of guessing.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      maxItems: MAX_VISUAL_OBSERVATIONS,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...VISUAL_OBSERVATION_TYPES] },
          description: { type: "string", maxLength: 200 },
          confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
          region: { type: ["string", "null"], enum: [...VISUAL_REGIONS, null] },
          limitations: { type: "array", items: { type: "string" }, maxItems: 4 },
        },
        required: ["type", "description", "confidence", "region", "limitations"],
        additionalProperties: false,
      },
    },
  },
  required: ["observations"],
  additionalProperties: false,
};

export type OpenAICompatibleVisionOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

function fail(pageNumber: number | null, error: string, limitations: string[] = []): VisualInspectionResult {
  return {
    pageNumber,
    observations: [],
    status: "FAILED",
    confidence: null,
    reliability: "LOW",
    providerId: OPENAI_COMPATIBLE_VISION_PROVIDER_ID,
    limitations,
    error,
  };
}

function draftFrom(item: unknown): VisualObservationDraft | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  if (typeof candidate.type !== "string" || typeof candidate.description !== "string") return null;
  const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? Math.min(1, Math.max(0, candidate.confidence))
    : null;
  return {
    type: candidate.type,
    description: candidate.description,
    confidence,
    region: typeof candidate.region === "string" ? candidate.region : null,
    limitations: Array.isArray(candidate.limitations) ? candidate.limitations.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

function parseChoices(payload: unknown): { content: string } | { error: string } {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return { error: "the vision endpoint returned no text content" };
  return { content: content.trim() };
}

function parseObservations(content: string): { observations: VisualObservationDraft[] } | { error: string } {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const candidate = (fenced?.[1] ?? content).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { error: "the vision endpoint returned output that is not valid JSON" };
  }
  const observations = (parsed as { observations?: unknown })?.observations;
  if (!Array.isArray(observations)) return { error: "the vision endpoint returned JSON without an observations array" };
  return { observations: observations.map(draftFrom).filter((draft): draft is VisualObservationDraft => draft !== null).slice(0, MAX_VISUAL_OBSERVATIONS) };
}

export function openAICompatibleVisionProvider(options: OpenAICompatibleVisionOptions): VisualInspectionPort {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!baseUrl) throw new Error("a vision base URL is required");
  if (!apiKey) throw new Error("a vision API key is required");
  if (!model) throw new Error("a vision model is required");
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0 ? Math.trunc(options.timeoutMs as number) : 60_000;
  const maxTokens = Number.isFinite(options.maxTokens) && (options.maxTokens as number) > 0 ? Math.trunc(options.maxTokens as number) : 1_200;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    providerId: OPENAI_COMPATIBLE_VISION_PROVIDER_ID,
    inspect: async (request: VisualInspectionRequest): Promise<VisualInspectionResult> => {
      try {
        const dataUrl = `data:${request.mimeType};base64,${Buffer.from(request.imageBytes).toString("base64")}`;
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: maxTokens,
            response_format: { type: "json_schema", json_schema: { name: "visual_inspection", schema: RESPONSE_SCHEMA } },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: "Inspect this image and report bounded visual observations." },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return fail(request.pageNumber, `the vision endpoint rejected the request (HTTP ${response.status})`);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return fail(request.pageNumber, "the vision endpoint returned a response that is not valid JSON");
        }
        const choices = parseChoices(payload);
        if ("error" in choices) return fail(request.pageNumber, choices.error);
        const parsed = parseObservations(choices.content);
        if ("error" in parsed) return fail(request.pageNumber, parsed.error);
        if (!parsed.observations.length) {
          return {
            pageNumber: request.pageNumber,
            observations: [],
            status: "NO_USABLE_OBSERVATIONS",
            confidence: null,
            reliability: "LOW",
            providerId: OPENAI_COMPATIBLE_VISION_PROVIDER_ID,
            limitations: ["the vision endpoint returned no usable observations for this image"],
            error: null,
          };
        }
        const confidences = parsed.observations.map((item) => item.confidence).filter((value): value is number => value !== null && value !== undefined);
        const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null;
        return {
          pageNumber: request.pageNumber,
          observations: parsed.observations,
          status: "COMPLETED",
          confidence,
          reliability: visualReliabilityFor(confidence),
          providerId: OPENAI_COMPATIBLE_VISION_PROVIDER_ID,
          limitations: ["descriptions were produced by an AI vision model and may be mistaken; verify against the image itself"],
          error: null,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          return fail(request.pageNumber, `the vision endpoint timed out after ${timeoutMs} ms`);
        }
        const detail = error instanceof Error ? error.message : "unknown transport failure";
        return fail(request.pageNumber, `the vision endpoint could not be reached (${detail.slice(0, 200)})`);
      }
    },
  };
}
