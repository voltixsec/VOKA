import type { CommercialTerms } from '../dto/AISalesAssistantDto';

export function latinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

export type ValidityDuration = { value: number; unit: 'DAY' | 'MONTH' };

const validityLabel = /^(?:مدة\s+صلاحية(?:\s+العرض)?|صلاحية\s+العرض|مدة\s+العرض|العرض\s+صالح|quotation\s+validity|validity|valid\s+for)\s*:?\s*/i;

/** Bounded, unambiguous durations; a month means a calendar month, not 30 days. */
export function parseValidityDuration(value: string): ValidityDuration | null {
  const text = latinDigits(value.trim()).replace(/[\u064B-\u065F\u0670]/g, '').replace(validityLabel, '').replace(/^(?:لمدة|خلال|for)\s*/i, '').replace(/\s+/g, ' ').replace(/[.،,]+$/, '').trim()
    .replace(/\s+(?:من\s+تاريخ\s+(?:العرض|عرض\s+السعر|إصدار\s+العرض|اصدار\s+العرض)|from\s+(?:the\s+)?(?:quotation|quote|issue)\s+date)$/i, '').trim();
  if (/^(?:أسبوع|اسبوع|أسبوع واحد|اسبوع واحد|one week|1 week)$/i.test(text)) return { value: 7, unit: 'DAY' };
  if (/^(?:أسبوعين|اسبوعين|أسبوعان|اسبوعان|two weeks|2 weeks)$/i.test(text)) return { value: 14, unit: 'DAY' };
  if (/^(?:شهر|شهر واحد|one month|1 month)$/i.test(text)) return { value: 1, unit: 'MONTH' };
  if (/^(?:شهرين|شهران|two months|2 months)$/i.test(text)) return { value: 2, unit: 'MONTH' };
  if (/^(?:ثلاثين|ثلاثون) (?:يوم|يوما|أيام|ايام)$/.test(text)) return { value: 30, unit: 'DAY' };
  if (/^(?:خمستاشر|خمسة عشر|خمسه عشر) (?:يوم|يوما|أيام|ايام)$/.test(text)) return { value: 15, unit: 'DAY' };
  const days = text.match(/^(\d{1,4})(?:\s*(?:يوما?|أيام|ايام|days?))?$/i)?.[1];
  return days && Number(days) >= 1 && Number(days) <= 3650 ? { value: Number(days), unit: 'DAY' } : null;
}

/** Only explicit dates/durations; never invent a company or jurisdiction policy. */
export function resolveExpiry(value: string, today: string): string | null {
  const text = latinDigits(value.trim()).replace(validityLabel, '');
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (iso) {
    const date = new Date(iso + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso) && iso >= today ? iso : null;
  }
  const duration = parseValidityDuration(text);
  if (!duration) return null;
  const date = new Date(today + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== today) return null;
  if (duration.unit === 'MONTH') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + duration.value);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else date.setUTCDate(date.getUTCDate() + duration.value);
  return date.toISOString().slice(0, 10);
}

/** Conservative labelled-clause extraction from existing company terms or user text. */
export function readCommercialClauses(text: string | null | undefined, today: string): CommercialTerms & { expiryDate: string | null } {
  const clauses = (text ?? '').split(/[\n;؛]+/).map((part) => part.trim().replace(/^(?:[-•*]|[0-9٠-٩]+[.)-])\s*/, '')).filter(Boolean);
  const clause = (pattern: RegExp) => clauses.find((part) => pattern.test(part)) ?? null;
  const validity = clause(/^(?:مدة\s+صلاحية|صلاحية\s+العرض|مدة\s+العرض|العرض\s+صالح|quotation\s+validity|validity|valid\s+for)(?=\s|:|$)/i)
    ?? (text ?? '').match(/(?:^|[،,;؛]\s*و?\s*|\s+و)(صلاحية\s+العرض\s*:?\s*[^،,;؛.]+)(?=[،,;؛.]|$)/i)?.[1]
    ?? null;
  return {
    paymentTerms: clause(/^(?:شروط\s+الدفع|الدفع|payment|payable|net\s+\d)/i),
    delivery: clause(/^(?:مدة\s+التسليم|التسليم|التوريد\s+خلال|delivery|deliver\s+within)/i),
    warranty: clause(/^(?:مدة\s+الضمان|الضمان|warranty|guarantee)/i),
    expiryDate: validity ? resolveExpiry(validity, today) : null,
  };
}

export function companyToday(timezone?: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}
