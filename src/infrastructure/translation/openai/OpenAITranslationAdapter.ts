import type {
  TranslationPort,
  TranslationRequest,
  TranslationResult,
} from "@/src/application/translation/ports/TranslationPort";
import {
  getLocaleDisplayName,
  normalizeLocale,
} from "@/src/application/translation/ports/TranslationPort";
import { ProtectedTokenValidator } from "@/src/application/translation/services/ProtectedTokenValidator";

export interface OpenAITranslationAdapterOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly enforceProtectedTokens?: boolean;
}

type ResponsesPayload = {
  readonly status?: "completed" | "incomplete" | "failed" | "cancelled" | "queued" | "in_progress";
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly output?: ReadonlyArray<{
    readonly type?: string;
    readonly content?: ReadonlyArray<
      | { readonly type: "output_text"; readonly text?: string }
      | { readonly type: "refusal"; readonly refusal?: string }
      | { readonly type?: string }
    >;
  }>;
  readonly error?: { readonly code?: string; readonly message?: string } | null;
};

class NonRetryableTranslationError extends Error {}
class RetryableTranslationError extends Error {}

export class OpenAITranslationAdapter implements TranslationPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly enforceProtectedTokens: boolean;

  constructor(options: OpenAITranslationAdapterOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error("OpenAITranslationAdapter requires a valid API key.");
    }
    this.apiKey = options.apiKey.trim();
    this.model = options.model?.trim() ||
      process.env.VOKA_TRANSLATION_OPENAI_MODEL?.trim() || "gpt-5.6-sol";
    this.baseUrl = (options.baseUrl?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.enforceProtectedTokens = options.enforceProtectedTokens ?? true;
  }

  async translateMany(request: TranslationRequest): Promise<TranslationResult> {
    if (request.items.length === 0) return {};

    const sourceLocale = normalizeLocale(request.sourceLocale);
    const targetLocale = normalizeLocale(request.targetLocale);
    const requiredKeys = request.items.map((item) => item.key);
    if (requiredKeys.some((key) => !key.trim()) || new Set(requiredKeys).size !== requiredKeys.length) {
      throw new NonRetryableTranslationError("Translation item keys must be non-empty and unique.");
    }

    const sourceLanguage = getLocaleDisplayName(sourceLocale);
    const targetLanguage = getLocaleDisplayName(targetLocale);
    const sourceValues = Object.fromEntries(request.items.map((item) => [item.key, item.text]));
    const schema = {
      type: "object",
      properties: Object.fromEntries(requiredKeys.map((key) => [key, { type: "string" }])),
      required: requiredKeys,
      additionalProperties: false,
    } as const;

    const instructions = [
      "You are VOKA's professional commercial localization engine.",
      `Translate from ${sourceLanguage} (${sourceLocale}) to ${targetLanguage} (${targetLocale}).`,
      "Translate linguistic text faithfully without changing commercial meaning.",
      "Preserve exact identifiers, product/model codes, brands, URLs, emails, quantities, decimal formatting, currency codes, percentages, and technical specifications.",
      "Never change pricing, tax, totals, ownership, approval state, engineering quantities, or historical meaning.",
      "Transliterate proper names only when needed for the target script; do not semantically translate them.",
    ].join("\n");

    const body = {
      model: this.model,
      instructions,
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `Translate every JSON value. Return the exact same keys.\n${JSON.stringify(sourceValues)}`,
        }],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "translation_result",
          strict: true,
          schema,
        },
      },
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        let payload: ResponsesPayload;
        try {
          payload = await response.json() as ResponsesPayload;
        } catch {
          throw response.ok
            ? new NonRetryableTranslationError("OpenAI Responses API returned malformed JSON.")
            : response.status === 429 || response.status >= 500
              ? new RetryableTranslationError(`OpenAI Responses API HTTP ${response.status}.`)
              : new NonRetryableTranslationError(`OpenAI Responses API HTTP ${response.status}.`);
        }

        if (!response.ok) {
          const error = `OpenAI Responses API HTTP ${response.status}.`;
          if (response.status === 429 || response.status >= 500) throw new RetryableTranslationError(error);
          throw new NonRetryableTranslationError(error);
        }
        if (payload.status === "incomplete") {
          throw new NonRetryableTranslationError(
            `OpenAI Responses API returned incomplete output (${payload.incomplete_details?.reason ?? "unknown"}).`,
          );
        }
        if (payload.status && payload.status !== "completed") {
          throw new NonRetryableTranslationError(`OpenAI Responses API returned status ${payload.status}.`);
        }

        if (payload.output !== undefined && !Array.isArray(payload.output)) {
          throw new NonRetryableTranslationError("OpenAI Responses API returned malformed output.");
        }
        if (payload.output?.some((item) => item.type === "message" && !Array.isArray(item.content))) {
          throw new NonRetryableTranslationError("OpenAI Responses API returned malformed message content.");
        }

        const content = payload.output?.flatMap((item) => item.type === "message" ? item.content ?? [] : []) ?? [];
        const refusal = content.find((item) => item.type === "refusal");
        if (refusal?.type === "refusal") {
          throw new NonRetryableTranslationError("OpenAI Responses API refused the translation request.");
        }
        const rawText = content
          .filter((item): item is { type: "output_text"; text?: string } => item.type === "output_text")
          .map((item) => item.text ?? "")
          .join("")
          .trim();
        if (!rawText) throw new NonRetryableTranslationError("OpenAI Responses API returned no output text.");

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          throw new NonRetryableTranslationError("OpenAI Responses API returned malformed structured output.");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new NonRetryableTranslationError("OpenAI structured output must be an object.");
        }
        const record = parsed as Record<string, unknown>;
        const returnedKeys = Object.keys(record);
        if (returnedKeys.length !== requiredKeys.length || returnedKeys.some((key) => !requiredKeys.includes(key))) {
          throw new NonRetryableTranslationError("OpenAI translation schema key mismatch.");
        }

        const result: TranslationResult = {};
        for (const item of request.items) {
          const value = record[item.key];
          if (typeof value !== "string" || !value.trim()) {
            throw new NonRetryableTranslationError(`OpenAI translation missing string value for key "${item.key}".`);
          }
          const translated = value.trim();
          if (this.enforceProtectedTokens) {
            const validation = ProtectedTokenValidator.validateTokens(item.text, translated);
            if (!validation.valid) {
              throw new NonRetryableTranslationError(
                `OpenAI translation corrupted protected tokens for key "${item.key}": missing [${validation.missingTokens.join(", ")}].`,
              );
            }
          }
          result[item.key] = translated;
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof NonRetryableTranslationError) throw error;
        if (attempt >= this.maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }

    throw new Error(
      `OpenAI translation failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? "transient failure"}`,
    );
  }
}
