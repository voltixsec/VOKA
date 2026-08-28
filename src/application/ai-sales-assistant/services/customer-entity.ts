/** Guards entity extraction, not commercial intent parsing. */
export function cleanCustomerEntity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mention = value.trim().replace(/^["«“]+|["»”.،,]+$/g, "").trim();
  if (!mention || mention.length > 300) return null;
  if (/^(?:شركة|شركه|العميل|customer|client|company)$/i.test(mention)) return null;
  if (/^(?:عايز|عاوز|أريد|اريد|اعمل|أعمل|انشئ|أنشئ|please\b|create\b|prepare\b|make\b)/i.test(mention)) return null;
  if (/(?:عرض\s+سعر|\bquotation\s+for\b|\bquote\s+for\b|[\d٠-٩]+\s*(?:كاميرات?|cameras?|units?|pcs?)(?=\s|$|[،,;.]))/iu.test(mention)) return null;
  return mention;
}

/** Used only when structured entity extraction is unavailable or unusable. */
export function fallbackCompanyEntity(prompt: string): string | null {
  const matches = [...prompt.matchAll(/(?:^|\s)((?:ال)?(?:شركة|شركه)\s+[^\n،,;:]+?)(?=\s+(?:[\d٠-٩]+|توريد|تركيب)|[\n،,;:]|$)/gu)];
  if (matches.length !== 1) return null;
  return cleanCustomerEntity(matches[0][1]);
}
