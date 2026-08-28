import type { PaymentTermsReview, SalesAssistantSourceLocale } from '../dto/AISalesAssistantDto';
import { latinDigits } from './commercial-field-values';
import { customerLocaleText } from './quotation-customer-text';

const paymentLabel = /^(?:شروط\s+الدفع|الدفع|payment(?:\s+terms)?)\s*:?\s*/i;
const milestones: Array<[RegExp, string, string]> = [
  [/^(?:مقدم(?:ا)?|دفعة\s+مقدم[ةه]|advance|in advance|upfront|down payment)$/i, 'دفعة مقدمة', 'advance'],
  [/^(?:عند\s+التسليم|(?:on|upon) delivery)$/i, 'عند التسليم', 'upon delivery'],
  [/^(?:بعد\s+التسليم|after delivery)$/i, 'بعد التسليم', 'after delivery'],
  [/^(?:بعد\s+التركيب|after installation)$/i, 'بعد التركيب', 'after installation'],
  [/^(?:عند\s+التركيب|(?:on|upon) installation)$/i, 'عند التركيب', 'upon installation'],
  [/^(?:بعد\s+الاختبار|after testing)$/i, 'بعد الاختبار', 'after testing'],
  [/^(?:عند\s+التوقيع|(?:on|upon) signing)$/i, 'عند التوقيع', 'upon signing'],
];
const percentage = /\d+(?:\.\d+)?\s*(?:%|percent\b|بالمئة|في المئة)/gi;

/** Extract actual user wording, not a provider's abbreviated/paraphrased payment field. */
export function explicitPaymentTerms(prompt: string): string | null {
  const text = latinDigits(prompt).replace(/٪/g, '%').replace(/٫/g, '.');
  const labelled = /(?:^|\s)(?:شروط\s+الدفع|والدفع|الدفع|payment(?:\s+terms)?)\s*:?\s*/i.exec(text);
  const unlabelled = /\d+(?:\.\d+)?\s*(?:%|percent\b)\s*(?:مقدم|دفعة\s+مقدم|عند\s+(?:التسليم|التوقيع|التركيب)|بعد\s+(?:التسليم|التركيب|الاختبار)|advance\b|upfront\b|in advance\b|down payment\b|(?:on|upon|after)\s+(?:delivery|installation|signing|testing)\b)/i.exec(text);
  // Preserve malformed signs/ranges too; dropping a minus could turn invalid
  // user input into an apparently valid positive schedule.
  const numericStart = unlabelled ? unlabelled.index - (text.slice(0, unlabelled.index).match(/[-−–+.\d/]+$/)?.[0].length ?? 0) : undefined;
  const start = labelled && (numericStart === undefined || labelled.index < numericStart) ? labelled.index + labelled[0].length : numericStart;
  if (start === undefined) return null;
  // A different explicitly labelled field ends payment ownership. Semicolons
  // between payment stages do not truncate the schedule.
  return text.slice(start).split(/(?:\n|[;؛])(?!\s*(?:\d+(?:\.\d+)?\s*%|(?:و)?الباقي|(?:and\s+)?(?:the\s+)?(?:balance|remainder)))\s*/i)[0]
    .split(/(?:[،,]\s*|\s+و)(?:صلاحية العرض|مدة التسليم|الضمان|validity|delivery|warranty)\s*:/i)[0].trim() || null;
}

/** Deterministic wording only: preserve amounts, stages and order; never fill a missing percentage. */
export function normalizePaymentTerms(value: string | null | undefined, locale: SalesAssistantSourceLocale): { text: string | null; review?: PaymentTermsReview } {
  if (!value?.trim()) return { text: null };
  const text = latinDigits(value.trim()).replace(/٪/g, '%').replace(/٫/g, '.').replace(paymentLabel, '');
  const tokens = [...text.matchAll(percentage)];
  if (!tokens.length && !/%|\bpercent\b|بالمئة|في المئة/i.test(text)) return { text: customerLocaleText(text, locale) };
  const amounts = tokens.map((token) => Number.parseFloat(token[0]));
  const total = amounts.length ? Number(amounts.reduce((sum, amount) => sum + amount, 0).toFixed(8)) : null;
  const fallback = customerLocaleText(text, locale);
  const invalid = (reason: PaymentTermsReview['reason']) => ({ text: fallback, review: { reason, totalPercentage: total } });
  if (!tokens.length || text.slice(0, tokens[0].index).trim() || amounts.some((amount) => !Number.isFinite(amount) || amount <= 0 || amount > 100)
    || tokens.some((token) => /[-−–.]\s*$/.test(text.slice(0, token.index)))
    || /\bor\b|(?:^|\s)(?:أو|او)(?:\s|$)/i.test(text)) return invalid('MALFORMED');
  const formatMilestone = (raw: string) => {
    const clean = raw.trim().replace(/^[,،;؛+\/\s]+|[,،;؛+\/\s.]+$/g, '').replace(/\s+(?:and|و)$/i, '').replace(/[,،;؛+\/\s.]+$/g, '').trim();
    const comparable = clean.replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ');
    if (!/[a-z\u0621-\u064a]/i.test(comparable) || /^(?:and|و)$/i.test(comparable)) return null;
    const known = milestones.find(([pattern]) => pattern.test(comparable));
    return known ? known[locale === 'ar' ? 1 : 2] : customerLocaleText(clean, locale);
  };
  let remainder: string | null = null;
  const stages: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    let suffix = text.slice(tokens[index].index! + tokens[index][0].length, tokens[index + 1]?.index ?? text.length).trim();
    if (index === tokens.length - 1) {
      const rest = /(?:\s+و|\s+and\s+|[,،;؛]\s*)(?:الباقي|(?:the\s+)?(?:balance|remainder))\s+(.+)$/i.exec(suffix);
      if (rest) {
        const when = formatMilestone(rest[1]);
        if (!when) return invalid('UNTRANSLATED');
        remainder = `${locale === 'ar' ? 'الباقي' : 'the balance'} ${when}`;
        suffix = suffix.slice(0, rest.index);
      }
      if (/(?:\s+and|\s+و|[+\/])\s*$/i.test(suffix)) return invalid('MALFORMED');
    }
    // A stray percent sign, an unlabelled second amount, or a dangling connector
    // is incomplete data, not permission to invent another payment stage.
    if (/%|\bpercent\b|بالمئة|في المئة|(?:[+,،]|\band\s+|و)\s*\d/i.test(suffix)) return invalid('MALFORMED');
    const when = formatMilestone(suffix);
    if (!when) return invalid('MALFORMED');
    stages.push(`${amounts[index]}% ${when}`);
  }
  const result = [...stages, ...(remainder ? [remainder] : [])].join(locale === 'ar' ? '، و' : ', ');
  if (remainder && total! >= 100) return { text: result, review: { reason: 'MALFORMED', totalPercentage: total } };
  if (!remainder && Math.abs(total! - 100) > 1e-8) return { text: result, review: { reason: 'TOTAL_NOT_100', totalPercentage: total } };
  return { text: result };
}
