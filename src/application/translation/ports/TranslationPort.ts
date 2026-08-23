/**
 * Representation of a translation locale identifier in VOKA Multilingual V2.
 * Accepts standard BCP-47 language tags (e.g., "ar", "en", "fr", "de", "hi", "es", "en-US", "ar-KW").
 */
export type TranslationLocale = string;

export type SupportedLocale = "ar" | "en" | "fr";

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set([
  "ar",
  "en",
  "fr",
  "de",
  "hi",
  "es",
]);

/**
 * Validates whether a locale string is a non-empty, syntactically valid BCP-47 language tag.
 */
export function isValidLocale(locale: string): boolean {
  if (!locale || typeof locale !== "string") {
    return false;
  }
  const trimmed = locale.trim();
  if (!trimmed) {
    return false;
  }
  // Standard BCP-47 language tag syntax validation regex (e.g. ar, en-US, fr-FR)
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(trimmed);
}

/**
 * Normalizes a locale tag to lowercase canonical form (e.g. "EN-us" -> "en-us", "  ar  " -> "ar").
 */
export function normalizeLocale(locale: string): TranslationLocale {
  if (!isValidLocale(locale)) {
    throw new Error(`Invalid translation locale format: "${locale}"`);
  }
  return locale.trim().toLowerCase();
}

/**
 * Returns human-friendly display name for common supported locales.
 */
export function getLocaleDisplayName(locale: TranslationLocale): string {
  const norm = normalizeLocale(locale);
  const primary = norm.split("-")[0];
  switch (primary) {
    case "ar":
      return "Arabic";
    case "en":
      return "English";
    case "fr":
      return "French";
    case "de":
      return "German";
    case "hi":
      return "Hindi";
    case "es":
      return "Spanish";
    default:
      return norm;
  }
}

export type TranslationItem = {
  key: string;
  text: string;
};

export type TranslationRequest = {
  sourceLocale: TranslationLocale;
  targetLocale: TranslationLocale;
  items: readonly TranslationItem[];
};

export type TranslationResult = Record<string, string>;

export interface TranslationPort {
  translateMany(
    request: TranslationRequest,
  ): Promise<TranslationResult>;
}
