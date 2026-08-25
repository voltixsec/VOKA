export type CommercialOperation = "QUOTATION" | "SALES_ORDER" | "CONTRACT" | "INVOICE" | "PAYMENT" | "DRAWING_TAKEOFF";
export type CommercialOperationClassification = { operation: CommercialOperation | null; confidence: "EXPLICIT" | "AMBIGUOUS"; candidates: CommercialOperation[] };
const rules: Array<[CommercialOperation, RegExp[]]> = [
  ["DRAWING_TAKEOFF", [/(?=.*(?:مخطط|رسم|بلو?برنت))(?=.*(?:احصر|حلل|طلع|كامير))/i, /(?=.*(?:drawing|plan|blueprint))(?=.*(?:takeoff|analyse|analyze|count|quotation))/i]],
  ["PAYMENT", [/(?:سجل|اثبت|أضف).*(?:دفعة|دفع|تحصيل)/i, /(?:record|add|receive).*(?:payment|collection)/i]],
  ["INVOICE", [/(?:فاتورة|فوترة)/i, /\b(?:invoice|billing)\b/i]],
  ["CONTRACT", [/(?:عقد|اتفاقية)/i, /\b(?:contract|agreement)\b/i]],
  ["SALES_ORDER", [/(?:أمر\s*بيع|طلب\s*بيع)/i, /\bsales?\s+order\b/i]],
  ["QUOTATION", [/(?:عرض\s*سعر|تسعيرة|مقايسة)/i, /\b(?:quotation|quote|proposal)\b/i]],
];
export function classifyCommercialOperation(input: unknown): CommercialOperationClassification { if (typeof input !== "string" || input.trim().length < 3 || input.trim().length > 4000) return { operation: null, confidence: "AMBIGUOUS", candidates: [] }; const matches = rules.filter(([, patterns]) => patterns.some((pattern) => pattern.test(input))).map(([operation]) => operation); const unique = [...new Set(matches)]; for (const specific of ["DRAWING_TAKEOFF", "PAYMENT"] as const) if (unique.includes(specific)) return { operation: specific, confidence: "EXPLICIT", candidates: [specific] }; return unique.length === 1 ? { operation: unique[0], confidence: "EXPLICIT", candidates: unique } : { operation: null, confidence: "AMBIGUOUS", candidates: unique }; }
