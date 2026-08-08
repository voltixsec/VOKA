import type {
  TranslationPort,
  TranslationRequest,
  TranslationResult,
} from "@/src/application/translation/ports/TranslationPort";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class GeminiTranslationAdapter
  implements TranslationPort
{
  constructor(
    private readonly apiKey: string,
    private readonly model =
      process.env.GEMINI_TRANSLATION_MODEL?.trim() ||
      "gemini-2.5-flash",
  ) {}

  async translateMany(
    request: TranslationRequest,
  ): Promise<TranslationResult> {
    if (request.items.length === 0) {
      return {};
    }

    const sourceValues = Object.fromEntries(
      request.items.map((item) => [
        item.key,
        item.text,
      ]),
    );

    const properties = Object.fromEntries(
      request.items.map((item) => [
        item.key,
        {
          type: "string",
        },
      ]),
    );

    const required = request.items.map(
      (item) => item.key,
    );

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Translate the JSON values from ${request.sourceLocale} to ${request.targetLocale}.`,
                    "Return a faithful professional business translation only.",
                    "Preserve numbers, currency values, units, model numbers, product codes, URLs, email addresses, and brand names unless a conventional localized form exists.",
                    "Do not add explanations, comments, markdown, or extra fields.",
                    "Do not translate the JSON keys.",
                    JSON.stringify(sourceValues),
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties,
              required,
            },
          },
        }),
      },
    );

    const payload =
      (await response.json()) as GeminiGenerateContentResponse;

    if (!response.ok) {
      throw new Error(
        `Gemini translation failed (${response.status}): ${
          payload.error?.message ||
          response.statusText
        }`,
      );
    }

    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "Gemini translation returned no text.",
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        "Gemini translation returned invalid JSON.",
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "Gemini translation returned an invalid object.",
      );
    }

    const record =
      parsed as Record<string, unknown>;

    const result: TranslationResult = {};

    for (const item of request.items) {
      const value = record[item.key];

      if (
        typeof value !== "string" ||
        !value.trim()
      ) {
        throw new Error(
          `Gemini translation did not return "${item.key}".`,
        );
      }

      result[item.key] = value.trim();
    }

    return result;
  }
}