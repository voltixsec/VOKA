import type { CommercialTerms } from '../dto/AISalesAssistantDto';

export function latinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

/** Only explicit dates/durations; never invent a company or jurisdiction policy. */
export function resolveExpiry(value: string, today: string): string | null {
  const text = latinDigits(value.trim());
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) {
    const date = new Date(iso + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso) && iso >= today ? iso : null;
  }
  const days = text.match(/^(?:لمدة\s*|خلال\s*|for\s*)?(\d{1,4})(?:\s*(?:يوماً?|أيام|ايام|يوم|days?))?$/i)?.[1];
  if (!days || Number(days) < 1 || Number(days) > 3650) return null;
  const date = new Date(today + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

/** Conservative labelled-clause extraction from existing company terms or user text. */
export function readCommercialClauses(text: string | null | undefined, today: string): CommercialTerms & { expiryDate: string | null } {
  const clauses = (text ?? '').split(/[\n;؛]+/).map((part) => part.trim().replace(/^(?:[-•*]|[0-9٠-٩]+[.)-])\s*/, '')).filter(Boolean);
  const clause = (pattern: RegExp) => clauses.find((part) => pattern.test(part)) ?? null;
  const validity = clause(/^(?:مدة\s+صلاحية|صلاحية\s+العرض|مدة\s+العرض|العرض\s+صالح|quotation\s+validity|validity|valid\s+for)(?=\s|:|$)/i);
  const duration = validity && latinDigits(validity).match(/\d{4}-\d{2}-\d{2}|\d{1,4}\s*(?:days?|يوماً?|أيام|ايام|يوم)/i)?.[0];
  return {
    paymentTerms: clause(/^(?:شروط\s+الدفع|الدفع|payment|payable|net\s+\d)/i),
    delivery: clause(/^(?:مدة\s+التسليم|التسليم|التوريد\s+خلال|delivery|deliver\s+within)/i),
    warranty: clause(/^(?:مدة\s+الضمان|الضمان|warranty|guarantee)/i),
    expiryDate: duration ? resolveExpiry(duration, today) : null,
  };
}

export function companyToday(timezone?: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}
