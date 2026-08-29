/** Remove conversational framing at the boundary, never infer or rewrite a name. */
export function cleanAttentionName(value: string | null | undefined): string | null {
  let name = value?.trim() ?? '';
  let previous: string;
  do {
    previous = name;
    name = name.replace(/^(?:أنا|انا)\s+(?=(?:المهندس|المهندسة|الأستاذ|الاستاذ|الدكتور|السيد)(?:\s|$))/u, '').trim();
    name = name.replace(/^(?:أهلاً|أهلا|اهلاً|اهلا|تمام|يا|العرض\s+بعناية|بعناية|عناية|hello|hi|dear|attention|attn)(?:\s*[:،,]\s*|\s+|$)/iu, '').trim();
  } while (name !== previous);
  name = name.replace(/^ل(?=ل(?:أستاذ|استاذ|مهندس|سيد|دكتور)(?:\s|$))/u, 'ا');
  return name || null;
}

/** Remove relational/conversational framing while preserving the project value. */
export function cleanProjectName(value: string | null | undefined): string | null {
  const name = value?.trim().replace(/^(?:لمشروع|اسم\s+المشروع|مشروع)(?:\s*[:،,]\s*|\s+|$)/iu, '').trim() ?? '';
  return name || null;
}
