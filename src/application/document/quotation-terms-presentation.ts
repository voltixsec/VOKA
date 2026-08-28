/** Presentation only: no splitting sentences, renumbering legal references or saved-text mutation. */
export function quotationTermsPresentation(text: string) {
  const clauses = text.split(/\r?\n/).filter((line) => line.trim());
  const labelled = /^(?:شروط الدفع|الدفع|مدة التوريد|التوريد|مدة التسليم|التسليم|الضمان|مدة الضمان|صلاحية العرض|الأعمال المستثناة|الاستثناءات|جاهزية الموقع|نطاق العمل|payment(?: terms)?|delivery(?: period)?|warranty|quotation validity|validity|exclusions|site readiness|scope of work)\s*:\s*\S/i;
  // Existing numbering/bullets, continuation lines and prose stay exactly as approved.
  const numbered = clauses.length > 1 && clauses.every((line) => labelled.test(line));
  return { clauses: numbered ? clauses : null, text: numbered ? clauses.map((clause, i) => `${i + 1}. ${clause}`).join('\n') : text };
}
