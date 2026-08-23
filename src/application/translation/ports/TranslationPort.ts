/**
 * Representation of a translation locale identifier in VOKA Multilingual V2.
 * Accepts standard BCP-47 language tags (e.g., "ar", "en", "fr", "de", "hi", "es", "en-US", "ar-KW").
 */
export type TranslationLocale = string;

/**
 * Validates whether a locale string is a non-empty, syntactically valid BCP-47 language tag.
 */
export function isValidLocale(locale: string): boolean {
  if (typeof locale !== "string" || !locale.trim()) {
    return false;
  }
  try {
    return Intl.getCanonicalLocales(locale.trim()).length === 1;
  } catch {
    return false;
  }
}

/**
 * Canonicalizes a BCP-47 locale using the platform standards implementation.
 */
export function normalizeLocale(locale: string): TranslationLocale {
  if (!isValidLocale(locale)) {
    throw new Error(`Invalid translation locale format: "${locale}"`);
  }
  return Intl.getCanonicalLocales(locale.trim())[0];
}

/**
 * Returns a standards-based English display name, with the canonical locale as
 * a deterministic fallback when DisplayNames is unavailable.
 */
export function getLocaleDisplayName(locale: TranslationLocale): string {
  const canonical = normalizeLocale(locale);
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(canonical) ?? canonical;
  } catch {
    return canonical;
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
