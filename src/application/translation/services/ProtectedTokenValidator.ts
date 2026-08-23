/**
 * Commercial Protected Token Strategy
 *
 * Commercial & technical translations in VOKA MUST NOT mutate authoritative tokens.
 *
 * Examples of tokens that must be preserved exactly:
 * - SKUs, MPNs, Model Numbers (e.g., DS-2CD2143G2-I, APC LR1250I, CAT6)
 * - Numeric quantities, percentages, prices, currencies (e.g., KD 1,250.500, USD 250, 50%, 10)
 * - Technical specifications & units (e.g., 4MP, 8TB, 16-channel, 220V, IP67)
 * - Network addresses, URLs, Email addresses (e.g., 192.168.1.10, https://..., support@example.com)
 */

export interface ProtectedTokenValidationResult {
  readonly valid: boolean;
  readonly missingTokens: readonly string[];
}

export class ProtectedTokenValidator {
  /**
   * Token extraction regex rules for commercial/technical tokens.
   */
  private static readonly TOKEN_PATTERNS: readonly RegExp[] = [
    // URLs (e.g., https://example.com/path)
    /https?:\/\/[^\s<>"'{}|\\^`]+/gi,
    // Email addresses (e.g., support@example.com)
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    // IP addresses (e.g., 192.168.1.10)
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    // Currencies with formatted amounts (e.g., KD 1,250.500, KWD 125.500, USD 250, $250)
    /(?:KD|KWD|USD|EUR|GBP|\$|€|£)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi,
    /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:KD|KWD|USD|EUR|GBP|د\.ك|دينار)\b/gi,
    // Percentages (e.g., 50%, 5%)
    /\b\d+(?:\.\d+)?\s*%/g,
    // Technical units / specs (e.g., 4MP, 8TB, 16TB, 220V, 12V, 24V, IP67, IP66, 16ch, PoE)
    /\b\d+\s*(?:MP|TB|GB|MB|V|W|Hz|ch|CH|PoE|CAT\d+e?|IP\d{2})\b/gi,
    // Alphanumeric Model / SKU / MPN strings containing hyphen or numbers + letters (e.g., DS-2CD2143G2-I, LR1250I)
    /\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/gi,
    /\b[A-Z]{2,}\d+[A-Z0-9]*\b/g,
  ];

  /**
   * Extracts all protected tokens present in a given source string.
   */
  public static extractProtectedTokens(text: string): string[] {
    if (!text || typeof text !== "string") {
      return [];
    }

    const tokens = new Set<string>();

    for (const pattern of this.TOKEN_PATTERNS) {
      // Reset regex state if global flag is set
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const trimmed = match.trim();
          if (trimmed.length > 0) {
            tokens.add(trimmed);
          }
        }
      }
    }

    return Array.from(tokens);
  }

  /**
   * Verifies that all protected tokens present in the source text exist in the target translated text.
   */
  public static validateTokens(
    sourceText: string,
    targetText: string,
  ): ProtectedTokenValidationResult {
    const sourceTokens = this.extractProtectedTokens(sourceText);
    if (sourceTokens.length === 0) {
      return { valid: true, missingTokens: [] };
    }

    const missingTokens: string[] = [];
    const normalizedTarget = targetText.toLowerCase();

    for (const token of sourceTokens) {
      const normalizedToken = token.toLowerCase();
      if (!normalizedTarget.includes(normalizedToken)) {
        missingTokens.push(token);
      }
    }

    return {
      valid: missingTokens.length === 0,
      missingTokens,
    };
  }
}
