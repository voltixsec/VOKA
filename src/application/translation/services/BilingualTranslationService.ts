import type {
  TranslationLocale,
  TranslationPort,
} from "../ports";

export type BilingualSourceFields =
  Record<
    string,
    string | null | undefined
  >;

export type BilingualTranslationResult = {
  sourceLocale: TranslationLocale;
  targetLocale: TranslationLocale;
  translated: Record<
    string,
    string | null
  >;
};

export class BilingualTranslationService {
  constructor(
    private readonly translationPort:
      TranslationPort,
  ) {}

  async translateSourceFields(
    sourceLocale: TranslationLocale,
    fields: BilingualSourceFields,
  ): Promise<BilingualTranslationResult> {
    const targetLocale =
      sourceLocale === "ar"
        ? "en"
        : "ar";

    const normalized =
      Object.entries(fields).map(
        ([key, value]) => ({
          key,
          text:
            typeof value === "string"
              ? value.trim()
              : "",
        }),
      );

    const items =
      normalized.filter(
        (item) =>
          item.text.length > 0,
      );

    if (items.length === 0) {
      return {
        sourceLocale,
        targetLocale,
        translated:
          Object.fromEntries(
            normalized.map(
              ({ key }) => [
                key,
                null,
              ],
            ),
          ),
      };
    }

    const result =
      await this.translationPort
        .translateMany({
          sourceLocale,
          targetLocale,
          items,
        });

    const translated:
      Record<string, string | null> =
        {};

    for (const item of normalized) {
      if (!item.text) {
        translated[item.key] =
          null;

        continue;
      }

      const value =
        result[item.key]?.trim();

      if (!value) {
        throw new Error(
          `Translation provider did not return "${item.key}".`,
        );
      }

      translated[item.key] =
        value;
    }

    return {
      sourceLocale,
      targetLocale,
      translated,
    };
  }
}