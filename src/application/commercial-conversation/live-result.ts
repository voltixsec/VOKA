import type { LiveResultItem, LiveResultStatus, StructuredLiveResult, WorkingCommercialDraft } from "./types";

function sourceStatus(source: string): LiveResultStatus {
  if (source.startsWith("USER_")) return "CONFIRMED";
  if (source === "VERIFIED_DATABASE" || source === "VERIFIED_DOCUMENT" || source === "TRUSTED_PROFILE" || source === "DETERMINISTIC_DERIVATION") return "VERIFIED";
  if (source === "RESEARCHED" || source === "AI_INFERRED" || source === "DEFAULT") return "PROVISIONAL";
  return "NEEDS_CONFIRMATION";
}

const labels: Record<string, [string, string]> = {
  customerMention: ["العميل", "Customer"], projectName: ["المشروع", "Project"], paymentTerms: ["الدفع", "Payment"],
  delivery: ["التسليم", "Delivery"], warranty: ["الضمان", "Warranty"], expiryDate: ["الصلاحية", "Validity"],
  currencyCode: ["العملة", "Currency"], scopeType: ["النطاق", "Scope"],
};

export function projectStructuredResult(draft: WorkingCommercialDraft): StructuredLiveResult {
  const facts: LiveResultItem[] = [];
  for (const [key, fact] of Object.entries(draft.transactionalState?.ledger.facts ?? {})) {
    const [ar, en] = labels[key] ?? (key.startsWith("system.") ? [key.slice(7), key.slice(7)] : [key, key]);
    facts.push({ key, labelAr: ar, labelEn: en, value: fact.value === "DEFERRED" ? "DEFERRED" : typeof fact.value === "object" ? JSON.stringify(fact.value) : String(fact.value), status: fact.value === "DEFERRED" ? "DEFERRED" : sourceStatus(fact.source) });
  }
  for (const [index, line] of (draft.canonicalProposal?.lines ?? []).entries()) {
    facts.push({ key: `line.${index}`, labelAr: line.itemNameAr ?? line.itemName, labelEn: line.itemNameEn ?? line.itemName, value: line.quantity == null ? "?" : String(line.quantity), status: line.unitPrice == null ? "PRICE_REQUIRED" : line.catalogItemId ? "VERIFIED" : "PROVISIONAL" });
  }
  for (const missing of draft.missingRequired) {
    const key = missing.sourceField ? `pending.${missing.sourceField}` : `pending.${missing.key}`;
    if (!facts.some((item) => item.key === key)) facts.push({ key, labelAr: missing.labelAr, labelEn: missing.labelEn, value: missing.state === "DEFERRED" ? "DEFERRED" : "PENDING", status: missing.state === "DEFERRED" ? "DEFERRED" : "NEEDS_CONFIRMATION" });
  }
  const evidence = draft.canonicalProposal?.agenticState?.provisionalSystem?.evidence.map(({ title, url, publisher }) => ({ title, url, publisher })) ?? [];
  return { facts, evidence, readiness: draft.readinessStage ?? "CONVERSATION_UNDERSTOOD" };
}
