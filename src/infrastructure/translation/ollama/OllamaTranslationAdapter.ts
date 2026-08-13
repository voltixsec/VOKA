import type {
  TranslationPort,
} from "@/src/application/translation";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };

  error?: string;
};

function localeName(
  locale: string,
): string {
  const normalized =
    locale.trim().toLowerCase();

  if (normalized === "ar") {
    return "Arabic";
  }

  if (normalized === "en") {
    return "English";
  }

  return locale;
}

export class OllamaTranslationAdapter
  implements TranslationPort
{
  constructor(
    private readonly baseUrl =
      "http://127.0.0.1:11434",

    private readonly model =
      "qwen3:8b",
  ) {}

  async translateMany(
    request: Parameters<
      TranslationPort["translateMany"]
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        TranslationPort["translateMany"]
      >
    >
  > {
    if (request.items.length === 0) {
      return {};
    }

    const sourceValues =
      Object.fromEntries(
        request.items.map(
          (item) => [
            item.key,
            item.text,
          ],
        ),
      );

    const sourceLanguage =
      localeName(
        request.sourceLocale,
      );

    const targetLanguage =
      localeName(
        request.targetLocale,
      );

    const endpoint =
      `${this.baseUrl.replace(
        /\/+$/,
        "",
      )}/api/chat`;

    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },

          body: JSON.stringify({
            model:
              this.model,

            stream:
              false,

            think:
              false,

            keep_alive: "15m",

            messages: [
              {
                role:
                  "system",

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
        signal: AbortSignal.timeout(600_000),
              },

              {
                role:
                  "user",

                content: [
                  `Translate every JSON value from ${sourceLanguage} to professional ${targetLanguage}.`,

                  "The translation will be used in a professional commercial business system.",

                  "",

                  JSON.stringify(
                    sourceValues,
                  ),
                ].join("\n"),
              },
            ],

            format:
              "json",

            options: {
              temperature:
                0,

              num_predict: 450,
          num_ctx: 2048,
            },
          }),
        },
      );

    const payload =
      (await response.json()) as
        OllamaChatResponse;

    if (!response.ok) {
      throw new Error(
        `Ollama translation failed (${response.status}): ${
          payload.error ||
          response.statusText
        }`,
      );
    }

    const text =
      payload.message
        ?.content
        ?.trim();

    if (!text) {
      throw new Error(
        "Ollama translation returned no content.",
      );
    }

    let parsed: unknown;

    try {
      parsed =
        JSON.parse(text);
    }
    catch {
      throw new Error(
        "Ollama translation returned invalid JSON.",
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "Ollama translation returned an invalid object.",
      );
    }

    const record =
      parsed as
        Record<string, unknown>;

    const result =
      {} as Awaited<
        ReturnType<
          TranslationPort["translateMany"]
        >
      >;

    for (
      const item of request.items
    ) {
      const value =
        record[item.key];

      if (
        typeof value !== "string" ||
        !value.trim()
      ) {
        throw new Error(
          `Ollama translation did not return "${item.key}".`,
        );
      }

      result[item.key] =
        value.trim();
    }

    return result;
  }
}