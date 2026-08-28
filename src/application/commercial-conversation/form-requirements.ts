import type { ConversationalOperation, DraftFields, MissingField, RecommendedField } from "./types";
import type { SalesAssistantDraftProposal } from "../ai-sales-assistant";
import type { CommercialAnswerField } from "../ai-sales-assistant/dto/AISalesAssistantDto";

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

export function evaluateFormRequirements(operation: ConversationalOperation, fields: DraftFields, hasAttachment: boolean, contextText: string, canonicalProposal?: SalesAssistantDraftProposal | null, completion?: { notApplicable?: CommercialAnswerField[] }) {
  const missingRequired: MissingField[] = [];
  if (operation === "SALES_ORDER") {
    if (!fields.sourceReference) missingRequired.push(missing.sourceReference);
  } else if (operation === "DRAWING_TAKEOFF") {
    if (!hasAttachment) missingRequired.push(missing.attachment);
    if (!contextText.trim()) missingRequired.push(missing.userIntent);
  } else {
    // Review is not persistence: only quotations can carry a server-discovered
    // unregistered name. The existing save use case still requires a real ID.
    const proposed = operation === "QUOTATION" && canonicalProposal?.customer.status === "MISSING"
      && canonicalProposal.customer.proposedCustomerName?.trim();
    if (!fields.customerId && !proposed) missingRequired.push(missing.customer);
    canonicalProposal?.lines.forEach((line, index) => {
      if (line.resolutionStatus === "AMBIGUOUS") missingRequired.push({ key: "catalogChoice", sourceField: String(index), required: true, labelAr: `اختر البند: ${line.itemNameAr || line.itemName}`, labelEn: `Choose item: ${line.itemNameEn || line.itemName}` });
      if (line.quantity == null) missingRequired.push({ key: "quantity", sourceField: String(index), required: true, labelAr: `كمية ${line.itemNameAr || line.itemName}`, labelEn: `Quantity for ${line.itemNameEn || line.itemName}` });
    });
    if (!fields.lines.length && !(canonicalProposal?.smartSystem?.missingInputs.length)) missingRequired.push(missing.lines);
    const unresolvedSystemInputs = [...(canonicalProposal?.smartSystem?.missingInputs ?? [])].sort((a, b) =>
      (canonicalProposal?.smartSystem?.inputs.findIndex((input) => input.name === a) ?? 0) - (canonicalProposal?.smartSystem?.inputs.findIndex((input) => input.name === b) ?? 0));
    for (const name of unresolvedSystemInputs) {
      const input = canonicalProposal?.smartSystem?.inputs.find((candidate) => candidate.name === name);
      missingRequired.push({ key: "systemInput", required: true, sourceField: name, labelAr: input?.labelAr ?? name, labelEn: input?.labelEn ?? name });
    }
    // Professional review decisions use existing form/DTO fields, not a second
    // persistence schema. Nullable form fields permit an explicit N/A decision.
    if (completion) {
      const requireDecision = (key: CommercialAnswerField & MissingField["key"], value: unknown, labelAr: string, labelEn: string) => {
        if (!value && !completion.notApplicable?.includes(key)) missingRequired.push({ key, required: true, labelAr, labelEn });
      };
      if (operation === "QUOTATION" || operation === "CONTRACT") {
        requireDecision("projectName", canonicalProposal?.proposal.projectName, "اسم المشروع", "Project name");
        requireDecision("attentionName", canonicalProposal?.proposal.attentionName, "بعناية", "Attention to");
      }
      if (operation === "QUOTATION") requireDecision("expiryDate", canonicalProposal?.proposal.expiryDate, "صلاحية العرض", "Quotation validity");
      requireDecision("paymentTerms", canonicalProposal?.paymentTermsReview ? null : canonicalProposal?.commercialTerms?.paymentTerms, "شروط الدفع", "Payment terms");
      if (operation === "QUOTATION" || operation === "CONTRACT") {
        requireDecision("delivery", canonicalProposal?.commercialTerms?.delivery, "مدة التسليم", "Delivery timing");
        requireDecision("warranty", canonicalProposal?.commercialTerms?.warranty, "الضمان", "Warranty");
      }
    }
  }

  const optional: RecommendedField[] = [];
  if (operation !== "DRAWING_TAKEOFF" && operation !== "SALES_ORDER") {
    if (!fields.currencyCode) optional.push(recommended.currency);
    if (!completion && !fields.paymentTerms) optional.push(recommended.paymentTerms);
    if (operation === "QUOTATION" && !fields.scopeType) optional.push(recommended.scopeType);
  }
  return { missingRequired, recommended: optional };
}
