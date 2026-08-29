import type { FieldAnswer } from './types';

/** Explicit field ownership beats the pending question; bare replies still target it. */
export function labelledFieldAnswer(text: unknown): FieldAnswer | undefined {
  if (typeof text !== 'string') return undefined;
  const correction = text.trim();
  const cameraCorrection = correction.match(/(?:خليهم|اجعل(?:هم)?|change(?: them)?(?: to)?)\s*([٠-٩\d]+)\s*(?:بدل|instead of)?\s*[٠-٩\d]*/i);
  if (cameraCorrection) return { field: 'cameraCount', value: cameraCorrection[1] };
  const customerCorrection = correction.match(/(?:لا[،,]?\s*)?(?:[^،,]*?\s)?(?:العميل|customer|client)\s+(?:هو\s+|is\s+)?(.+)$/i);
  if (customerCorrection && /(?:مش|ليس|not|بدل|replace|change|لا[،,]?)/i.test(correction)) return { field: 'customerMention', value: customerCorrection[1].trim() };
  const labels = [
    ['customerMention', /^(?:اسم العميل|العميل|customer|client)\s*:?\s*(.+)$/i],
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
