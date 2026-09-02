import type { ConversationRuntimeState } from "./types";
import { quotationScopeLabel } from "./scope-labels";

const FIELDS = [
  ["system.identity", "النظام", "System"], ["system.jurisdiction", "الدولة", "Jurisdiction"], ["scope.type", "النطاق", "Scope"], ["system.quantity", "الكمية", "Quantity"], ["system.numberOfStops", "الطوابق / الوقفات", "Floors / stops"],
  ["customer.name", "العميل", "Customer"], ["project.name", "المشروع", "Project"], ["attention.name", "إلى عناية", "Attention"], ["commercial.validity", "صلاحية العرض", "Validity"],
] as const;
const PENDING = [["commercial.payment", "الدفع", "Payment"], ["commercial.delivery", "التسليم", "Delivery"], ["commercial.warranty", "الضمان", "Warranty"], ["commercial.validity", "صلاحية العرض", "Validity"]] as const;

export type RuntimeSummaryView = { summary: Array<{ key: string; labelAr: string; labelEn: string; value: string }>; stillNeeded: Array<{ key: string; labelAr: string; labelEn: string }>; evidence: Array<{ title: string; url: string; publisher: string }>; commercial: { draftReady: boolean } };

export function normalizeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return value.normalize("NFKC").trim();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    url.hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.normalize("NFKC").trim();
  }
}

export function deduplicateRuntimeEvidence(evidence: RuntimeSummaryView["evidence"]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = normalizeEvidenceUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function runtimeSummaryValue(fact: RuntimeSummaryView["summary"][number], locale: "ar" | "en") {
  return fact.key === "scope.type" ? quotationScopeLabel(fact.value, locale) ?? "" : fact.value;
}

export function projectRuntimeSummary(state: ConversationRuntimeState): RuntimeSummaryView {
  return {
    summary: FIELDS.flatMap(([key, labelAr, labelEn]) => state.confirmedFacts[key] ? [{ key, labelAr, labelEn, value: String(state.confirmedFacts[key].value) }] : []),
    stillNeeded: PENDING.flatMap(([key, labelAr, labelEn]) => {
      const workspaceKey = key.slice("commercial.".length) as "payment" | "delivery" | "warranty" | "validity";
      return state.confirmedFacts[key] || state.workspace?.terms[workspaceKey] ? [] : [{ key, labelAr, labelEn }];
    }),
    evidence: deduplicateRuntimeEvidence(state.toolResults.flatMap((result) => result.evidence)),
    commercial: { draftReady: state.transitionState === "COMMERCIAL_HANDOFF" },
  };
}
