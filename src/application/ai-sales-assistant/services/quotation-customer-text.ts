import type { ExtractedSalesIntent, ResolvedLineItem, SalesAssistantSourceLocale } from '../dto/AISalesAssistantDto';

/** Review diagnostics are not commercial clauses, even if a provider labels them Notes. */
export function isInternalReviewText(value: string): boolean {
  return /formula|provenance|confidence|catalog\s*(?:match|diagnostic)|review\s*(?:is\s*)?(?:required|warning)|engineering\s*calculations?|(?:engineering|price|quantity)\s*estimat|prices?.*approximate|required\s*storage|\b(?:RULE_CALCULATED|AI_ESTIMATED|NEEDS_CONFIRMATION)\b|assumptions?|حسابات?\s*(?:ال)?(?:هندسي|تخزين)|معادل|افتراض|ثقة|مطابقة.*كتالوج|تقديرات?.*(?:هندس|سعر|أسعار)|(?:سعر|أسعار|هندسة).*تقريبي|سعة.*مطلوبة/i.test(value);
}

// Only known labels/phrases are translated here. Unknown cross-locale prose is
// withheld for clarification, never machine-invented into contractual wording.
const phrases: Array<[string, string]> = [
  ['شروط الدفع', 'Payment terms'], ['نطاق العمل', 'Scope of Work'],
  ['صلاحية العرض', 'Quotation validity'], ['عند التسليم', 'on delivery'],
  ['مقدم', 'advance'], ['نقداً', 'cash'], ['خلال', 'within'],
  ['الدفع', 'Payment'], ['التسليم', 'Delivery'], ['الضمان', 'Warranty'],
  ['يوم', 'days'], ['شهر', 'months'], ['سنة', 'years'],
];
export function customerLocaleText(value: string | null | undefined, locale: SalesAssistantSourceLocale): string | null {
  if (!value?.trim() || isInternalReviewText(value)) return null;
  let text = value.trim();
  if (locale === 'ar') {
    for (const [ar, en] of phrases) text = text.replace(new RegExp(`\\b${en}\\b`, 'gi'), ar);
    text = text.replace(/\bday\b/gi, 'يوم').replace(/\bmonth\b/gi, 'شهر').replace(/\byear\b/gi, 'سنة');
    // Technical tokens remain valid; descriptive English is not a translated clause.
    const withoutTechnical = text.replace(/\b(?:CCTV|NVR|DVR|PoE|RJ45|CAT[56](?:e|A)?|UTP|IP|HDD|SSD|TB|GB|Mbps|\d+MP|\d+K)\b/gi, '');
    if (/[a-z]/i.test(withoutTechnical)) return null;
  } else if (/[\u0600-\u06ff]/.test(text)) {
    // English output never silently incorporates untranslated Arabic prose.
    return null;
  }
  return text;
}

export function explicitCustomerNote(prompt: string): string | null {
  return prompt.split(/[\n;؛]+/).map((part) => part.trim())
    .map((part) => part.match(/^(?:ملاحظة(?:\s+للعميل)?|ملاحظات(?:\s+للعميل)?|customer\s+note|notes?)\s*:\s*(.+)$/i)?.[1])
    .filter((part): part is string => Boolean(part)).join('\n') || null;
}

/** No transcript, project/contact fields, formulas or AI prose are inputs to this projection. */
export function professionalQuotationText(intent: ExtractedSalesIntent, lines: ResolvedLineItem[], locale: SalesAssistantSourceLocale) {
  const ar = locale === 'ar';
  const scope = {
    SUPPLY_ONLY: ['توريد', 'Supply'], SUPPLY_AND_INSTALLATION: ['توريد وتركيب', 'Supply and installation'],
    INSTALLATION_ONLY: ['تركيب', 'Installation'], SERVICE: ['خدمات', 'Services'],
    MAINTENANCE: ['صيانة', 'Maintenance'], CONSULTATION: ['استشارات', 'Consultation'], CUSTOM: ['', ''],
  }[intent.scopeType ?? 'CUSTOM'][ar ? 0 : 1];
  const system = intent.smartSystem;
  const systemName = system?.systemType === 'CCTV' ? (ar ? 'نظام مراقبة بالكاميرات' : 'CCTV surveillance system') : system ? customerLocaleText(ar ? system.systemNameAr : system.systemNameEn, locale) : null;
  const cameraCount = lines.find((line) => line.componentKey === 'CCTV_CAMERAS')?.quantity;
  const offeredNames = lines.slice(0, 4).map((line) => {
    const name = customerLocaleText((ar ? line.itemNameAr : line.itemNameEn) || line.itemName, locale);
    if (!name || name.length > 140 || /(?:اعمل|عايز|عاوز|أعمل|أريد|اريد|عرض سعر|\b(?:create|prepare|please|quotation for)\b)/i.test(name)) return null;
    if ([intent.customerMention, intent.projectName, intent.attentionName].some((value) => value && name.includes(value))) return null;
    return name;
  }).filter(Boolean);
  const subjectDetail = systemName ?? (offeredNames.length > 0 && offeredNames.length === lines.length && lines.length <= 2 ? offeredNames.join(ar ? ' و' : ' and ') : ar ? 'البنود والخدمات الموضحة' : 'Listed items and services');
  const document = intent.documentType === 'INVOICE' ? (ar ? 'فاتورة' : 'Invoice') : intent.documentType === 'CONTRACT' ? (ar ? 'عقد' : 'Contract') : (ar ? 'عرض سعر' : 'Quotation');
  const subject = `${document} – ${[scope, subjectDetail].filter(Boolean).join(' ')}${cameraCount != null ? ` – ${cameraCount} ${ar ? 'كاميرا' : 'cameras'}` : ''}`;
  const briefDetail = systemName ?? (offeredNames.length ? offeredNames.join(ar ? '، ' : ', ') + (lines.length > offeredNames.length ? (ar ? ' وبقية البنود الموضحة' : ' and the remaining listed items') : '') : ar ? 'البنود والخدمات الموضحة في العرض' : 'the listed items and services');
  const brief = ar
    ? `يسرنا تقديم عرضنا ${scope ? `ل${scope} ` : 'بشأن '}${briefDetail}${cameraCount != null ? `، مكوّن من ${cameraCount} كاميرا` : ''}، وفق البنود والكميات الموضحة في العرض.`
    : `We are pleased to offer ${scope ? scope.toLowerCase() + ' of ' : ''}${briefDetail}${cameraCount != null ? `, comprising ${cameraCount} cameras` : ''}, in accordance with the listed items and quantities.`;
  return { subject, brief };
}
