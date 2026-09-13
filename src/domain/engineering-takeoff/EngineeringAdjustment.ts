/**
 * Phase 2A-11: ENGINEERING ADJUSTMENTS.
 *
 * An adjustment is engineering, not commercial. Wastage, spare allowance, cutting
 * loss, contingency, overlap, lapping, and coverage allowance all change how much
 * material an installation genuinely needs, and they belong to engineering truth.
 * Supplier pack size, minimum order quantity, purchase rounding, and lead-time
 * buffering do NOT belong here, and this module has no vocabulary for them.
 *
 * The one rule that shapes the whole model:
 *
 *   an adjustment NEVER mutates the base quantity.
 *
 * The base decision remains exactly what it was, and the adjusted quantity is a
 * SEPARATE record that points at the base. That is what makes it possible to see
 * both the clean engineering quantity and the adjusted one, and to change the
 * adjustment without rewriting history.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { ENGINEERING_ADJUSTMENT_VERSION, engineeringId, type EngineeringReadinessState } from "./EngineeringQuantityTaxonomy";
import { checkDimensionCompatibility, resolveEngineeringUnit, type EngineeringDimension, type ResolvedEngineeringUnit } from "./EngineeringUnitConversion";
import type { EngineeringQuantityDecision } from "./EngineeringQuantityDecision";

// ---------------------------------------------------------------------------
// Adjustment types
// ---------------------------------------------------------------------------

/**
 * The engineering adjustment families.
 *
 * Every entry changes a required engineering quantity. None of them is a
 * commercial or procurement concept: there is no pack rounding, no order
 * minimum, and no price buffer here, and adding one would be a phase violation.
 */
export const ENGINEERING_ADJUSTMENT_TYPES = [
  "WASTAGE",
  "SPARE_ALLOWANCE",
  "CUTTING_LOSS",
  "CONTINGENCY",
  "OVERLAP",
  "LAPPING",
  "COVERAGE_ALLOWANCE",
] as const;
export type EngineeringAdjustmentType = (typeof ENGINEERING_ADJUSTMENT_TYPES)[number];

const ENGINEERING_ADJUSTMENT_TYPE_SET = new Set<string>(ENGINEERING_ADJUSTMENT_TYPES);
export function isEngineeringAdjustmentType(value: string): value is EngineeringAdjustmentType {
  return ENGINEERING_ADJUSTMENT_TYPE_SET.has(value);
}

/** How an adjustment changes the base quantity. */
export const ADJUSTMENT_MODES = ["PERCENTAGE", "MULTIPLIER", "ABSOLUTE_ADDITION"] as const;
export type AdjustmentMode = (typeof ADJUSTMENT_MODES)[number];

// ---------------------------------------------------------------------------
// Adjustment record
// ---------------------------------------------------------------------------

/**
 * A governed engineering adjustment.
 *
 * `adjustedValue` is computed and STORED alongside its inputs, so the arithmetic
 * is auditable later without re-running it, and the base quantity is retained by
 * reference for the same reason.
 */
export type EngineeringAdjustment = {
  adjustmentId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  adjustmentType: EngineeringAdjustmentType;
  mode: AdjustmentMode;
  /** The factor (percentage as a ratio, multiplier, or absolute amount). */
  adjustmentFactor: number;
  /** Ratio applied, normalized for display: 0.1 for 10%. Null for absolute addition. */
  normalizedFactor: number | null;
  unitLiteral: string | null;
  dimension: EngineeringDimension | null;
  /** Base quantity read FROM THE DECISION. Never copied as an independent truth. */
  baseDecisionId: string;
  baseValue: number;
  adjustedValue: number | null;
  /** True when the adjustment could not be applied and the row is blocked. */
  blocked: boolean;
  blockedReasons: string[];
  rationale: string;
  ruleId: string;
  ruleVersion: string;
  actorUserId: string;
  /** True when the phase requires a reviewer to approve the adjustment before it may be used. */
  requiresApproval: boolean;
  approvedByUserId: string | null;
  approvedAt: string | null;
  readiness: EngineeringReadinessState;
  createdAt: string;
  adjustmentContractVersion: string;
};

export function buildAdjustmentId(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string; adjustmentType: EngineeringAdjustmentType; ruleVersion: string }): string {
  return engineeringId("ead", "adjustment", [input.companyId, input.takeoffScopeId, input.subjectMatchKey, input.adjustmentType, input.ruleVersion]);
}

/**
 * Adjustment families that change the required QUANTITY of a physical article.
 *
 * `CONTESTED` adjustments — those whose effect on the engineering quantity is
 * genuinely a matter of engineering judgement — require explicit approval.
 */
const ADJUSTMENT_REQUIRES_APPROVAL: Record<EngineeringAdjustmentType, boolean> = {
  WASTAGE: false,
  SPARE_ALLOWANCE: true,
  CUTTING_LOSS: false,
  CONTINGENCY: true,
  OVERLAP: false,
  LAPPING: false,
  COVERAGE_ALLOWANCE: true,
};

export function adjustmentRequiresApproval(adjustmentType: EngineeringAdjustmentType): boolean {
  return ADJUSTMENT_REQUIRES_APPROVAL[adjustmentType];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AdjustmentValidation = { valid: boolean; problem: string | null };

/**
 * Validates an adjustment request.
 *
 * Refuses: an unknown adjustment type, an unknown mode, a non-positive factor
 * for multiplicative modes, a missing rationale, and a base decision that is not
 * an APPROVED decision. An adjustment on a superseded decision is refused because
 * the base it would extend is no longer in force.
 */
export function validateAdjustmentRequest(input: {
  adjustmentType: string;
  mode: string;
  adjustmentFactor: number;
  rationale: string;
  baseDecision: EngineeringQuantityDecision;
}): AdjustmentValidation {
  if (!isEngineeringAdjustmentType(input.adjustmentType)) {
    return { valid: false, problem: `the adjustment type ${input.adjustmentType} is not a governed engineering adjustment` };
  }
  if (!(ADJUSTMENT_MODES as readonly string[]).includes(input.mode)) {
    return { valid: false, problem: `the adjustment mode ${input.mode} is not a recognized engineering adjustment mode` };
  }
  if (!Number.isFinite(input.adjustmentFactor)) return { valid: false, problem: "the adjustment factor must be a finite number" };
  if (input.mode !== "ABSOLUTE_ADDITION" && input.adjustmentFactor <= 0) {
    return { valid: false, problem: "a percentage or multiplier adjustment must use a positive factor" };
  }
  if (input.mode === "ABSOLUTE_ADDITION" && input.adjustmentFactor < 0) {
    return { valid: false, problem: "an absolute engineering adjustment may not be negative; an engineering quantity is never reduced below its approved base by an additive allowance" };
  }
  if (!input.rationale.trim()) return { valid: false, problem: "an engineering adjustment must record the rationale for the allowance" };
  if (input.baseDecision.state !== "APPROVED") {
    return { valid: false, problem: "an engineering adjustment may only extend an APPROVED engineering quantity decision, never a superseded or withdrawn one" };
  }
  return { valid: true, problem: null };
}

/**
 * Builds an adjustment.
 *
 * The base value is READ from the decision rather than accepted from the caller,
 * which is what prevents an adjustment from being built on a stale or invented
 * base quantity.
 */
export function buildAdjustment(input: {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  adjustmentType: EngineeringAdjustmentType;
  mode: AdjustmentMode;
  adjustmentFactor: number;
  rationale: string;
  baseDecision: EngineeringQuantityDecision;
  unitLiteral: string;
  actorUserId: string;
  createdAt: string;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
}): EngineeringAdjustment {
  const validation = validateAdjustmentRequest({
    adjustmentType: input.adjustmentType,
    mode: input.mode,
    adjustmentFactor: input.adjustmentFactor,
    rationale: input.rationale,
    baseDecision: input.baseDecision,
  });
  if (!validation.valid) throw new Error(validation.problem ?? "the engineering adjustment is invalid");

  const unit = resolveEngineeringUnit(input.unitLiteral);
  const requiresApproval = adjustmentRequiresApproval(input.adjustmentType);
  const ruleVersion = `${ENGINEERING_ADJUSTMENT_VERSION}/${input.adjustmentType.toLocaleLowerCase()}`;

  const blockedReasons: string[] = [];
  if (!unit.resolved) blockedReasons.push(`the adjustment unit "${input.unitLiteral}" is not a recognized engineering unit, so the allowance cannot be applied`);
  const compatibility = checkDimensionCompatibility(unit, resolveEngineeringUnit(input.baseDecision.approvedUnitLiteral));
  if (unit.resolved && !compatibility.compatible) {
    blockedReasons.push(compatibility.problem ?? "the adjustment unit is dimensionally incompatible with the base engineering quantity");
  }
  if (requiresApproval && !input.approvedByUserId) {
    blockedReasons.push(`a ${input.adjustmentType} adjustment changes the required engineering quantity and must be approved before it is used`);
  }

  const blocked = blockedReasons.length > 0;
  const adjustedValue = blocked ? null : applyAdjustment({ mode: input.mode, factor: input.adjustmentFactor, baseValue: input.baseDecision.approvedValue });

  return {
    adjustmentId: buildAdjustmentId({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, subjectMatchKey: input.subjectMatchKey, adjustmentType: input.adjustmentType, ruleVersion }),
    companyId: input.companyId,
    takeoffScopeId: input.takeoffScopeId,
    subjectMatchKey: input.subjectMatchKey,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectLabel: input.subjectLabel,
    requirementKind: input.requirementKind,
    adjustmentType: input.adjustmentType,
    mode: input.mode,
    adjustmentFactor: input.adjustmentFactor,
    normalizedFactor: input.mode === "PERCENTAGE" ? input.adjustmentFactor / 100 : input.mode === "MULTIPLIER" ? input.adjustmentFactor : null,
    unitLiteral: unit.resolved ? unit.canonicalUnit : input.unitLiteral,
    dimension: unit.resolved ? unit.dimension : null,
    baseDecisionId: input.baseDecision.decisionId,
    baseValue: input.baseDecision.approvedValue,
    adjustedValue,
    blocked,
    blockedReasons,
    rationale: input.rationale,
    ruleId: input.adjustmentType.toLocaleLowerCase(),
    ruleVersion,
    actorUserId: input.actorUserId,
    requiresApproval,
    approvedByUserId: input.approvedByUserId ?? null,
    approvedAt: input.approvedAt ?? null,
    readiness: blocked ? "BLOCKED" : requiresApproval ? "REVIEW_REQUIRED" : "READY_FOR_DECISION",
    createdAt: input.createdAt,
    adjustmentContractVersion: ENGINEERING_ADJUSTMENT_VERSION,
  };
}

/**
 * The adjustment arithmetic.
 *
 * A `PERCENTAGE` factor is expressed in percent (10 means a 10% allowance), which
 * is how engineering allowances are actually written, so the conversion happens
 * here once rather than being left to each caller to remember.
 */
export function applyAdjustment(input: { mode: AdjustmentMode; factor: number; baseValue: number }): number {
  switch (input.mode) {
    case "PERCENTAGE":
      return input.baseValue * (1 + input.factor / 100);
    case "MULTIPLIER":
      return input.baseValue * input.factor;
    case "ABSOLUTE_ADDITION":
      return input.baseValue + input.factor;
    default:
      return input.baseValue;
  }
}

/**
 * Proves that the base quantity was not mutated.
 *
 * It exists so a governance test can assert the separation directly: applying an
 * adjustment must leave the decision's approved value byte-identical.
 */
export function baseQuantityPreserved(input: { before: EngineeringQuantityDecision; after: EngineeringQuantityDecision }): boolean {
  return input.before.approvedValue === input.after.approvedValue && input.before.decisionId === input.after.decisionId && input.before.state === input.after.state;
}

/** Stacking order, so multiple allowances compose deterministically rather than by caller order. */
export function sortAdjustmentsForApplication(adjustments: readonly EngineeringAdjustment[]): EngineeringAdjustment[] {
  return [...adjustments].sort((left, right) => {
    const byType = left.adjustmentType < right.adjustmentType ? -1 : left.adjustmentType > right.adjustmentType ? 1 : 0;
    if (byType !== 0) return byType;
    return left.adjustmentId < right.adjustmentId ? -1 : 1;
  });
}

/**
 * Composes adjustments in a deterministic order.
 *
 * Absolute additions are applied last, because a fixed allowance is normally
 * specified against the clean quantity rather than against an already-inflated
 * one. Any blocked adjustment blocks the whole composition: a total that silently
 * omitted an allowance would understate the requirement.
 */
export function composeAdjustedQuantity(input: { baseValue: number; adjustments: readonly EngineeringAdjustment[] }): { value: number | null; blocked: boolean; reasons: string[] } {
  const ordered = sortAdjustmentsForApplication(input.adjustments);
  const blocked = ordered.filter((adjustment) => adjustment.blocked);
  if (blocked.length > 0) {
    return { value: null, blocked: true, reasons: blocked.flatMap((adjustment) => adjustment.blockedReasons.map((reason) => `${adjustment.adjustmentType}: ${reason}`)) };
  }
  const proportional = ordered.filter((adjustment) => adjustment.mode !== "ABSOLUTE_ADDITION");
  const absolute = ordered.filter((adjustment) => adjustment.mode === "ABSOLUTE_ADDITION");

  let value = input.baseValue;
  for (const adjustment of proportional) value = applyAdjustment({ mode: adjustment.mode, factor: adjustment.adjustmentFactor, baseValue: value });
  for (const adjustment of absolute) value = applyAdjustment({ mode: adjustment.mode, factor: adjustment.adjustmentFactor, baseValue: value });
  return { value, blocked: false, reasons: [] };
}

/** The adjustment contract version this module implements. */
export const ADJUSTMENT_CONTRACT_VERSION = ENGINEERING_ADJUSTMENT_VERSION;
