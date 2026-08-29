const arabicRelationalBoundary = /\s+(?=(?:لمشروع|للمشروع|بعناية|لتوريد|للتركيب|لتركيب|لعدد|والتسجيل|والدفع|وصلاحية)(?:\s|$))/u;

function boundedArabicEntity(value: string) {
  return value.split(arabicRelationalBoundary, 1)[0].replace(/[.،,؛;:]+$/g, "").trim();
}

/** Guards entity extraction, not commercial intent parsing. */
export function cleanCustomerEntity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mention = boundedArabicEntity(value.trim().replace(/^["«“]+|["»”.،,]+$/g, "").trim());
  if (!mention || mention.length > 300) return null;
  if (/^(?:شركة|شركه|العميل|customer|client|company)$/i.test(mention)) return null;
  if (/^(?:عايز|عاوز|أريد|اريد|اعمل|أعمل|انشئ|أنشئ|please\b|create\b|prepare\b|make\b)/i.test(mention)) return null;
  if (/(?:عرض\s+سعر|\bquotation\s+for\b|\bquote\s+for\b|[\d٠-٩]+\s*(?:كاميرات?|cameras?|units?|pcs?)(?=\s|$|[،,;.]))/iu.test(mention)) return null;
  return mention;
}

/** Used only when structured entity extraction is unavailable or unusable. */
export function fallbackCompanyEntity(prompt: string): string | null {
  const prefixed = prompt.match(/(?:^|\s)(للشركة|لشركة|(?:إلى|الى)\s+(?:ال)?شركة)\s+(.+?)(?=\s+(?:لمشروع|للمشروع|بعناية|لتوريد|للتركيب|لتركيب|لعدد|والتسجيل|والدفع|وصلاحية|[\d٠-٩]+|توريد|تركيب)|[\n،,;:]|$)/u);
  if (prefixed) {
    const legalPrefix = /للشركة|\s+الشركة/u.test(prefixed[1]) ? "الشركة" : "شركة";
    return cleanCustomerEntity(`${legalPrefix} ${prefixed[2]}`);
  }
  const matches = [...prompt.matchAll(/(?:^|\s)(?:ل(?=(?:ال)?(?:شركة|شركه))|(?:إلى|الى)\s+)?((?:ال)?(?:شركة|شركه)\s+[^\n،,;:]+?)(?=\s+(?:لمشروع|للمشروع|بعناية|لتوريد|للتركيب|لتركيب|لعدد|والتسجيل|والدفع|وصلاحية|[\d٠-٩]+|توريد|تركيب)|[\n،,;:]|$)/gu)];
  if (matches.length !== 1) return null;
  return cleanCustomerEntity(matches[0][1]);
}

/** Deterministic full-sentence ownership for Arabic relational fields. */
export function extractArabicRelationalEntities(prompt: string): { projectName: string | null; attentionName: string | null } {
  const projectName = prompt.match(/(?:^|\s)(?:لمشروع|للمشروع)\s+(.+?)(?=\s+(?:بعناية|لتوريد|للتركيب|لتركيب|والتسجيل|والدفع|وصلاحية)|[\n،,;:]|$)/u)?.[1] ?? null;
  const attentionName = prompt.match(/(?:^|\s)بعناية\s+(.+?)(?=\s+(?:لتوريد|للتركيب|لتركيب|لعدد|والتسجيل|والدفع|وصلاحية)|[\n،,;:]|$)/u)?.[1] ?? null;
  return {
    projectName: projectName ? boundedArabicEntity(projectName) : null,
    attentionName: attentionName ? boundedArabicEntity(attentionName) : null,
  };
}
