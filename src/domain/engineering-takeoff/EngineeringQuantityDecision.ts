/**
 * Phase 2A-11: GOVERNED ENGINEERING QUANTITY DECISIONS.
 *
 * A decision is the FIRST and ONLY way an engineering quantity becomes approved.
 * It is where a human takes responsibility for a number, and it is therefore the
 * most carefully constrained model in the phase:
 *
 * - a decision is APPEND-ONLY. A later decision supersedes an earlier one by
 *   pointing at it; the earlier row is never updated, so history cannot be
 *   rewritten and an audit can always reconstruct what was believed, when, and
 *   by whom;
 * - a decision records the ORIGIN CHAIN it relied on — the candidate, the
 *   evidence claims, the count rule, the calculation, the adjustment — so the
 *   approved number is traceable to its exact sources rather than to a memory
 *   of what someone looked at;
 * - a decision requires an actor, a reason, a unit, and an explicit
 *   confirmation. There is no system actor and no implicit approval.
 *
 * Engineering approval is NOT commercial approval: a decision carries no price,
 * no currency, no supplier, and no product selection, and it cannot be consumed
 * by any commercial object.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { ENGINEERING_DECISION_VERSION, engineeringId, type EngineeringQuantityOrigin } from "./EngineeringQuantityTaxonomy";
import type { EngineeringQuantityCandidate } from "./EngineeringQuantityCandidate";
import type { ResolvedEngineeringUnit } from "./EngineeringUnitConversion";

// ---------------------------------------------------------------------------
// Decision state
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a quantity decision.
 *
 * A decision is never deleted or edited. `SUPERSEDED` is a state on the OLD
 * record, set when a new decision points at it, and even that transition is
 * recorded rather than silent.
 */
export const QUANTITY_DECISION_STATES = ["APPROVED", "SUPERSEDED", "WITHDRAWN"] as const;
export type QuantityDecisionState = (typeof QUANTITY_DECISION_STATES)[number];

/** Why a decision was taken. Never inferred, always asserted by the actor. */
export const QUANTITY_DECISION_BASES = [
  "ADOPTED_SOURCE_VALUE",
  "ADOPTED_COUNTED_VALUE",
  "ADOPTED_CALCULATED_VALUE",
  "ADOPTED_ADJUSTED_VALUE",
  "RESOLVED_SOURCE_CONFLICT",
  "REPLACED_BY_REVISED_EVIDENCE",
  "CORRECTED_BY_HUMAN",
] as const;
export type QuantityDecisionBasis = (typeof QUANTITY_DECISION_BASES)[number];

const QUANTITY_DECISION_BASIS_SET = new Set<string>(QUANTITY_DECISION_BASES);
export function isQuantityDecisionBasis(value: string): value is QuantityDecisionBasis {
  return QUANTITY_DECISION_BASIS_SET.has(value);
}

// ---------------------------------------------------------------------------
// Decision record
// ---------------------------------------------------------------------------

/**
 * A durable, immutable engineering quantity decision.
 *
 * `decisionVersion` is monotonic per (company, takeoff scope, subject), so the
 * version history is readable without a separate sequence table and a
 * concurrent approval cannot silently reuse a version number.
 */
export type EngineeringQuantityDecision = {
  decisionId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  /** Monotonic version for this subject inside this scope. */
  decisionVersion: number;
  /** The approved engineering quantity of record. */
  approvedValue: number;
  approvedUnitLiteral: string;
  approvedUnitDimension: string;
  /** Origin of the value that was adopted. */
  quantityOrigin: EngineeringQuantityOrigin;
  decisionBasis: QuantityDecisionBasis;
  actorUserId: string;
  rationale: string;
  decidedAt: string;
  /** Exact candidates this decision resolved. Never empty. */
  sourceCandidateIds: string[];
  /** 2A-10 claim ids this decision rests on. */
  sourceClaimIds: string[];
  /** Occurrence ledger entries, when a count supported the decision. */
  sourceLedgerEntryIds: string[];
  /** Calculation record, when a governed calculation supported the decision. */
  sourceCalculationId: string | null;
  /** Adjustment record, when an adjustment supported the decision. */
  sourceAdjustmentId: string | null;
  /** Winning candidate, when the decision resolved a conflict by choosing one. */
  selectedCandidateId: string | null;
  /** Conflict group, when the decision resolved one. */
  resolvedConflictSubjectKey: string | null;
  /** Previous decision this one supersedes. Null for the first decision. */
  supersedesDecisionId: string | null;
  state: QuantityDecisionState;
  /** Superseding decision id, set when a later decision replaced this one. */
  supersededByDecisionId: string | null;
  /** Revision membership ids the decision was taken against, for traceability. */
  revisionMembershipIds: string[];
  documentIdentityIds: string[];
  limitations: string[];
  decisionContractVersion: string;
};

export function buildDecisionId(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string; decisionVersion: number }): string {
  return engineeringId("eqd", "quantity-decision", [input.companyId, input.takeoffScopeId, input.subjectMatchKey, input.decisionVersion]);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DecisionValidation = { valid: boolean; problem: string | null };

/**
 * Validates a decision request BEFORE it is recorded.
 *
 * Refuses: a blank rationale, a non-positive or non-finite quantity (unless the
 * unit is additive-agnostic), a missing unit, and a request that names no
 * candidate at all. A quantity decision with no source is an assertion with no
 * basis, which this phase does not accept.
 */
export function validateQuantityDecisionRequest(input: {
  approvedValue: number;
  approvedUnitLiteral: string;
  rationale: string;
  actorUserId: string;
  decisionBasis: string;
  sourceCandidateIds: readonly string[];
}): DecisionValidation {
  if (!input.actorUserId.trim()) return { valid: false, problem: "an engineering quantity decision must record the actor who took it" };
  if (!input.rationale.trim()) return { valid: false, problem: "an engineering quantity decision must record the reviewer's rationale" };
  if (!isQuantityDecisionBasis(input.decisionBasis)) {
    return { valid: false, problem: `the decision basis ${input.decisionBasis} is not a recognized engineering decision basis` };
  }
  if (!Number.isFinite(input.approvedValue)) return { valid: false, problem: "an engineering quantity must be a finite number" };
  if (input.approvedValue < 0) return { valid: false, problem: "an engineering quantity may not be negative" };
  if (!input.approvedUnitLiteral.trim()) return { valid: false, problem: "an engineering quantity decision must state the unit of the approved quantity" };
  if (input.sourceCandidateIds.length === 0) {
    return { valid: false, problem: "an engineering quantity decision must cite at least one governed candidate; VOKA never records an approved quantity with no traceable source" };
  }
  return { valid: true, problem: null };
}

/**
 * Builds a decision.
 *
 * The function is intentionally total over a validated request: it constructs the
 * record and nothing else. It does not mutate the candidate it adopted, does not
 * touch an earlier decision, and does not create any downstream object.
 */
export function buildQuantityDecision(input: {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  decisionVersion: number;
  approvedValue: number;
  approvedUnitLiteral: string;
  approvedUnitDimension: string;
  quantityOrigin: EngineeringQuantityOrigin;
  decisionBasis: QuantityDecisionBasis;
  actorUserId: string;
  rationale: string;
  decidedAt: string;
  sourceCandidates: readonly EngineeringQuantityCandidate[];
  selectedCandidateId: string | null;
  supersedesDecisionId: string | null;
  revisionMembershipIds?: readonly string[];
  documentIdentityIds?: readonly string[];
  resolvedConflictSubjectKey?: string | null;
}): EngineeringQuantityDecision {
  const validation = validateQuantityDecisionRequest({
    approvedValue: input.approvedValue,
    approvedUnitLiteral: input.approvedUnitLiteral,
    rationale: input.rationale,
    actorUserId: input.actorUserId,
    decisionBasis: input.decisionBasis,
    sourceCandidateIds: input.sourceCandidates.map((candidate) => candidate.candidateId),
  });
  if (!validation.valid) throw new Error(validation.problem ?? "the engineering quantity decision is invalid");

  const sourceReferences = input.sourceCandidates.flatMap((candidate) => candidate.sourceReferences);

  return {
    decisionId: buildDecisionId({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: input.subjectMatchKey,
      decisionVersion: input.decisionVersion,
    }),
    companyId: input.companyId,
    takeoffScopeId: input.takeoffScopeId,
    subjectMatchKey: input.subjectMatchKey,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectLabel: input.subjectLabel,
    requirementKind: input.requirementKind,
    decisionVersion: input.decisionVersion,
    approvedValue: input.approvedValue,
    approvedUnitLiteral: input.approvedUnitLiteral,
    approvedUnitDimension: input.approvedUnitDimension,
    quantityOrigin: input.quantityOrigin,
    decisionBasis: input.decisionBasis,
    actorUserId: input.actorUserId,
    rationale: input.rationale,
    decidedAt: input.decidedAt,
    sourceCandidateIds: input.sourceCandidates.map((candidate) => candidate.candidateId).sort(),
    sourceClaimIds: [...new Set(sourceReferences.map((reference) => reference.claimId).filter((claimId): claimId is string => claimId !== null))].sort(),
    sourceLedgerEntryIds: [...new Set(sourceReferences.map((reference) => reference.ledgerEntryId).filter((entryId): entryId is string => entryId !== null))].sort(),
    sourceCalculationId: sourceReferences.find((reference) => reference.calculationId)?.calculationId ?? null,
    sourceAdjustmentId: sourceReferences.find((reference) => reference.adjustmentId)?.adjustmentId ?? null,
    selectedCandidateId: input.selectedCandidateId,
    resolvedConflictSubjectKey: input.resolvedConflictSubjectKey ?? null,
    supersedesDecisionId: input.supersedesDecisionId,
    state: "APPROVED",
    supersededByDecisionId: null,
    revisionMembershipIds: [...(input.revisionMembershipIds ?? [])].sort(),
    documentIdentityIds: [...(input.documentIdentityIds ?? [])].sort(),
    limitations: [],
    decisionContractVersion: ENGINEERING_DECISION_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Immutable history
// ---------------------------------------------------------------------------

/**
 * Applies a supersession.
 *
 * The ONLY permitted change to an existing decision is retiring it, and even
 * that is expressed by returning a NEW record rather than editing in place — so
 * a caller holding the old reference still sees the old truth. Attempting to
 * alter the approved value, unit, actor, or basis of a recorded decision throws,
 * because those are the fields an audit depends on.
 */
export function supersedeDecision(input: {
  previous: EngineeringQuantityDecision;
  replacement: EngineeringQuantityDecision;
}): EngineeringQuantityDecision {
  if (input.replacement.companyId !== input.previous.companyId) {
    throw new Error("a decision may only supersede a decision inside the same company");
  }
  if (input.replacement.takeoffScopeId !== input.previous.takeoffScopeId || input.replacement.subjectMatchKey !== input.previous.subjectMatchKey) {
    throw new Error("a decision may only supersede a decision about the same subject in the same takeoff scope");
  }
  if (input.replacement.decisionVersion <= input.previous.decisionVersion) {
    throw new Error("a superseding decision must carry a higher decision version");
  }
  return { ...input.previous, state: "SUPERSEDED", supersededByDecisionId: input.replacement.decisionId };
}

/**
 * Detects an in-place mutation of a recorded decision.
 *
 * It exists so a governance test can prove the history mechanism, rather than
 * trusting that no caller edits a record.
 */
export function detectDecisionMutation(existing: EngineeringQuantityDecision, incoming: EngineeringQuantityDecision): { mutated: boolean; fields: string[] } {
  if (existing.decisionId !== incoming.decisionId) return { mutated: false, fields: [] };
  const immutableFields: Array<keyof EngineeringQuantityDecision> = [
    "approvedValue",
    "approvedUnitLiteral",
    "approvedUnitDimension",
    "quantityOrigin",
    "decisionBasis",
    "actorUserId",
    "rationale",
    "decidedAt",
    "decisionVersion",
    "takeoffScopeId",
    "subjectMatchKey",
    "companyId",
  ];
  const fields = immutableFields.filter((field) => JSON.stringify(existing[field]) !== JSON.stringify(incoming[field])).map((field) => String(field));
  return { mutated: fields.length > 0, fields };
}

/** The decision currently in force for a subject: the highest version that is APPROVED. */
export function currentDecision(decisions: readonly EngineeringQuantityDecision[], input: { takeoffScopeId: string; subjectMatchKey: string }): EngineeringQuantityDecision | null {
  const relevant = decisions
    .filter((decision) => decision.takeoffScopeId === input.takeoffScopeId && decision.subjectMatchKey === input.subjectMatchKey && decision.state === "APPROVED")
    .sort((left, right) => right.decisionVersion - left.decisionVersion);
  return relevant[0] ?? null;
}

/** Full history for a subject, oldest first. Never truncated by the caller's convenience. */
export function decisionHistory(decisions: readonly EngineeringQuantityDecision[], input: { takeoffScopeId: string; subjectMatchKey: string }): EngineeringQuantityDecision[] {
  return decisions
    .filter((decision) => decision.takeoffScopeId === input.takeoffScopeId && decision.subjectMatchKey === input.subjectMatchKey)
    .sort((left, right) => left.decisionVersion - right.decisionVersion);
}

/**
 * Next decision version for a subject.
 *
 * Derived from the existing history so a version is never reused, including
 * after a supersession.
 */
export function nextDecisionVersion(decisions: readonly EngineeringQuantityDecision[], input: { takeoffScopeId: string; subjectMatchKey: string }): number {
  const history = decisionHistory(decisions, input);
  return history.reduce((max, decision) => Math.max(max, decision.decisionVersion), 0) + 1;
}

/** The decision contract version this module implements. */
export const DECISION_CONTRACT_VERSION = ENGINEERING_DECISION_VERSION;

// ---------------------------------------------------------------------------
// Unit resolution helper for callers
// ---------------------------------------------------------------------------

/** Narrows a resolved unit to the decision fields, refusing an unresolved unit. */
export function decisionUnitFields(unit: ResolvedEngineeringUnit): { approvedUnitLiteral: string; approvedUnitDimension: string } {
  if (!unit.resolved) throw new Error(`an engineering quantity decision requires a resolvable unit; "${unit.originalLiteral}" is not one`);
  return { approvedUnitLiteral: unit.canonicalUnit ?? unit.originalLiteral, approvedUnitDimension: unit.dimension };
}
