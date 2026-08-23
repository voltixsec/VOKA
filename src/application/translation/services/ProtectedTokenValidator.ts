export type ProtectedTokenCategory =
  | "EXACT_IDENTIFIER"
  | "COMMERCIAL_NUMERIC"
  | "TECHNICAL_SPEC"
  | "URL_EMAIL"
  | "CURRENCY_CODE";

export interface ProtectedTokenValidationResult {
  readonly valid: boolean;
  readonly missingTokens: readonly string[];
}

type TokenRule = {
  category: ProtectedTokenCategory;
  pattern: RegExp;
  capture?: number;
};

/** Exact, case-sensitive preservation rules for authoritative commercial text. */
const TOKEN_RULES: readonly TokenRule[] = [
  { category: "URL_EMAIL", pattern: /https?:\/\/[^\s<>"'{}|\\^`]+/g },
  { category: "URL_EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { category: "EXACT_IDENTIFIER", pattern: /\b(?:GTIN|EAN|UPC|MPN)\s*[:#-]?\s*([A-Za-z0-9-]+)\b/g, capture: 1 },
  { category: "EXACT_IDENTIFIER", pattern: /\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g },
  { category: "EXACT_IDENTIFIER", pattern: /\b[A-Z]{2,}\d+[A-Z0-9]*\b/g },
  { category: "EXACT_IDENTIFIER", pattern: /\b[A-Z]{2,}\b/g },
  { category: "CURRENCY_CODE", pattern: /\b(?:KWD|USD|EUR|GBP|SAR|AED|KD)\b/g },
  { category: "COMMERCIAL_NUMERIC", pattern: /(?:KD|KWD|USD|EUR|GBP|SAR|AED|\$|€|£)\s*\d+(?:,\d{3})*(?:\.\d+)?/g },
  { category: "COMMERCIAL_NUMERIC", pattern: /\b\d+(?:,\d{3})*(?:\.\d+)?\s*%/g },
  { category: "COMMERCIAL_NUMERIC", pattern: /\b(?:Qty|Quantity)\s*[:.]?\s*(\d+(?:\.\d+)?)\b/gi, capture: 1 },
  { category: "COMMERCIAL_NUMERIC", pattern: /(?:عدد|الكمية)\s*[:.]?\s*(\d+(?:\.\d+)?)/g, capture: 1 },
  { category: "COMMERCIAL_NUMERIC", pattern: /\b\d+(?:\.\d+)?\s*(?:pcs|cameras?|months?|m²|m)\b/gi },
  { category: "COMMERCIAL_NUMERIC", pattern: /(?<![\p{L}\p{N}])\d+(?:,\d{3})*(?:\.\d+)?(?![\p{L}\p{N}])/gu },
  { category: "TECHNICAL_SPEC", pattern: /\b(?:IP\d{2}|CAT\d+[A-Za-z]?|\d+(?:\.\d+)?(?:TB|GB|MB|MP|V|W|Hz|CH))\b/g },
  { category: "TECHNICAL_SPEC", pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g },
];

export class ProtectedTokenValidator {
  public static extractProtectedTokens(text: string): string[] {
    if (typeof text !== "string" || !text) return [];

    const tokens: string[] = [];
    for (const rule of TOKEN_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        const token = (rule.capture ? match[rule.capture] : match[0])?.trim();
        if (token) tokens.push(token);
      }
    }
    return [...new Set(tokens)];
  }

  public static validateTokens(
    sourceText: string,
    targetText: string,
  ): ProtectedTokenValidationResult {
    const sourceTokens = this.extractProtectedTokens(sourceText);
    const missingTokens: string[] = [];
    const requiredCounts = new Map<string, number>();
    for (const token of sourceTokens) {
      let count = 0;
      let cursor = 0;
      while (cursor <= sourceText.length - token.length) {
        const index = sourceText.indexOf(token, cursor);
        if (index < 0) break;
        count++;
        cursor = index + token.length;
      }
      requiredCounts.set(token, count);
    }

    for (const [token, required] of requiredCounts) {
      let found = 0;
      let cursor = 0;
      while (cursor <= targetText.length - token.length) {
        const index = targetText.indexOf(token, cursor);
        if (index < 0) break;
        found++;
        cursor = index + token.length;
      }
      for (let count = found; count < required; count++) missingTokens.push(token);
    }

    return { valid: missingTokens.length === 0, missingTokens };
  }
}
