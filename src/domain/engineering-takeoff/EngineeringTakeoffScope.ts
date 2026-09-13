/**
 * Phase 2A-11: THE ENGINEERING TAKEOFF ROOT.
 *
 * A takeoff needs a durable root to hold its occurrence ledger, candidates,
 * calculations, adjustments, and decisions. This module defines that root.
 *
 * The most important design decision here is what the root is NOT: it is not a
 * second project master. There is already a project/context identity in VOKA, and
 * duplicating it would create two competing truths about the same building. So
 * the takeoff root is modelled as an ANALYSIS SCOPE that REFERENCES the existing
 * project context by key, and never owns project master data of its own.
 *
 * A scope is tenant-scoped, version-safe, bound to a defined evidence scope, and
 * honest about whether it is ready. It references accepted Phase 2A-10 evidence
 * state rather than copying it.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { engineeringId, type BomCompletenessState, type EngineeringReadinessState } from "./EngineeringQuantityTaxonomy";

// ---------------------------------------------------------------------------
// Scope kinds
// ---------------------------------------------------------------------------

/**
 * What kind of engineering analysis a takeoff scope represents.
 *
 * A scope kind describes the ENGINEERING QUESTION being asked. It is never a
 * commercial scope type: installing, supplying, and servicing are commercial
 * packaging decisions made elsewhere, and this phase deliberately does not
 * conflate the two.
 */
export const TAKEOFF_SCOPE_KINDS = [
  "MATERIAL_TAKEOFF",
  "EQUIPMENT_SCHEDULE_TAKEOFF",
  "SYSTEM_TAKEOFF",
  "DISCIPLINE_TAKEOFF",
  "WHOLE_PACKAGE_TAKEOFF",
] as const;
export type TakeoffScopeKind = (typeof TAKEOFF_SCOPE_KINDS)[number];

const TAKEOFF_SCOPE_KIND_SET = new Set<string>(TAKEOFF_SCOPE_KINDS);
export function isTakeoffScopeKind(value: string): value is TakeoffScopeKind {
  return TAKEOFF_SCOPE_KIND_SET.has(value);
}

/** Lifecycle of a takeoff scope. */
export const TAKEOFF_SCOPE_STATES = ["OPEN", "DECIDING", "BOM_ISSUED", "SUPERSEDED"] as const;
export type TakeoffScopeState = (typeof TAKEOFF_SCOPE_STATES)[number];

// ---------------------------------------------------------------------------
// Scope record
// ---------------------------------------------------------------------------

/**
 * The durable engineering analysis root.
 *
 * `projectContextKey` REFERENCES the existing project/context identity instead of
 * creating one. It is a nullable string rather than a foreign key to a new project
 * table, precisely so this phase cannot become a second project master.
 */
export type EngineeringTakeoffScope = {
  takeoffScopeId: string;
  companyId: string;
  /** Reference to the existing project/context identity. Never a new project master. */
  projectContextKey: string | null;
  name: string;
  description: string;
  scopeKind: TakeoffScopeKind;
  state: TakeoffScopeState;
  /** The accepted 2A-10 comparison scope this takeoff derives from. */
  comparisonScopeId: string;
  /** The accepted 2A-10 run whose evidence state this takeoff was built against. */
  comparisonRunId: string | null;
  /** Digest of the accepted evidence input, so a re-derivation is detectable. */
  evidenceInputDigest: string | null;
  /** Number of evidence claims the scope accepted after governance. */
  acceptedClaimCount: number;
  /** Number of evidence claims withheld by governance, with reasons reported separately. */
  withheldClaimCount: number;
  revisionPolicy: string;
  /** Truthful readiness of the takeoff as a whole. */
  readiness: EngineeringReadinessState;
  readinessReasons: string[];
  completeness: BomCompletenessState | null;
  blockReasons: string[];
  limitations: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  /** Monotonic scope version: a re-derivation against new evidence bumps it. */
  scopeVersion: number;
  /** Previous scope version this one replaces, when a re-derivation occurred. */
  supersedesScopeId: string | null;
  takeoffContractVersion: string;
};

export function buildTakeoffScopeId(input: { companyId: string; comparisonScopeId: string; scopeKind: TakeoffScopeKind; name: string }): string {
  return engineeringId("ets", "takeoff-scope", [input.companyId, input.comparisonScopeId, input.scopeKind, input.name]);
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export const TAKEOFF_BLOCK_REASONS = [
  "NO_ACCEPTED_EVIDENCE",
  "EVIDENCE_SCOPE_UNRESOLVED",
  "REVISION_GOVERNANCE_INCOMPLETE",
  "INCOMPATIBLE_ACTIVE_REVISIONS",
  "EVIDENCE_COVERAGE_PARTIAL",
  "SOURCE_BYTES_UNAVAILABLE",
  "QUANTITIES_UNRESOLVED",
  "CONFLICTING_EVIDENCE_UNRESOLVED",
] as const;
export type TakeoffBlockReason = (typeof TAKEOFF_BLOCK_REASONS)[number];

/**
 * Computes truthful takeoff readiness.
 *
 * Each problem keeps its own identity and none of them is compressed into a
 * single boolean. A takeoff over partial evidence is PARTIAL_EVIDENCE rather
 * than READY, and a takeoff whose sources conflict is BLOCKED until a human
 * resolves the conflict — because "we have some numbers" is not readiness.
 */
export function takeoffReadiness(input: {
  acceptedClaimCount: number;
  hasComparisonRun: boolean;
  identitiesWithoutDecision: number;
  incompatibleActiveRevisions: boolean;
  anySourcePartial: boolean;
  anySourceUnavailable: boolean;
  unresolvedQuantityCount: number;
  conflictingSubjectCount: number;
}): { readiness: EngineeringReadinessState; blockReasons: TakeoffBlockReason[]; reasons: string[] } {
  const blockReasons: TakeoffBlockReason[] = [];
  const reasons: string[] = [];

  if (input.acceptedClaimCount === 0) {
    blockReasons.push("NO_ACCEPTED_EVIDENCE");
    reasons.push("no governed evidence was accepted for this takeoff scope, so there is nothing to derive an engineering quantity from");
  }
  if (!input.hasComparisonRun) {
    blockReasons.push("EVIDENCE_SCOPE_UNRESOLVED");
    reasons.push("the takeoff scope has no accepted comparison run, so its evidence state is unknown");
  }
  if (input.identitiesWithoutDecision > 0) {
    blockReasons.push("REVISION_GOVERNANCE_INCOMPLETE");
    reasons.push(`${input.identitiesWithoutDecision} document identit${input.identitiesWithoutDecision === 1 ? "y has" : "ies have"} no active-revision decision, so their evidence was withheld`);
  }
  if (input.incompatibleActiveRevisions) {
    blockReasons.push("INCOMPATIBLE_ACTIVE_REVISIONS");
    reasons.push("incompatible active revisions block this takeoff until a reviewer settles which revision governs");
  }
  if (input.anySourceUnavailable) {
    blockReasons.push("SOURCE_BYTES_UNAVAILABLE");
    reasons.push("at least one source's bytes were unavailable, so its content could not be verified");
  }
  if (input.anySourcePartial) {
    blockReasons.push("EVIDENCE_COVERAGE_PARTIAL");
    reasons.push("at least one source was only partially inspected, so absence of evidence from it is not asserted");
  }
  if (input.conflictingSubjectCount > 0) {
    blockReasons.push("CONFLICTING_EVIDENCE_UNRESOLVED");
    reasons.push(`${input.conflictingSubjectCount} subject${input.conflictingSubjectCount === 1 ? " has" : "s have"} conflicting evidence that no engineering decision has resolved`);
  }
  if (input.unresolvedQuantityCount > 0) {
    blockReasons.push("QUANTITIES_UNRESOLVED");
    reasons.push(`${input.unresolvedQuantityCount} quantit${input.unresolvedQuantityCount === 1 ? "y is" : "ies are"} unresolved and await a human decision`);
  }

  const blocker = (reason: TakeoffBlockReason) => blockReasons.includes(reason);
  if (blocker("NO_ACCEPTED_EVIDENCE") || blocker("EVIDENCE_SCOPE_UNRESOLVED") || blocker("INCOMPATIBLE_ACTIVE_REVISIONS") || blocker("SOURCE_BYTES_UNAVAILABLE")) {
    return { readiness: "BLOCKED", blockReasons, reasons };
  }
  if (blocker("EVIDENCE_COVERAGE_PARTIAL") || blocker("REVISION_GOVERNANCE_INCOMPLETE")) {
    return { readiness: "REVIEW_REQUIRED", blockReasons, reasons };
  }
  if (blocker("CONFLICTING_EVIDENCE_UNRESOLVED") || blocker("QUANTITIES_UNRESOLVED")) {
    return { readiness: "REVIEW_REQUIRED", blockReasons, reasons };
  }
  return { readiness: "READY_FOR_DECISION", blockReasons, reasons };
}

/**
 * Whether a scope may issue a BOM version.
 *
 * A takeoff with no accepted evidence cannot issue a BOM: issuing an empty or
 * fabricated BOM would hand a downstream phase a confident-looking plan built on
 * nothing.
 */
export function canIssueBom(scope: EngineeringTakeoffScope, rows: { total: number; approved: number }): { ok: boolean; problem: string | null } {
  if (scope.acceptedClaimCount === 0 && scope.withheldClaimCount > 0) {
    return { ok: false, problem: "this takeoff scope has no accepted evidence: every claim was withheld by governance, so no BOM can be issued" };
  }
  if (rows.total === 0) {
    return { ok: false, problem: "a BOM version with no rows is not issued; there is no engineering content to record" };
  }
  if (rows.approved === 0) {
    return { ok: false, problem: "no engineering quantity has been approved yet, so there is nothing for a BOM version to snapshot as approved" };
  }
  return { ok: true, problem: null };
}

/** The takeoff contract version this module implements. */
export const TAKEOFF_CONTRACT_VERSION = "2a-11.takeoff.v1";
