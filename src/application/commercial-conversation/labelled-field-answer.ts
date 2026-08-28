import type { FieldAnswer } from './types';

/** Explicit field ownership beats the pending question; bare replies still target it. */
export function labelledFieldAnswer(text: unknown): FieldAnswer | undefined {
  if (typeof text !== 'string') return undefined;
  const labels = [
    ['customerMention', /^(?:اسم العميل|العميل|customer|client)\s*:\s*(.+)$/i],
    ['projectName', /^(?:اسم المشروع|المشروع|project(?: name)?)\s*:\s*(.+)$/i],
    ['attentionName', /^(?:عناية|عناية السيد|attention)\s*:\s*(.+)$/i],
    ['expiryDate', /^(?:صلاحية العرض|مدة صلاحية العرض|validity|quotation validity)\s*:\s*(.+)$/i],
    ['paymentTerms', /^(?:شروط الدفع|الدفع|payment(?: terms)?)\s*:\s*(.+)$/i],
    ['delivery', /^(?:التسليم|مدة التسليم|delivery)\s*:\s*(.+)$/i],
    ['warranty', /^(?:الضمان|مدة الضمان|warranty)\s*:\s*(.+)$/i],
    ['notes', /^(?:ملاحظة(?: للعميل)?|ملاحظات(?: للعميل)?|customer note|notes?)\s*:\s*(.+)$/i],
  ] as const;
  for (const [field, pattern] of labels) {
    const match = text.trim().match(pattern);
    if (match) return { field, value: match[1].trim() };
  }
}
