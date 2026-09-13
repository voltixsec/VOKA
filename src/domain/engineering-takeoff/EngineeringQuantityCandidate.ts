/**
 * Phase 2A-11: ENGINEERING QUANTITY CANDIDATES.
 *
 * A candidate is what the evidence SUPPORTS. It is not an approval, it is not a
 * winner, and it carries no field that could be mistaken for one.
 *
 * The single most important rule in this module is the conflict rule:
 *
 *   When two sources disagree about the same subject, VOKA produces candidates
 *   for BOTH and marks them conflicting. It never averages, never takes the
 *   highest, never takes the lowest, never majority-votes, and never prefers a
 *   source because of its document role. Resolution happens only through an
 *   explicit engineering decision, downstream.
 *
 * That rule is expressed structurally: `ConflictingCandidateGroup` has no
 * `selectedCandidateId`, no `winner`, and no `resolvedValue`, so no consumer can
 * read a winner that does not exist.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { engineeringId, type CandidateQuantityOrigin, type EngineeringReadinessState } from "./EngineeringQuantityTaxonomy";
import type { HandoffQuantityClaimLike } from "./EngineeringEvidenceBridge";

// ---------------------------------------------------------------------------
// Candidate sources
// ---------------------------------------------------------------------------

/**
 * What produced a candidate.
 *
 * Every candidate names exactly one basis, so a reviewer can see whether a
 * number came from a document, from a count VOKA performed, from a governed
 * calculation, or from an adjustment on an approved base.
 */
export const CANDIDATE_BASES = [
  "SOURCE_CLAIM",
  "OCCURRENCE_COUNT",
  "GOVERNED_CALCULATION",
  "ENGINEERING_ADJUSTMENT",
] as const;
export type CandidateBasis = (typeof CANDIDATE_BASES)[number];

// ---------------------------------------------------------------------------
// Conflict state
// ---------------------------------------------------------------------------

/**
 * Conflict state of a candidate.
 *
 * `CONFLICTING` is a first-class, terminal-until-a-human-acts state. A candidate
 * in this state may NOT be approved: see `assertCandidateDecidable`.
 */
export const CANDIDATE_CONFLICT_STATES = ["UNDISPUTED", "CONFLICTING", "AMBIGUOUS_SUBJECT", "BLOCKED_INCOMPATIBLE_UNITS"] as const;
export type CandidateConflictState = (typeof CANDIDATE_CONFLICT_STATES)[number];

export type CandidateSourceReference = {
  basis: CandidateBasis;
  /** 2A-10 claim id this candidate cites, when it came from evidence. */
  claimId: string | null;
  sourceArtifactId: string;
  derivationFamilyRootArtifactId: string;
  /** Exact locator, preserved verbatim from the governed evidence. */
  locator: string;
  humanLocator: string | null;
  citationId: string | null;
  /** Occurrence ledger entry id, when the candidate came from a count. */
  ledgerEntryId: string | null;
  /** Calculation record id, when the candidate came from a governed calculation. */
  calculationId: string | null;
  /** Adjustment record id, when the candidate came from an engineering adjustment. */
  adjustmentId: string | null;
};

export type EngineeringQuantityCandidate = {
  candidateId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  origin: CandidateQuantityOrigin;
  basis: CandidateBasis;
  value: number | null;
  unitLiteral: string | null;
  unitDimension: string | null;
  /** Verbatim value as the source stated it, when there is one. Null for counted/calculated. */
  valueLiteral: string | null;
  sourceReferences: CandidateSourceReference[];
  /** 2A-10 subject cluster this candidate belongs to, when it has one. */
  subjectClusterId: string | null;
  /** Families that contributed, so derivation collapse is visible on the candidate. */
  contributingDerivationFamilyRoots: string[];
  conflictState: CandidateConflictState;
  conflictReason: string | null;
  /** Ids of the other candidates this one conflicts with. */
  conflictingCandidateIds: string[];
  readiness: EngineeringReadinessState;
  readinessReasons: string[];
  evidenceCoverage: string;
  limitations: string[];
  createdAt: string;
};

export function buildCandidateId(input: {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  origin: CandidateQuantityOrigin;
  basis: CandidateBasis;
  primaryReference: string;
}): string {
  return engineeringId("eqc", "quantity-candidate", [input.companyId, input.takeoffScopeId, input.subjectMatchKey, input.origin, input.basis, input.primaryReference]);
}

// ---------------------------------------------------------------------------
// Candidate construction from accepted 2A-10 evidence
// ---------------------------------------------------------------------------

/**
 * Builds candidates from accepted 2A-10 quantity claims.
 *
 * The 2A-10 origin is carried through HONESTLY and is never upgraded:
 * `STATED` stays `STATED`, `DECLARED_MODEL` stays `DECLARED_MODEL`. Nothing here
 * can produce `APPROVED_ENGINEERING`, because approval is not derivable from
 * evidence.
 *
 * A claim whose numeric view is absent produces a candidate with a null value
 * and a recorded reason. That is deliberate: 2A-10 refuses to invent a number
 * for a literal it only saw as text, and 2A-11 must not undo that refusal by
 * filling the gap.
 */
export function buildCandidatesFromClaims(input: {
  companyId: string;
  takeoffScopeId: string;
  claims: readonly HandoffQuantityClaimLike[];
  clusterByClaimId: ReadonlyMap<string, string>;
  createdAt: string;
}): EngineeringQuantityCandidate[] {
  return input.claims.map((claim) => {
    const origin: CandidateQuantityOrigin = claim.quantityOrigin === "DECLARED_MODEL" ? "DECLARED_MODEL" : "STATED";
    const hasValue = claim.sourceNumericView !== null;
    const readinessReasons: string[] = [];
    if (!hasValue) {
      readinessReasons.push(
        "the source stated a quantity as text and VOKA holds no numeric view for it, so no engineering value can be read from this evidence until a human states the number",
      );
    }
    if (claim.coverage === "PARTIAL") {
      readinessReasons.push("the evidence from this source was truncated, so this candidate cannot be treated as a complete reading");
    }

    return {
      candidateId: buildCandidateId({
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        subjectMatchKey: claim.subjectMatchKey,
        origin,
        basis: "SOURCE_CLAIM",
        primaryReference: claim.claimId,
      }),
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: claim.subjectMatchKey,
      subjectKeyNamespace: claim.subjectKeyNamespace,
      subjectLabel: claim.subjectLabel,
      requirementKind: "MATERIAL",
      origin,
      basis: "SOURCE_CLAIM",
      value: claim.sourceNumericView,
      unitLiteral: claim.unit,
      unitDimension: claim.unitDimension,
      valueLiteral: claim.valueLiteral,
      sourceReferences: [
        {
          basis: "SOURCE_CLAIM",
          claimId: claim.claimId,
          sourceArtifactId: claim.sourceArtifactId,
          derivationFamilyRootArtifactId: claim.derivationFamilyRootArtifactId,
          locator: claim.locator,
          humanLocator: claim.humanLocator,
          citationId: claim.citationId,
          ledgerEntryId: null,
          calculationId: null,
          adjustmentId: null,
        },
      ],
      subjectClusterId: input.clusterByClaimId.get(claim.claimId) ?? null,
      contributingDerivationFamilyRoots: [claim.derivationFamilyRootArtifactId],
      conflictState: "UNDISPUTED",
      conflictReason: null,
      conflictingCandidateIds: [],
      readiness: hasValue ? "READY_FOR_DECISION" : "NOT_READY",
      readinessReasons,
      evidenceCoverage: claim.coverage,
      limitations: [...claim.limitations],
      createdAt: input.createdAt,
    };
  });
}

/**
 * Builds a candidate from a COUNTED occurrence total.
 *
 * The candidate cites the ledger and the counting rule version rather than a
 * bare number, which is what makes the count auditable.
 */
export function buildCandidateFromCount(input: {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  countedValue: number;
  unitLiteral: string;
  unitDimension: string;
  ledgerEntryIds: readonly string[];
  countingRuleId: string;
  countingRuleVersion: string;
  contributingDerivationFamilyRoots: readonly string[];
  conflictState: CandidateConflictState;
  createdAt: string;
}): EngineeringQuantityCandidate {
  return {
    candidateId: buildCandidateId({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: input.subjectMatchKey,
      origin: "COUNTED",
      basis: "OCCURRENCE_COUNT",
      primaryReference: `${input.countingRuleId}:${input.countingRuleVersion}`,
    }),
    companyId: input.companyId,
    takeoffScopeId: input.takeoffScopeId,
    subjectMatchKey: input.subjectMatchKey,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectLabel: input.subjectLabel,
    requirementKind: "EQUIPMENT",
    origin: "COUNTED",
    basis: "OCCURRENCE_COUNT",
    value: input.countedValue,
    unitLiteral: input.unitLiteral,
    unitDimension: input.unitDimension,
    valueLiteral: null,
    sourceReferences: input.ledgerEntryIds.map((ledgerEntryId) => ({
      basis: "OCCURRENCE_COUNT" as CandidateBasis,
      claimId: null,
      sourceArtifactId: "",
      derivationFamilyRootArtifactId: "",
      locator: "",
      humanLocator: null,
      citationId: null,
      ledgerEntryId,
      calculationId: null,
      adjustmentId: null,
    })),
    subjectClusterId: null,
    contributingDerivationFamilyRoots: [...input.contributingDerivationFamilyRoots],
    conflictState: input.conflictState,
    conflictReason: null,
    conflictingCandidateIds: [],
    readiness: "READY_FOR_DECISION",
    readinessReasons: [`the count is reproducible from occurrence ledger rule ${input.countingRuleVersion}`],
    evidenceCoverage: "COMPLETE",
    limitations: [],
    createdAt: input.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Compares two candidate values for a conflict.
 *
 * A conflict requires BOTH a numeric disagreement AND a comparable unit. Two
 * different units are NOT a conflict to be resolved by picking one: they are an
 * incompatible-unit block, because VOKA cannot know that 24 metres and 24
 * kilograms are the same subject's quantity.
 */
export function detectValueConflict(left: EngineeringQuantityCandidate, right: EngineeringQuantityCandidate): { conflict: boolean; state: CandidateConflictState; reason: string | null } {
  if (left.value === null || right.value === null) {
    return { conflict: false, state: "UNDISPUTED", reason: null };
  }
  const leftUnit = left.unitDimension;
  const rightUnit = right.unitDimension;
  if (leftUnit !== null && rightUnit !== null && leftUnit !== rightUnit) {
    return {
      conflict: true,
      state: "BLOCKED_INCOMPATIBLE_UNITS",
      reason: `the sources state the same subject in incompatible dimensions (${leftUnit} and ${rightUnit}), so the disagreement cannot be resolved by choosing a value`,
    };
  }
  if (left.value !== right.value) {
    return {
      conflict: true,
      state: "CONFLICTING",
      reason: `two governed sources state different quantities for the same subject (${left.value} and ${right.value}); VOKA does not choose between them`,
    };
  }
  return { conflict: false, state: "UNDISPUTED", reason: null };
}

export type ConflictingCandidateGroup = {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  candidateIds: string[];
  /** Every distinct value the sources stated. Never a single "resolved" value. */
  disputedValues: Array<{ candidateId: string; value: number | null; unitLiteral: string | null; origin: CandidateQuantityOrigin }>;
  conflictState: CandidateConflictState;
  conflictReason: string | null;
  /**
   * True when a human must decide. Always true for a conflicting group: there is
   * deliberately no path from this structure to an automatic winner.
   */
  requiresExplicitDecision: true;
  limitations: string[];
};

/**
 * Groups candidates by subject and marks the groups where sources disagree.
 *
 * Critically, a group is returned for EVERY subject with two or more candidates,
 * and the group lists all of them. There is no selection, no ordering that
 * implies preference, and no aggregate value.
 */
export function buildConflictingCandidateGroups(candidates: readonly EngineeringQuantityCandidate[]): ConflictingCandidateGroup[] {
  const bySubject = new Map<string, EngineeringQuantityCandidate[]>();
  for (const candidate of candidates) {
    const key = [candidate.subjectKeyNamespace, candidate.subjectMatchKey].join("\u0000");
    const list = bySubject.get(key) ?? [];
    list.push(candidate);
    bySubject.set(key, list);
  }

  const groups: ConflictingCandidateGroup[] = [];
  for (const list of bySubject.values()) {
    if (list.length < 2) continue;
    // Distinct derivation families only: a collapsed duplicate is not a second opinion.
    const distinctFamilies = new Set(list.map((candidate) => candidate.contributingDerivationFamilyRoots.join(",")));
    if (distinctFamilies.size < 2) continue;

    let state: CandidateConflictState = "UNDISPUTED";
    let reason: string | null = null;
    const limitedStates: CandidateConflictState[] = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const outcome = detectValueConflict(list[i]!, list[j]!);
        if (outcome.conflict && outcome.state !== "UNDISPUTED") limitedStates.push(outcome.state);
        if (outcome.conflict && !reason) reason = outcome.reason;
      }
    }
    if (limitedStates.includes("BLOCKED_INCOMPATIBLE_UNITS")) state = "BLOCKED_INCOMPATIBLE_UNITS";
    else if (limitedStates.includes("CONFLICTING")) state = "CONFLICTING";

    if (state === "UNDISPUTED") continue;

    const anchor = list[0]!;
    groups.push({
      companyId: anchor.companyId,
      takeoffScopeId: anchor.takeoffScopeId,
      subjectMatchKey: anchor.subjectMatchKey,
      subjectKeyNamespace: anchor.subjectKeyNamespace,
      subjectLabel: anchor.subjectLabel,
      candidateIds: list.map((candidate) => candidate.candidateId).sort(),
      disputedValues: list.map((candidate) => ({ candidateId: candidate.candidateId, value: candidate.value, unitLiteral: candidate.unitLiteral, origin: candidate.origin })),
      conflictState: state,
      conflictReason: reason,
      requiresExplicitDecision: true,
      limitations: ["VOKA does not average, rank, or prefer one source over another; an explicit engineering decision resolves this conflict"],
    });
  }
  return groups.sort((left, right) => (left.subjectMatchKey < right.subjectMatchKey ? -1 : left.subjectMatchKey > right.subjectMatchKey ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Decidability
// ---------------------------------------------------------------------------

/**
 * Whether a candidate may be taken to an engineering decision.
 *
 * This is the structural gate that stops a conflicted or valueless candidate
 * from being approved. It returns a REASON, so a UI can explain the block.
 */
export function assertCandidateDecidable(candidate: EngineeringQuantityCandidate): { decidable: boolean; problem: string | null } {
  if ((candidate.origin as string) === "APPROVED_ENGINEERING") {
    return { decidable: false, problem: "an approved engineering quantity is not a candidate and cannot be decided again through the candidate path" };
  }
  if (candidate.value === null) {
    return { decidable: false, problem: "this candidate carries no numeric value, so there is nothing for a decision to adopt" };
  }
  if (candidate.conflictState === "CONFLICTING") {
    return { decidable: false, problem: "this candidate conflicts with another governed source and must be resolved by an explicit engineering decision, not approved directly" };
  }
  if (candidate.conflictState === "BLOCKED_INCOMPATIBLE_UNITS") {
    return { decidable: false, problem: "the sources state this subject in incompatible units, so no single quantity can be decided until the units are reconciled" };
  }
  if (candidate.conflictState === "AMBIGUOUS_SUBJECT") {
    return { decidable: false, problem: "the subject this candidate belongs to is ambiguous, so a decision could be applied to the wrong item" };
  }
  if (candidate.readiness === "BLOCKED" || candidate.readiness === "NOT_READY") {
    return { decidable: false, problem: "this candidate is not ready for a decision" };
  }
  if (!candidate.unitLiteral) {
    return { decidable: false, problem: "a quantity decision requires a stated unit, and this candidate has none" };
  }
  return { decidable: true, problem: null };
}
