import type { ConversationalOperation, DraftFields, MissingField, RecommendedField } from "./types";

const missing = {
  customer: { key: "customer", required: true, labelAr: "العميل", labelEn: "Customer" },
  lines: { key: "lines", required: true, labelAr: "بند تجاري واحد على الأقل", labelEn: "At least one commercial line" },
  sourceReference: { key: "sourceReference", required: true, labelAr: "عرض السعر المعتمد المصدر", labelEn: "Approved source quotation" },
  attachment: { key: "attachment", required: true, labelAr: "ملف الرسم", labelEn: "Drawing attachment" },
  userIntent: { key: "userIntent", required: true, labelAr: "المطلوب من الرسم", labelEn: "Requested drawing scope" },
} satisfies Record<string, MissingField>;

const recommended = {
  currency: { key: "currency", labelAr: "العملة", labelEn: "Currency" },
  paymentTerms: { key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms" },
  scopeType: { key: "scopeType", labelAr: "نطاق التوريد أو الخدمة", labelEn: "Supply or service scope" },
} satisfies Record<string, RecommendedField>;

export function evaluateFormRequirements(operation: ConversationalOperation, fields: DraftFields, hasAttachment: boolean, contextText: string) {
  const missingRequired: MissingField[] = [];
  if (operation === "SALES_ORDER") {
    if (!fields.sourceReference) missingRequired.push(missing.sourceReference);
  } else if (operation === "DRAWING_TAKEOFF") {
    if (!hasAttachment) missingRequired.push(missing.attachment);
    if (!contextText.trim()) missingRequired.push(missing.userIntent);
  } else {
    if (!fields.customerMention) missingRequired.push(missing.customer);
    if (!fields.lines.length) missingRequired.push(missing.lines);
  }

  const optional: RecommendedField[] = [];
  if (operation !== "DRAWING_TAKEOFF" && operation !== "SALES_ORDER") {
    if (!fields.currencyCode) optional.push(recommended.currency);
    if (!fields.paymentTerms) optional.push(recommended.paymentTerms);
    if (operation === "QUOTATION" && !fields.scopeType) optional.push(recommended.scopeType);
  }
  return { missingRequired, recommended: optional };
}
