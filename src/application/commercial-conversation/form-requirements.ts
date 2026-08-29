import type { ConversationalOperation, DraftFields, MissingField, RecommendedField } from "./types";
import type { SalesAssistantDraftProposal } from "../ai-sales-assistant";
import type { CommercialAnswerField } from "../ai-sales-assistant/dto/AISalesAssistantDto";

const missing = {
  customer: { key: "customer", required: true, labelAr: "العميل", labelEn: "Customer", deferPolicy: "DEFER_ALLOWED" },
  lines: { key: "lines", required: true, labelAr: "بند تجاري واحد على الأقل", labelEn: "At least one commercial line", deferPolicy: "DEFER_NOT_ALLOWED" },
  sourceReference: { key: "sourceReference", required: true, labelAr: "عرض السعر المعتمد المصدر", labelEn: "Approved source quotation", deferPolicy: "DEFER_NOT_ALLOWED" },
  attachment: { key: "attachment", required: true, labelAr: "ملف الرسم", labelEn: "Drawing attachment", deferPolicy: "DEFER_NOT_ALLOWED" },
  userIntent: { key: "userIntent", required: true, labelAr: "المطلوب من الرسم", labelEn: "Requested drawing scope", deferPolicy: "DEFER_NOT_ALLOWED" },
} satisfies Record<string, MissingField>;

const recommended = {
  currency: { key: "currency", labelAr: "العملة", labelEn: "Currency" },
  paymentTerms: { key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms" },
  scopeType: { key: "scopeType", labelAr: "نطاق التوريد أو الخدمة", labelEn: "Supply or service scope" },
} satisfies Record<string, RecommendedField>;

export function evaluateFormRequirements(
  operation: ConversationalOperation,
  fields: DraftFields,
  hasAttachment: boolean,
  contextText: string,
  canonicalProposal?: SalesAssistantDraftProposal | null,
  completion?: { notApplicable?: CommercialAnswerField[] }
) {
  const missingRequired: MissingField[] = [];
  if (operation === "SALES_ORDER") {
    if (!fields.sourceReference) missingRequired.push(missing.sourceReference);
  } else if (operation === "DRAWING_TAKEOFF") {
    if (!hasAttachment) missingRequired.push(missing.attachment);
    if (!contextText.trim()) missingRequired.push(missing.userIntent);
  } else {
    // 1. ACTIVE SYSTEM / ENGINEERING / CONFIGURATION INPUTS
    const agentMissingInputs = canonicalProposal?.agenticState?.missingInputs ?? [];
    const unresolvedSystemInputs = [...(canonicalProposal?.smartSystem?.missingInputs ?? [])].sort((a, b) =>
      (canonicalProposal?.smartSystem?.inputs.findIndex((input) => input.name === a) ?? 0) - (canonicalProposal?.smartSystem?.inputs.findIndex((input) => input.name === b) ?? 0));
    for (const name of unresolvedSystemInputs) {
      const input = canonicalProposal?.smartSystem?.inputs.find((candidate) => candidate.name === name);
      missingRequired.push({
        key: "systemInput", required: true, sourceField: name,
        labelAr: input?.labelAr ?? name, labelEn: input?.labelEn ?? name,
        deferPolicy: "DEFER_NOT_ALLOWED",
      });
    }
    for (const name of agentMissingInputs) {
      const input = canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((candidate) => candidate.name === name);
      missingRequired.push({
        key: "systemInput", required: true, sourceField: name,
        labelAr: input?.labelAr ?? name, labelEn: input?.labelEn ?? name,
        deferPolicy: "DEFER_NOT_ALLOWED",
      });
    }

    // 2. CORE COMMERCIAL-DOCUMENT INFORMATION
    const proposed = canonicalProposal?.customer.status === "MISSING"
      && canonicalProposal.customer.proposedCustomerName?.trim();
    if (!fields.customerId && !proposed) missingRequired.push(missing.customer);
    canonicalProposal?.lines.forEach((line, index) => {
      if (line.resolutionStatus === "AMBIGUOUS") missingRequired.push({ key: "catalogChoice", sourceField: String(index), required: true, labelAr: `اختر البند: ${line.itemNameAr || line.itemName}`, labelEn: `Choose item: ${line.itemNameEn || line.itemName}`, deferPolicy: "DEFER_NOT_ALLOWED" });
      if (line.quantity == null) missingRequired.push({ key: "quantity", sourceField: String(index), required: true, labelAr: `كمية ${line.itemNameAr || line.itemName}`, labelEn: `Quantity for ${line.itemNameEn || line.itemName}`, deferPolicy: "DEFER_NOT_ALLOWED" });
    });
    if (!fields.lines.length && !unresolvedSystemInputs.length && !agentMissingInputs.length && !canonicalProposal?.agenticState) missingRequired.push(missing.lines);

    // 2. REQUIRED CORE DOCUMENT INFORMATION
    if (completion) {
      const requireDecision = (key: CommercialAnswerField & MissingField["key"], value: unknown, labelAr: string, labelEn: string, deferPolicy: MissingField["deferPolicy"] = "DEFER_ALLOWED") => {
        if (!value && !completion.notApplicable?.includes(key)) missingRequired.push({ key, required: true, labelAr, labelEn, deferPolicy });
      };
      if (operation === "QUOTATION" || operation === "CONTRACT") {
        requireDecision("projectName", canonicalProposal?.proposal.projectName, "اسم المشروع", "Project name");
        requireDecision("attentionName", canonicalProposal?.proposal.attentionName, "بعناية", "Attention to");
      }

      // 3. PAYMENT / VALIDITY / OTHER COMMERCIAL TERMS
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
