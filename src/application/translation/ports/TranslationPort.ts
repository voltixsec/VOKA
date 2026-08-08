export type TranslationLocale =
  | "ar"
  | "en";

export type TranslationItem = {
  key: string;
  text: string;
};

export type TranslationRequest = {
  sourceLocale: TranslationLocale;
  targetLocale: TranslationLocale;
  items: readonly TranslationItem[];
};

export type TranslationResult =
  Record<string, string>;

export interface TranslationPort {
  translateMany(
    request: TranslationRequest,
  ): Promise<TranslationResult>;
}