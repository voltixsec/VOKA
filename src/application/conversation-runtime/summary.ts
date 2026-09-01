import type { ConversationRuntimeState } from "./types";
import { quotationScopeLabel } from "./scope-labels";

const FIELDS = [
  ["system.identity", "النظام", "System"], ["system.jurisdiction", "الدولة", "Jurisdiction"], ["scope.type", "النطاق", "Scope"], ["system.quantity", "الكمية", "Quantity"], ["system.numberOfStops", "الطوابق / الوقفات", "Floors / stops"],
  ["customer.name", "العميل", "Customer"], ["project.name", "المشروع", "Project"], ["attention.name", "إلى عناية", "Attention"], ["commercial.validity", "صلاحية العرض", "Validity"],
] as const;
const PENDING = [["commercial.payment", "الدفع", "Payment"], ["commercial.delivery", "التسليم", "Delivery"], ["commercial.warranty", "الضمان", "Warranty"], ["commercial.validity", "صلاحية العرض", "Validity"]] as const;

export type RuntimeSummaryView = { summary: Array<{ key: string; labelAr: string; labelEn: string; value: string }>; stillNeeded: Array<{ key: string; labelAr: string; labelEn: string }>; evidence: Array<{ title: string; url: string; publisher: string }>; commercial: { draftReady: boolean } };

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
    evidence: state.toolResults.flatMap((result) => result.evidence),
    commercial: { draftReady: state.transitionState === "COMMERCIAL_HANDOFF" },
  };
}
