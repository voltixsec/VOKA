import type {
  CommercialSolutionHandoff,
  ConversationAction,
  ConversationOrchestratorDecision,
  ConversationResponseFocus,
  ConversationToolAction,
  ConversationTransition,
  SolutionReadiness,
  WorkingCommercialDraft,
} from "./types";

const actions = new Set<ConversationAction>([
  "ANSWER_USER", "EXPLAIN", "ASK_ENGINEERING", "OFFER_OPTIONS", "RECOMMEND", "ASK_FOR_CONFIRMATION",
  "REQUEST_ATTACHMENT", "REQUEST_DRAWING", "RESEARCH", "CONTINUE_EXPLORATION", "PROPOSE_COMMERCIAL_HANDOFF", "COMMERCIAL_FOLLOWUP",
]);
const readinessStates = new Set<SolutionReadiness>(["NOT_READY", "READY_TO_PROPOSE", "AWAITING_USER_TRANSITION", "READY_FOR_COMMERCIAL_HANDOFF"]);
const transitions = new Set<ConversationTransition>(["NONE", "PROPOSE", "CONFIRM", "REOPEN"]);
const toolActions = new Set<ConversationToolAction>(["NONE", "RESEARCH", "INSPECT_ATTACHMENT", "REQUEST_DRAWING"]);
const responseFocuses = new Set<ConversationResponseFocus>([
  "ACKNOWLEDGE_FACTS", "ADDRESS_QUESTION", "EXPLAIN_LIMITATION", "PRESENT_OPTIONS", "ASK_REFERENCED_FIELD",
  "OFFER_HANDOFF", "CONFIRM_HANDOFF", "REQUEST_ATTACHMENT", "CONTINUE",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function legacyAction(mode: unknown): ConversationAction {
  if (mode === "QUESTION") return "ANSWER_USER";
  if (mode === "RECOMMENDATION") return "RECOMMEND";
  if (mode === "UNKNOWN") return "EXPLAIN";
  return "CONTINUE_EXPLORATION";
}

function legacyFocus(action: ConversationAction): ConversationResponseFocus {
  if (action === "ANSWER_USER") return "ADDRESS_QUESTION";
  if (action === "EXPLAIN") return "EXPLAIN_LIMITATION";
  if (action === "OFFER_OPTIONS" || action === "RECOMMEND") return "PRESENT_OPTIONS";
  if (action === "ASK_ENGINEERING") return "ASK_REFERENCED_FIELD";
  if (action === "PROPOSE_COMMERCIAL_HANDOFF") return "OFFER_HANDOFF";
  if (action === "COMMERCIAL_FOLLOWUP") return "CONFIRM_HANDOFF";
  if (action === "REQUEST_ATTACHMENT" || action === "REQUEST_DRAWING") return "REQUEST_ATTACHMENT";
  return "CONTINUE";
}

export function parseOrchestratorDecision(raw: unknown): ConversationOrchestratorDecision | null {
  const value = record(raw);
  if (!value) return null;
  const action = actions.has(value.action as ConversationAction) ? value.action as ConversationAction : legacyAction(value.mode);
  const readiness = readinessStates.has(value.solutionReadiness as SolutionReadiness) ? value.solutionReadiness as SolutionReadiness : "NOT_READY";
  const transition = transitions.has(value.transition as ConversationTransition) ? value.transition as ConversationTransition : "NONE";
  const toolAction = toolActions.has(value.toolAction as ConversationToolAction)
    ? value.toolAction as ConversationToolAction
    : value.researchRequired === true ? "RESEARCH" : "NONE";
  const responseFocus = responseFocuses.has(value.responseFocus as ConversationResponseFocus)
    ? value.responseFocus as ConversationResponseFocus
    : legacyFocus(action);
  return {
    action, readiness, transition, toolAction, responseFocus,
    referencedField: typeof value.referencedField === "string" ? value.referencedField : typeof value.targetField === "string" ? value.targetField : null,
    reasonCode: typeof value.reasonCode === "string" ? value.reasonCode.slice(0, 80) : null,
    providerAvailable: true,
  };
}

export function fallbackOrchestratorDecision(engineeringFields: string[]): ConversationOrchestratorDecision {
  const referencedField = engineeringFields[0] ?? null;
  return {
    action: referencedField ? "ASK_ENGINEERING" : "CONTINUE_EXPLORATION",
    readiness: "NOT_READY", transition: "NONE", referencedField,
    toolAction: "NONE", responseFocus: referencedField ? "ASK_REFERENCED_FIELD" : "CONTINUE",
    reasonCode: "PROVIDER_FALLBACK", providerAvailable: false,
  };
}

const intentKeys = new Set([
  "documentType", "customerMention", "projectName", "attentionName", "subject", "brief", "scopeOfWork", "paymentTerms",
  "delivery", "warranty", "expiryDate", "currencyCode", "notes", "scopeType", "facts", "lines",
]);

/** Keeps the one-call intent usable while removing control-target payloads and unknown provider keys. */
export function sanitizeControlIntent(raw: unknown, targetField: string | null, currentTurn: string) {
  const value = record(raw);
  if (!value) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!intentKeys.has(key) || key === targetField) continue;
    if (typeof candidate === "string" && candidate.trim() === currentTurn.trim()) continue;
    safe[key] = candidate;
  }
  safe.documentType ??= null;
  safe.lines = Array.isArray(safe.lines) ? safe.lines : [];
  safe.facts = Array.isArray(safe.facts)
    ? safe.facts.filter((fact) => {
        const item = record(fact);
        return item && item.name !== targetField && item.value !== currentTurn && item.evidence !== currentTurn;
      })
    : [];
  return safe;
}

export function confirmsCommercialTransition(text: string) {
  return /^(?:تمام\s*(?:كمل|كمّل|جهز|اعمل)|اعمل(?:لي|ها)?\s*(?:العرض|عرض\s*السعر)|جهز\s*(?:العرض|عرض\s*السعر)|طلع(?:لي)?\s*(?:quotation|عرض\s*السعر)|اعتمد\s*كده|prepare\s+(?:the\s+)?quote|create\s+(?:the\s+)?quotation|yes[,\s]+proceed)[.!؟\s]*$/iu.test(text.trim());
}

export function reopensSolutionExploration(text: string) {
  return /(?:استن[ىي]|لحظه|قبل\s+ما\s+نكمل|عايز\s+اضيف|أريد\s+إضافة|wait|hold\s+on|i\s+want\s+to\s+add|before\s+we\s+proceed)/iu.test(text);
}

export function buildCommercialSolutionHandoff(draft: WorkingCommercialDraft): CommercialSolutionHandoff {
  const facts = draft.transactionalState?.ledger.facts ?? {};
  const primitive = (field: string) => {
    const value = facts[field]?.value;
    return ["string", "number", "boolean"].includes(typeof value) ? value as string | number | boolean : null;
  };
  const confirmedEngineeringInputs = Object.entries(facts).flatMap(([field, fact]) => {
    if (!field.startsWith("system.") || field === "system.identity" || field === "system.jurisdiction") return [];
    if (!["string", "number", "boolean"].includes(typeof fact.value)) return [];
    return [{ field: field.slice("system.".length), value: fact.value as string | number | boolean, source: fact.source }];
  });
  const provisional = draft.canonicalProposal?.agenticState?.provisionalSystem;
  return {
    createdAtTurn: draft.transactionalState?.ledger.committedTurn ?? draft.turns.length,
    systemIdentity: primitive("system.identity") as string | null,
    scopeType: primitive("scopeType") as string | null,
    jurisdiction: primitive("system.jurisdiction") as string | null,
    confirmedEngineeringInputs,
    limitations: [...(provisional?.limitations ?? [])],
    evidence: (provisional?.evidence ?? []).map(({ title, url, publisher }) => ({ title, url, publisher })),
    unresolvedEngineeringFields: [...(draft.completionDiagnostics?.missingEngineering ?? [])],
  };
}

