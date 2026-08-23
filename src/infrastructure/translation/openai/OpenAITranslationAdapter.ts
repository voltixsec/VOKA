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

type OpenAIResponse = {
  readonly id?: string;
  readonly choices?: Array<{
    readonly message?: {
      readonly content?: string;
    };
    readonly finish_reason?: string;
  }>;
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string | number;
  };
};

export class OpenAITranslationAdapter implements TranslationPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly enforceProtectedTokens: boolean;

  constructor(options: OpenAITranslationAdapterOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error("OpenAITranslationAdapter requires a valid API key.");
    }
    this.apiKey = options.apiKey.trim();
    this.model =
      options.model?.trim() ||
      process.env.VOKA_TRANSLATION_OPENAI_MODEL?.trim() ||
      "gpt-5.6-sol";
    this.baseUrl = (
      options.baseUrl?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.enforceProtectedTokens = options.enforceProtectedTokens ?? true;
  }

  async translateMany(
    request: TranslationRequest,
  ): Promise<TranslationResult> {
    if (request.items.length === 0) {
      return {};
    }

    const sourceLocale = normalizeLocale(request.sourceLocale);
    const targetLocale = normalizeLocale(request.targetLocale);

    const sourceLanguage = getLocaleDisplayName(sourceLocale);
    const targetLanguage = getLocaleDisplayName(targetLocale);

    const sourceValues = Object.fromEntries(
      request.items.map((item) => [item.key, item.text]),
    );

    const properties = Object.fromEntries(
      request.items.map((item) => [
        item.key,
        {
          type: "string",
          description: `Faithful translation of "${item.key}" from ${sourceLanguage} to ${targetLanguage}`,
        },
      ]),
    );

    const requiredKeys = request.items.map((item) => item.key);

    const jsonSchema = {
      name: "translation_result",
      strict: true,
      schema: {
        type: "object",
        properties,
        required: requiredKeys,
        additionalProperties: false,
      },
    };

    const systemPrompt = [
      "You are the professional commercial localization engine for VOKA AI Sales OS.",
      "Translate business, sales, quotation, contract, catalog, company and technical content faithfully.",
      "Never change commercial meaning or financial numbers.",
      `Source language: ${sourceLanguage} (${sourceLocale}). Target language: ${targetLanguage} (${targetLocale}).`,
      "Person names, company names, project names and place names must be transliterated into the target writing system when scripts differ. Do not translate the semantic meaning of personal names.",
      "Preserve exact SKUs, MPNs, GTINs, model numbers, serial numbers, brand names, product codes, URLs, and email addresses.",
      "Preserve quantities, currency codes/symbols, decimal values, percentages, and technical units (e.g. 4MP, 8TB, 220V, IP67, CAT6) unchanged.",
      "Return valid JSON adhering strictly to the required schema.",
    ].join("\n");

    const userPrompt = [
      `Translate every JSON value from ${sourceLanguage} (${sourceLocale}) to professional ${targetLanguage} (${targetLocale}).`,
      JSON.stringify(sourceValues),
    ].join("\n");

    const requestBody = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
      temperature: 0.1,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const payload = (await response.json()) as OpenAIResponse;

        if (!response.ok) {
          throw new Error(
            `OpenAI translation failed (${response.status}): ${
              payload.error?.message || response.statusText
            }`,
          );
        }

        const choice = payload.choices?.[0];

        if (choice?.finish_reason === "length") {
          throw new Error("OpenAI translation output was truncated due to max tokens.");
        }

        const rawContent = choice?.message?.content?.trim();

        if (!rawContent) {
          throw new Error("OpenAI translation returned empty response content.");
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          throw new Error("OpenAI translation returned malformed JSON.");
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("OpenAI translation returned non-object JSON.");
        }

        const record = parsed as Record<string, unknown>;

        // Strict key cardinality verification
        const returnedKeys = Object.keys(record);
        if (returnedKeys.length !== requiredKeys.length) {
          throw new Error(
            `OpenAI translation key count mismatch. Expected ${requiredKeys.length}, got ${returnedKeys.length}.`,
          );
        }

        const result: TranslationResult = {};

        for (const item of request.items) {
          const val = record[item.key];
          if (typeof val !== "string" || !val.trim()) {
            throw new Error(
              `OpenAI translation missing or non-string value for key "${item.key}".`,
            );
          }
          const translatedText = val.trim();

          // Commercial Protected Token Verification
          if (this.enforceProtectedTokens) {
            const tokenValidation = ProtectedTokenValidator.validateTokens(
              item.text,
              translatedText,
            );
            if (!tokenValidation.valid) {
              throw new Error(
                `OpenAI translation corrupted protected tokens for key "${item.key}": missing [${tokenValidation.missingTokens.join(
                  ", ",
                )}].`,
              );
            }
          }

          result[item.key] = translatedText;
        }

        return result;
      } catch (err: unknown) {
        lastError =
          err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          // Short exponential delay before retry
          await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
        }
      }
    }

    throw new Error(
      `OpenAI translation failed after ${this.maxRetries + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`,
    );
  }
}
