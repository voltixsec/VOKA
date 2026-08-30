import type { PaymentSchedule, SalesAssistantDraftProposal } from "../ai-sales-assistant/dto/AISalesAssistantDto";

export type FactSource = "USER_CORRECTION" | "USER_EXPLICIT" | "VERIFIED_DOCUMENT" | "VERIFIED_DATABASE" | "TRUSTED_PROFILE" | "DETERMINISTIC_DERIVATION" | "RESEARCHED" | "AI_INFERRED" | "DEFAULT";
export type CanonicalFact<T = unknown> = { value: T; source: FactSource; turnId: string; confidence: number; timestamp: string };
export type CanonicalFactLedger = { requestId: string; committedTurn: number; facts: Record<string, CanonicalFact> };
export type TurnPatch = { field: string; operation: "SET" | "REPLACE" | "APPEND" | "REMOVE" | "CLEAR"; value?: unknown; provenance: FactSource; evidence?: string };
export type TurnDecision = { requestId: string; turn: number; turnId: string; patches: TurnPatch[]; researchRequests: string[]; unresolvedFacts: string[]; nextQuestion: string | null; readinessProposal: CommercialReadiness };
export type PatchDiagnostic = { field: string; accepted: boolean; reason: "ACCEPTED" | "LOWER_AUTHORITY" | "FIELD_NOT_OWNED" | "INVALID_VALUE" | "STALE_TURN" | "CROSS_REQUEST" | "UNSUPPORTED_OPERATION" };
export type CommercialReadiness = "CONVERSATION_UNDERSTOOD" | "NEEDS_INFORMATION" | "SYSTEM_PLANNED" | "COMMERCIAL_MATERIALIZED" | "READY_FOR_DRAFT" | "READY_FOR_APPROVAL";
export type TransactionCommit = { decision: TurnDecision; accepted: TurnPatch[]; rejected: PatchDiagnostic[]; ledger: CanonicalFactLedger; readiness: CommercialReadiness };

const authority: Record<FactSource, number> = {
  USER_CORRECTION: 900, USER_EXPLICIT: 800, VERIFIED_DOCUMENT: 700, VERIFIED_DATABASE: 650,
  TRUSTED_PROFILE: 600, DETERMINISTIC_DERIVATION: 550, RESEARCHED: 300, AI_INFERRED: 200, DEFAULT: 100,
};
const ownedFields = new Set(["customerMention", "projectName", "attentionName", "expiryDate", "validity", "paymentTerms", "paymentSchedule", "delivery", "warranty", "currencyCode", "scopeType"]);

function valid(field: string, value: unknown) {
  if (field.startsWith("system.")) return typeof value === "string" ? Boolean(value.trim()) : typeof value === "number" ? Number.isFinite(value) : typeof value === "boolean";
  if (field === "paymentSchedule") {
    const schedule = value as PaymentSchedule;
    return Boolean(schedule?.complete && schedule.totalPercentage === 100 && schedule.milestones?.length && schedule.milestones.every((item) => item.percentage > 0 && item.percentage <= 100));
  }
  return value == null || (typeof value === "string" && value.trim().length > 0 && value.length <= 4000);
}

/** Pure request-scoped transactional reducer. It returns diagnostics, never mutates input. */
export function commitTurnDecision(current: CanonicalFactLedger | null | undefined, decision: TurnDecision, allowedFields: ReadonlySet<string>, timestamp = new Date().toISOString()): TransactionCommit {
  const base: CanonicalFactLedger = current ? { ...current, facts: { ...current.facts } } : { requestId: decision.requestId, committedTurn: decision.turn - 1, facts: {} };
  if (base.requestId !== decision.requestId) return { decision, accepted: [], rejected: decision.patches.map((patch) => ({ field: patch.field, accepted: false, reason: "CROSS_REQUEST" })), ledger: base, readiness: "NEEDS_INFORMATION" };
  if (decision.turn !== base.committedTurn + 1) return { decision, accepted: [], rejected: decision.patches.map((patch) => ({ field: patch.field, accepted: false, reason: "STALE_TURN" })), ledger: base, readiness: "NEEDS_INFORMATION" };
  const accepted: TurnPatch[] = [];
  const rejected: PatchDiagnostic[] = [];
  for (const patch of decision.patches) {
    if ((!ownedFields.has(patch.field) && !patch.field.startsWith("system.")) || !allowedFields.has(patch.field)) { rejected.push({ field: patch.field, accepted: false, reason: "FIELD_NOT_OWNED" }); continue; }
    if (!["SET", "REPLACE", "CLEAR"].includes(patch.operation)) { rejected.push({ field: patch.field, accepted: false, reason: "UNSUPPORTED_OPERATION" }); continue; }
    if (patch.operation !== "CLEAR" && !valid(patch.field, patch.value)) { rejected.push({ field: patch.field, accepted: false, reason: "INVALID_VALUE" }); continue; }
    const previous = base.facts[patch.field];
    if (previous && authority[patch.provenance] < authority[previous.source]) { rejected.push({ field: patch.field, accepted: false, reason: "LOWER_AUTHORITY" }); continue; }
    accepted.push(patch);
  }
  const facts = { ...base.facts };
  for (const patch of accepted) {
    if (patch.operation === "CLEAR") delete facts[patch.field];
    else facts[patch.field] = { value: structuredClone(patch.value), source: patch.provenance, turnId: decision.turnId, confidence: patch.provenance.startsWith("USER_") ? 1 : patch.provenance === "DEFAULT" ? .5 : .9, timestamp };
  }
  return { decision, accepted, rejected, ledger: { requestId: base.requestId, committedTurn: decision.turn, facts }, readiness: decision.readinessProposal };
}

function source(provenance: string | undefined, correction: boolean): FactSource {
  if (provenance === "USER_PROVIDED") return correction ? "USER_CORRECTION" : "USER_EXPLICIT";
  if (provenance === "CATALOG_MATCHED" || provenance === "CUSTOMER_DEFAULT") return "VERIFIED_DATABASE";
  if (provenance === "RULE_CALCULATED") return "DETERMINISTIC_DERIVATION";
  if (provenance === "COMPANY_DEFAULT") return "DEFAULT";
  return "AI_INFERRED";
}

export function proposalDecision(input: { requestId: string; turn: number; proposal: SalesAssistantDraftProposal; correctionFields: ReadonlySet<string>; readiness: CommercialReadiness }): TurnDecision {
  const proposal = input.proposal;
  const values: Record<string, unknown> = {
    customerMention: proposal.customer.mention, projectName: proposal.proposal.projectName, attentionName: proposal.proposal.attentionName,
    expiryDate: proposal.proposal.expiryDate, paymentTerms: proposal.commercialTerms?.paymentTerms, paymentSchedule: proposal.paymentSchedule,
    delivery: proposal.commercialTerms?.delivery, warranty: proposal.commercialTerms?.warranty,
    currencyCode: proposal.proposal.currencyCode, scopeType: proposal.proposal.scopeType,
  };
  const patches = Object.entries(values).flatMap(([field, value]): TurnPatch[] => {
    if (value == null) return [];
    const provenanceField = field === "paymentSchedule" ? "paymentTerms" : field;
    const provenance = proposal.fieldProvenance?.[provenanceField as keyof typeof proposal.fieldProvenance]
      ?? (field === "currencyCode" ? proposal.completion?.currency : field === "scopeType" ? proposal.completion?.scope : undefined)
      ?? (field === "currencyCode" || field === "scopeType" ? "RULE_CALCULATED" : undefined);
    return [{ field, operation: input.correctionFields.has(field) ? "REPLACE" : "SET", value, provenance: source(provenance, input.correctionFields.has(field)), evidence: "Committed from validated canonical proposal projection." }];
  });
  return { requestId: input.requestId, turn: input.turn, turnId: `${input.requestId}:${input.turn}`, patches, researchRequests: [], unresolvedFacts: [], nextQuestion: null, readinessProposal: input.readiness };
}

export function projectFactLedger(proposal: SalesAssistantDraftProposal, ledger: CanonicalFactLedger, locale: "ar" | "en", renderPayment: (schedule: PaymentSchedule, locale: "ar" | "en") => string | null): SalesAssistantDraftProposal {
  const fact = (field: string) => {
    const val = ledger.facts[field]?.value;
    return val === "DEFERRED" ? undefined : val;
  };
  const schedule = fact("paymentSchedule") as PaymentSchedule | undefined;
  const paymentTerms = schedule ? renderPayment(schedule, locale) : fact("paymentTerms") as string | undefined;
  const commercialTerms = { paymentTerms: paymentTerms ?? proposal.commercialTerms?.paymentTerms ?? null, delivery: fact("delivery") as string ?? proposal.commercialTerms?.delivery ?? null, warranty: fact("warranty") as string ?? proposal.commercialTerms?.warranty ?? null };
  const termsWithoutPayment = proposal.termsAndConditions?.split("\n").filter((line) => !/^(?:شروط\s+الدفع|الدفع|payment(?:\s+terms)?)\s*:/i.test(line)) ?? [];
  const renderedTerms = [paymentTerms ? `${locale === "ar" ? "شروط الدفع" : "Payment"}: ${paymentTerms}` : null, ...termsWithoutPayment].filter(Boolean).join("\n") || null;
  return {
    ...proposal, paymentSchedule: schedule ?? proposal.paymentSchedule, commercialTerms,
    customer: { ...proposal.customer, mention: fact("customerMention") as string ?? proposal.customer.mention },
    proposal: { ...proposal.proposal, projectName: fact("projectName") as string ?? proposal.proposal.projectName, attentionName: fact("attentionName") as string ?? proposal.proposal.attentionName, expiryDate: fact("expiryDate") as string ?? proposal.proposal.expiryDate, currencyCode: fact("currencyCode") as string ?? proposal.proposal.currencyCode, scopeType: fact("scopeType") as typeof proposal.proposal.scopeType ?? proposal.proposal.scopeType },
    termsAndConditions: renderedTerms, termsAndConditionsAr: locale === "ar" ? renderedTerms : proposal.termsAndConditionsAr, termsAndConditionsEn: locale === "en" ? renderedTerms : proposal.termsAndConditionsEn,
  };
}
