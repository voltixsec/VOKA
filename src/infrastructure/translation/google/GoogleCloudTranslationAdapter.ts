import type {
  TranslationPort,
  TranslationRequest,
  TranslationResult,
} from "@/src/application/translation";

type TranslationFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

type GoogleTranslationResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
    }>;
  };
};

export class GoogleCloudTranslationAdapter
  implements TranslationPort {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher:
      TranslationFetch = fetch,
  ) {
    if (!apiKey.trim()) {
      throw new Error(
        "Google Cloud Translation API key is required.",
      );
    }
  }

  async translateMany(
    request: TranslationRequest,
  ): Promise<TranslationResult> {
    if (request.items.length === 0) {
      return {};
    }

    if (request.items.length > 128) {
      throw new Error(
        "Google Cloud Translation supports a maximum of 128 items per request.",
      );
    }

    const response =
      await this.fetcher(
        "https://translation.googleapis.com/language/translate/v2",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json; charset=utf-8",

            "x-goog-api-key":
              this.apiKey,
          },

          body:
            JSON.stringify({
              q:
                request.items.map(
                  (item) =>
                    item.text,
                ),

              source:
                request.sourceLocale,

              target:
                request.targetLocale,

              format:
                "text",
            }),
        },
      );

    if (!response.ok) {
      throw new Error(
        `Google Cloud Translation request failed with status ${response.status}.`,
      );
    }

    const payload =
      (await response.json()) as
        GoogleTranslationResponse;

    const translations =
      payload.data?.translations;

    if (
      !translations ||
      translations.length !==
        request.items.length
    ) {
      throw new Error(
        "Google Cloud Translation returned an invalid translation count.",
      );
    }

    const result:
      TranslationResult = {};

    for (
      let index = 0;
      index <
      request.items.length;
      index += 1
    ) {
      const item =
        request.items[index];

      const translated =
        translations[
          index
        ]?.translatedText?.trim();

      if (!translated) {
        throw new Error(
          `Google Cloud Translation returned an empty translation for "${item.key}".`,
        );
      }

      result[item.key] =
        translated;
    }

    return result;
  }
}