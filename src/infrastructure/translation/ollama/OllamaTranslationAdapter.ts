import type { TranslationPort } from "@/src/application/translation";
import type { OllamaModelProfile } from "../../ai/ollama/OllamaModelProfile";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
  done_reason?: string;
};

function localeName(locale: string): string {
  const normalized = locale.trim().toLowerCase();
  if (normalized === "ar") return "Arabic";
  if (normalized === "en") return "English";
  return locale;
}

/**
 * OllamaTranslationAdapter
 *
 * Implements TranslationPort via the Ollama /api/chat endpoint.
 *
 * When a fallbackProfile is provided, any provider-level failure on the
 * primary model (network, HTTP error, timeout, empty content, invalid JSON,
 * missing keys) triggers a transparent retry with the fallback model.
 *
 * Cloud and local models use deliberately different request options as encoded
 * in OllamaModelProfile (no format:"json" for cloud, bounded options for local).
 *
 * NOTE: The 600-second timeout that existed in the previous implementation has
 * been removed.  Timeouts are now governed by the model profile, defaulting to
 * sensible values set in createTranslationPort.
 */
export class OllamaTranslationAdapter implements TranslationPort {
  constructor(
    private readonly baseUrl: string,
    private readonly primaryProfile: OllamaModelProfile,
    private readonly fallbackProfile?: OllamaModelProfile,
  ) {}

  async translateMany(
    request: Parameters<TranslationPort["translateMany"]>[0],
  ): Promise<Awaited<ReturnType<TranslationPort["translateMany"]>>> {
    if (request.items.length === 0) {
      return {};
    }

    try {
      return await this.callModel(this.primaryProfile, request);
    } catch {
      if (!this.fallbackProfile) {
        throw new Error("Translation unavailable: primary model failed.");
      }

      try {
        return await this.callModel(this.fallbackProfile, request);
      } catch {
        throw new Error(
          "Translation unavailable: both primary and fallback models failed.",
        );
      }
    }
  }

  private async callModel(
    profile: OllamaModelProfile,
    request: Parameters<TranslationPort["translateMany"]>[0],
  ): Promise<Awaited<ReturnType<TranslationPort["translateMany"]>>> {
    const sourceValues = Object.fromEntries(
      request.items.map((item) => [item.key, item.text]),
    );

    const sourceLanguage = localeName(request.sourceLocale);
    const targetLanguage = localeName(request.targetLocale);
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/api/chat`;

    const body: Record<string, unknown> = {
      model: profile.model,
      stream: false,
      think: false,
      keep_alive: "15m",
      messages: [
        {
          role: "system",
          content: [
            "You are the professional localization engine for VOKA AI Sales OS.",
            "Translate business, sales, quotation, company and technical content faithfully.",
            "Never change the commercial meaning.",
            "Person names, company names, project names and place names must be transliterated into the target writing system when the source and target scripts differ. Do not translate the semantic meaning of personal names.",
            "Examples: محمد رفعت -> Mohamed Refaat, الشويخ -> Shuwaikh. Preserve established official English brand/company spellings when known.",
            "Preserve numbers, percentages, currencies, units, product codes, model numbers, URLs, email addresses and brand names.",
            "Understand professional terminology for CCTV, NVR, DVR, IP cameras, PoE, UPS, Wi-Fi, access control, low voltage systems, supply, installation, testing, commissioning, maintenance, warranty, delivery and payment terms.",
            "CCTV means Closed-Circuit Television and surveillance camera systems.",
            "Return valid JSON only.",
            "Keep every JSON key exactly unchanged.",
            "Do not add new keys.",
            "Do not omit keys.",
            "Do not add explanations, comments or markdown.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Translate every JSON value from ${sourceLanguage} to professional ${targetLanguage}.`,
            "The translation will be used in a professional commercial business system.",
            "",
            JSON.stringify(sourceValues),
          ].join("\n"),
        },
      ],
      options: profile.generationOptions,
    };

    if (profile.sendFormatJson) {
      body.format = "json";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(profile.timeoutMs),
    });

    const payload = (await response.json()) as OllamaChatResponse;

    if (!response.ok) {
      throw new Error(
        `Ollama translation failed (${response.status}): ${
          payload.error || response.statusText
        }`,
      );
    }

    if (payload.done_reason === "length") {
      throw new Error("Ollama translation response was truncated.");
    }

    const text = payload.message?.content?.trim();

    if (!text) {
      throw new Error("Ollama translation returned no content.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Ollama translation returned invalid JSON.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Ollama translation returned an invalid object.");
    }

    const record = parsed as Record<string, unknown>;

    const expectedKeys = new Set(
      request.items.map((item) => item.key),
    );

    const returnedKeys = Object.keys(record);

    if (
      returnedKeys.length !== expectedKeys.size ||
      returnedKeys.some((key) => !expectedKeys.has(key))
    ) {
      throw new Error("Ollama translation returned an invalid key set.");
    }

    const result = {} as Awaited<ReturnType<TranslationPort["translateMany"]>>;

    for (const item of request.items) {
      const value = record[item.key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          `Ollama translation did not return "${item.key}".`,
        );
      }

      result[item.key] = value.trim();
    }

    return result;
  }
}