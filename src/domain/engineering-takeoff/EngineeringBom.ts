/**
 * Phase 2A-11: THE ENGINEERING BILL OF MATERIALS.
 *
 * The Engineering BOM is the durable engineering output of this phase: a
 * versioned snapshot of approved engineering quantities, organised into rows that
 * may be equipment, material, components, or SERVICE AND WORK.
 *
 * Two boundaries give this model its shape:
 *
 * 1. it is PRODUCT-AGNOSTIC. A row may name a generic engineering subject, a
 *    required specification, a manufacturer constraint, or a named tender model
 *    while no catalog product is selected at all. There is deliberately no
 *    `catalogItemId` and no `productSelectionId` on a row, so a BOM cannot become
 *    an accidental product commitment;
 * 2. it is NOT COMMERCIAL AND NOT PROCUREMENT. There is no price, no currency, no
 *    rate, no discount, no tax, no supplier, no packing, no minimum order
 *    quantity, no order quantity, and no lead time anywhere in this model. Those
 *    belong to later phases that own commercial and procurement truth.
 *
 * Versions are IMMUTABLE. A change produces a new version that references the one
 * it replaces; the old version keeps its rows exactly as they were, so an
 * approved BOM can always be re-read as it was approved.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { ENGINEERING_BOM_VERSION, engineeringId, requirementNatureForKind, readinessRank, type BomCompletenessState, type EngineeringReadinessState, type RequirementNature } from "./EngineeringQuantityTaxonomy";
import type { EngineeringQuantityDecision } from "./EngineeringQuantityDecision";
import type { EngineeringAdjustment } from "./EngineeringAdjustment";

// ---------------------------------------------------------------------------
// BOM version status
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a BOM version.
 *
 * `SUPERSEDED` is set on the OLD version when a newer one is created, and the old
 * version's rows are never touched.
 */
export const BOM_VERSION_STATES = ["DRAFT", "APPROVED", "SUPERSEDED", "WITHDRAWN"] as const;
export type BomVersionState = (typeof BOM_VERSION_STATES)[number];

// ---------------------------------------------------------------------------
// Row specification constraints
// ---------------------------------------------------------------------------

/**
 * A specification constraint carried on a BOM row.
 *
 * `MANUFACTURER` and `NAMED_TENDER_MODEL` exist because tender evidence often
 * names a maker and a model. Preserving that is a SPECIFICATION CONSTRAINT: it
 * does not create a catalog item, does not create a supplier, and does not
 * reserve stock. A manufacturer is not a supplier, and a named tender model is
 * not a product selection.
 */
export const ROW_CONSTRAINT_KINDS = [
  "REQUIRED_SPECIFICATION",
  "MANUFACTURER",
  "NAMED_TENDER_MODEL",
  "DIMENSION",
  "RATING_OR_PERFORMANCE",
  "MATERIAL_SPECIFICATION",
  "STANDARD_OR_CODE",
] as const;
export type RowConstraintKind = (typeof ROW_CONSTRAINT_KINDS)[number];

export type BomRowConstraint = {
  kind: RowConstraintKind;
  /** Verbatim constraint value from the governed evidence. Never normalized away. */
  value: string;
  /** 2A-10 claim the constraint came from, when it came from evidence. */
  sourceClaimId: string | null;
  locator: string | null;
  /**
   * Always true for manufacturer/model constraints: they describe what is
   * required, never what has been bought or reserved.
   */
  isSpecificationOnly: boolean;
};

// ---------------------------------------------------------------------------
// BOM row
// ---------------------------------------------------------------------------

/**
 * One row of an Engineering BOM version.
 *
 * A row is a snapshot: it records the approved quantity AS IT WAS at the moment
 * the version was created, together with the decision that produced it, so a
 * later correction to engineering truth cannot retroactively change an approved
 * BOM.
 */
export type EngineeringBomRow = {
  rowId: string;
  companyId: string;
  bomVersionId: string;
  /** Stable row key across versions, so the same requirement can be tracked. */
  rowKey: string;
  position: number;
  engineeringSubject: string;
  requirementKind: string;
  requirementNature: RequirementNature;
  /** Approved engineering quantity snapshot. */
  approvedQuantity: number;
  unitLiteral: string;
  unitDimension: string;
  /** The decision this row's quantity came from. */
  quantityDecisionId: string;
  decisionVersion: number;
  quantityOrigin: string;
  /** Adjustment lineage, when the approved quantity includes allowances. */
  adjustmentIds: string[];
  adjustmentsSummary: Array<{ adjustmentType: string; mode: string; factor: number; baseValue: number; adjustedValue: number | null }>;
  /** Specification constraints, including any manufacturer or tender model. */
  constraints: BomRowConstraint[];
  /** Governed location/system context, when the evidence supplied one. */
  systemContext: string | null;
  locationContext: string | null;
  /** Traceability back to the accepted evidence. */
  sourceClaimIds: string[];
  sourceArtifactIds: string[];
  derivationFamilyRootArtifactIds: string[];
  occurrenceLedgerEntryIds: string[];
  readiness: EngineeringReadinessState;
  readinessReasons: string[];
  limitations: string[];
  /** True when the row is settled enough to be relied on by a downstream phase. */
  isApprovedRow: boolean;
  createdAt: string;
};

export function buildBomRowId(input: { bomVersionId: string; rowKey: string }): string {
  return engineeringId("ebr", "bom-row", [input.bomVersionId, input.rowKey]);
}

export function buildBomVersionId(input: { companyId: string; takeoffScopeId: string; versionNumber: number }): string {
  return engineeringId("ebv", "bom-version", [input.companyId, input.takeoffScopeId, input.versionNumber]);
}

// ---------------------------------------------------------------------------
// BOM version
// ---------------------------------------------------------------------------

export type EngineeringBomVersion = {
  bomVersionId: string;
  companyId: string;
  takeoffScopeId: string;
  /** Engineering scope this version covers. */
  engineeringScope: string;
  versionNumber: number;
  /** Previous version this one replaces. Null for the first version. */
  previousVersionId: string | null;
  state: BomVersionState;
  completeness: BomCompletenessState;
  /** The approved quantity decisions this version snapshots. */
  sourceDecisionIds: string[];
  sourceAdjustmentIds: string[];
  /** Accepted 2A-10 evidence state the version was built from. */
  comparisonScopeId: string | null;
  comparisonRunId: string | null;
  evidenceInputDigest: string | null;
  actorUserId: string;
  reason: string;
  changeNote: string;
  createdAt: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rowCount: number;
  approvedRowCount: number;
  /** Healthy but not-yet-approved rows. */
  reviewRequiredRowCount: number;
  blockedRowCount: number;
  /**
   * Required governed subjects this version did NOT carry into a row.
   *
   * Zero for a version whose governed scope is fully carried. A non-zero value
   * is the signal that an approved subset is present and the BOM is not whole.
   */
  unresolvedRequiredSubjectCount: number;
  completenessReasons: string[];
  limitations: string[];
  bomContractVersion: string;
};

// ---------------------------------------------------------------------------
// Readiness for a decision
// ---------------------------------------------------------------------------

/**
 * Whether an approved decision is settled enough to appear in a BOM.
 *
 * A row may legitimately be carried while still REVIEW_REQUIRED — a BOM with an
 * approved subset is useful — but the row must SAY so, and a superseded decision
 * is never carried as current.
 */
/**
 * The BOM readiness of one decision.
 *
 * The decision lifecycle is `APPROVED | SUPERSEDED | WITHDRAWN`, so a decision
 * carried into a BOM is approved unless it has been retired — and retired
 * decisions are excluded by the service before they ever reach a row. The
 * remaining states are named here so a row's readiness is always explained.
 */
export function decisionBomReadiness(decision: EngineeringQuantityDecision): { readiness: EngineeringReadinessState; reasons: string[] } {
  if (decision.state === "SUPERSEDED") return { readiness: "NOT_READY", reasons: ["this decision has been superseded and is no longer the engineering quantity of record"] };
  if (decision.state === "WITHDRAWN") return { readiness: "NOT_READY", reasons: ["this decision was withdrawn and must not appear as a current engineering quantity"] };
  return { readiness: "APPROVED", reasons: [] };
}

// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

/**
 * Builds a BOM row from an approved decision.
 *
 * The row copies the approved value, so the version is a true snapshot. It also
 * records the adjustments that produced the figure, keeping the base quantity
 * visible rather than folded into a single unexplained number.
 */
export function buildBomRow(input: {
  bomVersionId: string;
  companyId: string;
  position: number;
  engineeringSubject: string;
  decision: EngineeringQuantityDecision;
  adjustments: readonly EngineeringAdjustment[];
  constraints: readonly BomRowConstraint[];
  systemContext: string | null;
  locationContext: string | null;
  approvedQuantity: number;
  unitLiteral: string;
  unitDimension: string;
  sourceArtifactIds: readonly string[];
  derivationFamilyRootArtifactIds: readonly string[];
  occurrenceLedgerEntryIds: readonly string[];
  readiness: EngineeringReadinessState;
  readinessReasons: readonly string[];
  limitations: readonly string[];
  createdAt: string;
}): EngineeringBomRow {
  const rowKey = [input.decision.subjectKeyNamespace, input.decision.subjectMatchKey, input.decision.requirementKind].join("\u0000");
  return {
    rowId: buildBomRowId({ bomVersionId: input.bomVersionId, rowKey }),
    companyId: input.companyId,
    bomVersionId: input.bomVersionId,
    rowKey,
    position: input.position,
    engineeringSubject: input.engineeringSubject,
    requirementKind: input.decision.requirementKind,
    requirementNature: requirementNatureForKind(input.decision.requirementKind as never),
    approvedQuantity: input.approvedQuantity,
    unitLiteral: input.unitLiteral,
    unitDimension: input.unitDimension,
    quantityDecisionId: input.decision.decisionId,
    decisionVersion: input.decision.decisionVersion,
    quantityOrigin: input.decision.quantityOrigin,
    adjustmentIds: input.adjustments.map((adjustment) => adjustment.adjustmentId).sort(),
    adjustmentsSummary: input.adjustments.map((adjustment) => ({
      adjustmentType: adjustment.adjustmentType,
      mode: adjustment.mode,
      factor: adjustment.adjustmentFactor,
      baseValue: adjustment.baseValue,
      adjustedValue: adjustment.adjustedValue,
    })),
    constraints: [...input.constraints],
    systemContext: input.systemContext,
    locationContext: input.locationContext,
    sourceClaimIds: [...input.decision.sourceClaimIds],
    sourceArtifactIds: [...new Set(input.sourceArtifactIds)].sort(),
    derivationFamilyRootArtifactIds: [...new Set(input.derivationFamilyRootArtifactIds)].sort(),
    occurrenceLedgerEntryIds: [...new Set(input.occurrenceLedgerEntryIds)].sort(),
    readiness: input.readiness,
    readinessReasons: [...input.readinessReasons],
    limitations: [...input.limitations],
    isApprovedRow: input.readiness === "APPROVED",
    createdAt: input.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * Computes BOM completeness HONESTLY.
 *
 * The rules are exactly the ones the phase demands:
 *
 * - one approved row never promotes the whole BOM to APPROVED;
 * - a row that is blocked or not ready makes the BOM INCOMPLETE, not "review
 *   required", because something is genuinely missing rather than merely
 *   unconfirmed;
 * - an approved SUBSET is reported as PARTIALLY_APPROVED, which is a real and
 *   usable state rather than a failure;
 * - an empty BOM is INCOMPLETE. Vacuously "approved" is precisely the dishonest
 *   answer this function exists to prevent.
 */
export function computeBomCompleteness(rows: readonly EngineeringBomRow[]): { completeness: BomCompletenessState; reasons: string[]; approvedRowCount: number; reviewRequiredRowCount: number; blockedRowCount: number } {
  const approvedRowCount = rows.filter((row) => row.readiness === "APPROVED").length;
  const reviewRequiredRowCount = rows.filter((row) => row.readiness === "REVIEW_REQUIRED").length;
  const blockedRowCount = rows.filter((row) => row.readiness === "BLOCKED" || row.readiness === "NOT_READY").length;

  if (rows.length === 0) {
    return { completeness: "INCOMPLETE", reasons: ["this BOM version carries no rows, so it cannot be considered complete or approved"], approvedRowCount, reviewRequiredRowCount, blockedRowCount };
  }
  if (blockedRowCount > 0) {
    return {
      completeness: "INCOMPLETE",
      reasons: [`${blockedRowCount} row${blockedRowCount === 1 ? " is" : "s are"} blocked or not ready, so the BOM is incomplete rather than merely unapproved`],
      approvedRowCount,
      reviewRequiredRowCount,
      blockedRowCount,
    };
  }
  if (approvedRowCount === rows.length) {
    return { completeness: "APPROVED", reasons: [], approvedRowCount, reviewRequiredRowCount, blockedRowCount };
  }
  if (approvedRowCount > 0) {
    return {
      completeness: "PARTIALLY_APPROVED",
      reasons: ["an approved subset exists and is usable, but the remaining rows still need engineering decisions before the whole BOM is approved"],
      approvedRowCount,
      reviewRequiredRowCount,
      blockedRowCount,
    };
  }
  return { completeness: "REVIEW_REQUIRED", reasons: ["no row has been approved yet, so this BOM version is awaiting engineering decisions"], approvedRowCount, reviewRequiredRowCount, blockedRowCount };
}

// ---------------------------------------------------------------------------
// Version immutability
// ---------------------------------------------------------------------------

/**
 * Detects an attempt to change an APPROVED BOM version.
 *
 * An approved version is frozen: any change must be expressed as a NEW version
 * that points at it. The check covers the rows as well as the header, because a
 * changed row inside a frozen version is exactly the mutation an audit must catch.
 */
export function detectBomVersionMutation(input: {
  existing: EngineeringBomVersion;
  existingRows: readonly EngineeringBomRow[];
  incoming: EngineeringBomVersion;
  incomingRows: readonly EngineeringBomRow[];
}): { mutated: boolean; fields: string[] } {
  if (input.existing.bomVersionId !== input.incoming.bomVersionId) return { mutated: false, fields: [] };
  if (input.existing.state !== "APPROVED") return { mutated: false, fields: [] };

  const headerFields: Array<keyof EngineeringBomVersion> = ["versionNumber", "takeoffScopeId", "engineeringScope", "companyId", "completeness", "sourceDecisionIds", "rowCount"];
  const fields = headerFields.filter((field) => JSON.stringify(input.existing[field]) !== JSON.stringify(input.incoming[field])).map((field) => String(field));

  const normalizeRows = (rows: readonly EngineeringBomRow[]) => JSON.stringify([...rows].sort((left, right) => (left.rowId < right.rowId ? -1 : 1)).map((row) => [row.rowId, row.approvedQuantity, row.unitLiteral, row.quantityDecisionId, row.position]));
  if (normalizeRows(input.existingRows) !== normalizeRows(input.incomingRows)) fields.push("rows");

  return { mutated: fields.length > 0, fields };
}

/**
 * Applies a version replacement.
 *
 * The previous version is returned retired, with its rows untouched. It is a
 * NEW object rather than an in-place edit, so a caller holding the previous
 * reference still reads the previous truth.
 */
export function supersedeBomVersion(input: { previous: EngineeringBomVersion; replacement: EngineeringBomVersion }): EngineeringBomVersion {
  if (input.previous.companyId !== input.replacement.companyId) throw new Error("a BOM version may only supersede a BOM version inside the same company");
  if (input.previous.takeoffScopeId !== input.replacement.takeoffScopeId) throw new Error("a BOM version may only supersede a BOM version in the same takeoff scope");
  if (input.replacement.versionNumber <= input.previous.versionNumber) throw new Error("a superseding BOM version must carry a higher version number");
  return { ...input.previous, state: "SUPERSEDED" };
}

/** Next BOM version number for a scope. Derived from history so a number is never reused. */
export function nextBomVersionNumber(versions: readonly EngineeringBomVersion[], input: { takeoffScopeId: string }): number {
  return versions.filter((version) => version.takeoffScopeId === input.takeoffScopeId).reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

/** The weakest readiness among a set of rows. Used only for reporting, never as a score. */
export function weakestRowReadiness(rows: readonly EngineeringBomRow[]): EngineeringReadinessState {
  if (rows.length === 0) return "NOT_READY";
  return rows.reduce<EngineeringReadinessState>((weakest, row) => (readinessRank(row.readiness) < readinessRank(weakest) ? row.readiness : weakest), "APPROVED");
}

/** The BOM contract version this module implements. */
export const BOM_CONTRACT_VERSION = ENGINEERING_BOM_VERSION;

// ---------------------------------------------------------------------------
// Required-subject coverage
// ---------------------------------------------------------------------------

/**
 * How a BOM version resolved one REQUIRED engineering subject.
 *
 * This is the vocabulary that lets an approved SUBSET stay distinguishable from
 * a whole BOM. `CARRIED_BY_ROW` is the only value that means the subject
 * contributed an approved row; every other value names required governed work
 * the version did NOT resolve.
 */
export const BOM_SUBJECT_RESOLUTIONS = [
  "CARRIED_BY_ROW",
  "NO_DECISION",
  "DECISION_RETIRED",
  "CANDIDATE_WITHOUT_DECISION",
  "UNRESOLVED_CANDIDATE",
] as const;
export type BomSubjectResolution = (typeof BOM_SUBJECT_RESOLUTIONS)[number];

/**
 * One required subject and what the version did with it.
 *
 * `resolution` is emitted by the application layer from the governed scope; the
 * domain only consumes it, so this module stays pure.
 */
export type BomRequiredSubject = {
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  resolution: BomSubjectResolution;
  resolvedByDecisionId: string | null;
  bomRowId: string | null;
  reason: string | null;
};

/** A subject the version did not carry into a row. */
export function isUnresolvedSubject(subject: BomRequiredSubject): boolean {
  return subject.resolution !== "CARRIED_BY_ROW";
}

/**
 * Computes completeness against the GOVERNED REQUIRED SUBJECT SET, not merely
 * against the rows that happen to exist.
 *
 * This is the fix for a real gap: a scope may require ten subjects while only
 * one has an approved decision. Building rows from approved decisions alone
 * would yield a one-row version whose rows are all approved — and a
 * row-only completeness function would call that APPROVED, silently telling a
 * downstream phase that a one-tenth BOM is finished.
 *
 * The rule is therefore:
 *
 * - a version that omits ANY required subject is never APPROVED, however
 *   approved its rows are;
 * - omitted subjects that still need engineering work make the version
 *   REVIEW_REQUIRED (an approved subset exists) or INCOMPLETE (nothing is
 *   approved yet);
 * - `rowOnly` is retained for callers that legitimately have no governed
 *   required-subject set (a version built before the manifest existed), and it
 *   degrades to the original row-only semantics rather than inventing subjects.
 */
export function computeBomCompletenessWithCoverage(input: {
  rows: readonly EngineeringBomRow[];
  requiredSubjects: readonly BomRequiredSubject[];
}): { completeness: BomCompletenessState; reasons: string[]; approvedRowCount: number; reviewRequiredRowCount: number; blockedRowCount: number; unresolvedSubjectCount: number } {
  const base = computeBomCompleteness(input.rows);
  if (input.requiredSubjects.length === 0) {
    // No governed required-subject set: fall back to row-only semantics exactly
    // as before, so a version without a manifest is not silently re-judged.
    return { ...base, unresolvedSubjectCount: 0 };
  }
  const unresolved = input.requiredSubjects.filter(isUnresolvedSubject);
  if (unresolved.length === 0 && base.completeness === "APPROVED") {
    return { ...base, unresolvedSubjectCount: 0 };
  }
  if (unresolved.length === 0) {
    // Every required subject is carried; the row-level verdict stands as-is.
    return { ...base, unresolvedSubjectCount: 0 };
  }
  const unresolvedReason = `${unresolved.length} required engineering subject${unresolved.length === 1 ? " is" : "s are"} not carried by this version, so an approved subset is not a complete BOM`;
  const completeness: BomCompletenessState =
    base.approvedRowCount > 0 ? "REVIEW_REQUIRED" : "INCOMPLETE";
  return {
    completeness,
    reasons: [...base.reasons, unresolvedReason],
    approvedRowCount: base.approvedRowCount,
    reviewRequiredRowCount: base.reviewRequiredRowCount + unresolved.length,
    blockedRowCount: base.blockedRowCount,
    unresolvedSubjectCount: unresolved.length,
  };
}

/**
 * Whether an approved subset may be represented as a complete BOM. It may never
 * be: this predicate exists so a caller can assert the invariant directly.
 */
export function approvedSubsetIsComplete(input: { rows: readonly EngineeringBomRow[]; requiredSubjects: readonly BomRequiredSubject[] }): boolean {
  const unresolved = input.requiredSubjects.filter(isUnresolvedSubject).length;
  return unresolved === 0 && input.rows.length > 0 && input.rows.every((row) => row.readiness === "APPROVED");
}
