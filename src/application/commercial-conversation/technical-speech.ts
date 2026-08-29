const TECHNICAL_TERMS: Array<{ canonical: string; variants: RegExp[] }> = [
  { canonical: "IP", variants: [/آ[يى]\s*بي/gi, /اي\s*بي/gi] },
  { canonical: "NVR", variants: [/\bN\s*V\s*R\b/gi, /إن\s*في\s*آر/gi, /ان\s*في\s*ار/gi, /جهاز تسجيل الكاميرات/gi, /مسجل الكاميرات/gi] },
  { canonical: "DVR", variants: [/\bD\s*V\s*R\b/gi, /دي\s*في\s*آر/gi, /دي\s*في\s*ار/gi] },
  { canonical: "PoE", variants: [/\bP\s*O\s*E\b/gi, /بي\s*أو\s*إي/gi, /بي\s*او\s*اي/gi] },
  { canonical: "RJ45", variants: [/\bR\s*J\s*[- ]?45\b/gi, /آر\s*جي\s*45/gi, /ار\s*جي\s*45/gi] },
  { canonical: "4MP", variants: [/\b4\s*(?:MP|M\s*P|megapixels?)\b/gi, /4\s*ميجا\s*بكسل/gi, /أربع(?:ة)?\s*ميجا\s*بكسل/gi] },
  { canonical: "8MP", variants: [/\b8\s*(?:MP|M\s*P|megapixels?)\b/gi, /8\s*ميجا\s*بكسل/gi, /ثمان(?:ية|يه)\s*ميجا\s*بكسل/gi] },
  { canonical: "CAT6", variants: [/\bCAT\s*[- ]?6\b/gi, /كات\s*6/gi, /كات\s*ستة/gi] },
  { canonical: "H.265", variants: [/\bH\s*\.?\s*265\b/gi, /إتش\s*\.?\s*265/gi, /اتش\s*\.?\s*265/gi] },
  { canonical: "PTZ", variants: [/\bP\s*T\s*Z\b/gi, /بي\s*تي\s*زد/gi, /بي\s*تي\s*زي/gi] },
];

/** Conservative vocabulary normalization: spelling variants only, never inferred capabilities. */
export function normalizeTechnicalSpeech(value: string): string {
  let normalized = value;
  for (const term of TECHNICAL_TERMS) {
    for (const variant of term.variants) normalized = normalized.replace(variant, term.canonical);
  }
  return normalized.replace(/\s+/g, " ").trim();
}
