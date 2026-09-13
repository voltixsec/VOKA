/**
 * Phase 2A-11: GOVERNED ENGINEERING CALCULATIONS.
 *
 * A calculation is allowed ONLY from explicit governed inputs. This module makes
 * that constraint structural rather than advisory:
 *
 * - every input is a named reference to a governed thing (a claim, a decision, an
 *   adjustment, or a previously computed result) with its own value and unit. An
 *   input VOKA simply "knows" cannot be expressed;
 * - when any input is unresolved, the result is NOT computed and the record is
 *   BLOCKED. The module never substitutes a default, never guesses a missing
 *   dimension, and never carries a partial result forward;
 * - there is NO LLM arithmetic anywhere. A rule is a closed, enumerated,
 *   versioned formula, and a rule that is not in the registry is refused;
 * - geometry is never derived from pixels. A measurement input must come from
 *   governed evidence or a governed decision, so a pixel-density guess has no
 *   way to enter.
 *
 * Because a rule is enumerated rather than supplied as code, the same inputs and
 * the same rule version always produce the same result, which is what makes the
 * output reproducible across runs and machines.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { ENGINEERING_CALCULATION_VERSION, engineeringId } from "./EngineeringQuantityTaxonomy";
import { checkDimensionCompatibility, resolveEngineeringUnit, type EngineeringDimension, type ResolvedEngineeringUnit } from "./EngineeringUnitConversion";

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

/**
 * The closed set of engineering formulas this phase ships.
 *
 * Deliberately small. Each entry is listed with the exact arithmetic it performs
 * so a reviewer can audit the rule without reading an implementation, and adding
 * a formula is a visible, reviewable act rather than a code path a caller can
 * reach with arbitrary expressions.
 */
export const ENGINEERING_FORMULA_RULES = [
  {
    ruleId: "rectangular_area",
    ruleVersion: `${ENGINEERING_CALCULATION_VERSION}/rectangular_area`,
    description: "area of a rectangle from two explicit governed length inputs",
    inputCount: 2,
    outputDimension: "AREA" as EngineeringDimension,
    applies: "multiply the two lengths, then express the result in square metres",
  },
  {
    ruleId: "linear_quantity_with_spacing",
    ruleVersion: `${ENGINEERING_CALCULATION_VERSION}/linear_quantity_with_spacing`,
    description: "count of evenly spaced items along an explicit governed length",
    inputCount: 2,
    outputDimension: "COUNT" as EngineeringDimension,
    applies: "divide the length by the spacing and round DOWN, because a partial spacing does not place another item",
  },
  {
    ruleId: "volume_from_area_and_thickness",
    ruleVersion: `${ENGINEERING_CALCULATION_VERSION}/volume_from_area_and_thickness`,
    description: "volume from an explicit governed area and an explicit governed thickness",
    inputCount: 2,
    outputDimension: "VOLUME" as EngineeringDimension,
    applies: "multiply the area by the thickness expressed in metres",
  },
  {
    ruleId: "proportional_coverage",
    ruleVersion: `${ENGINEERING_CALCULATION_VERSION}/proportional_coverage`,
    description: "quantity covering a governed area at an explicit governed coverage rate",
    inputCount: 2,
    outputDimension: "COUNT" as EngineeringDimension,
    applies: "multiply the area by the coverage rate and round UP, because coverage must not be under-provided",
  },
] as const;

export type EngineeringFormulaRule = (typeof ENGINEERING_FORMULA_RULES)[number];

export function findFormulaRule(ruleId: string, ruleVersion: string): EngineeringFormulaRule | null {
  return ENGINEERING_FORMULA_RULES.find((rule) => rule.ruleId === ruleId && rule.ruleVersion === ruleVersion) ?? null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Where a calculation input came from. Every input names a governed origin. */
export const CALCULATION_INPUT_SOURCES = ["EVIDENCE_CLAIM", "QUANTITY_DECISION", "ADJUSTMENT", "CALCULATION_RESULT"] as const;
export type CalculationInputSource = (typeof CALCULATION_INPUT_SOURCES)[number];

/**
 * One explicit input.
 *
 * `resolved` is carried explicitly: an input that points at a governed thing
 * whose value is unknown is RESOLVED AS UNRESOLVED, which BLOCKS the
 * calculation. That is different from omitting the input, which is an error.
 */
export type EngineeringCalculationInput = {
  inputName: string;
  source: CalculationInputSource;
  /** Exact governed record id the input reads from. */
  sourceReferenceId: string;
  value: number | null;
  unitLiteral: string | null;
  resolved: boolean;
  /** Why the input is unresolved, when it is. */
  unresolvedReason: string | null;
};

export type EngineeringCalculationRecord = {
  calculationId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  ruleId: string;
  ruleVersion: string;
  /** Exact inputs, verbatim, so the arithmetic can be re-derived by hand. */
  inputs: EngineeringCalculationInput[];
  /** Result, present only when every input resolved. */
  resultValue: number | null;
  resultUnitLiteral: string | null;
  resultDimension: EngineeringDimension | null;
  /** True when the inputs did not all resolve. */
  blocked: boolean;
  blockedReasons: string[];
  /** Deterministic fingerprint of inputs+rule, so an identical re-run is detectable. */
  inputDigest: string;
  actorUserId: string;
  computedAt: string;
  calculationContractVersion: string;
};

export function buildCalculationId(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string; ruleId: string; inputDigest: string }): string {
  return engineeringId("ecc", "calculation", [input.companyId, input.takeoffScopeId, input.subjectMatchKey, input.ruleId, input.inputDigest]);
}

/**
 * Deterministic digest of a calculation request.
 *
 * It covers the rule AND every input's identity, value, and unit, so the same
 * logical calculation always yields the same id and a changed input always
 * yields a different one. History therefore grows by addition, never by rewrite.
 */
export function calculationInputDigest(input: { ruleId: string; ruleVersion: string; inputs: readonly EngineeringCalculationInput[] }): string {
  const parts = [
    "voka:2a-11:calculation-digest:v1",
    input.ruleId,
    input.ruleVersion,
    ...[...input.inputs]
      .sort((left, right) => (left.inputName < right.inputName ? -1 : left.inputName > right.inputName ? 1 : 0))
      .map((item) => [item.inputName, item.source, item.sourceReferenceId, item.value === null ? "null" : String(item.value), item.unitLiteral ?? ""].join("")),
  ];
  return engineeringId("ecd", "digest", [parts.join("")]).replace("ecd_", "");
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type CalculationOutcome = {
  ok: boolean;
  calculation: EngineeringCalculationRecord | null;
  problem: string | null;
};

/**
 * Evaluates a governed calculation.
 *
 * Order of refusal matters: the rule must exist, the input arity must match, and
 * every input must be resolved — all BEFORE any arithmetic. A calculation that
 * cannot be performed returns a record with `blocked: true` and a reason, never a
 * number, so an unresolved quantity is visibly blocked instead of quietly wrong.
 */
export function evaluateCalculation(input: {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  ruleId: string;
  ruleVersion: string;
  inputs: readonly EngineeringCalculationInput[];
  resultUnitLiteral: string;
  actorUserId: string;
  computedAt: string;
}): CalculationOutcome {
  const rule = findFormulaRule(input.ruleId, input.ruleVersion);
  if (!rule) {
    return { ok: false, calculation: null, problem: `the calculation rule ${input.ruleId} at version ${input.ruleVersion} is not a governed engineering formula` };
  }
  if (input.inputs.length !== rule.inputCount) {
    return { ok: false, calculation: null, problem: `the rule ${rule.ruleId} requires exactly ${rule.inputCount} explicit inputs and received ${input.inputs.length}` };
  }

  const digest = calculationInputDigest({ ruleId: rule.ruleId, ruleVersion: rule.ruleVersion, inputs: input.inputs });
  const base = {
    calculationId: buildCalculationId({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, subjectMatchKey: input.subjectMatchKey, ruleId: rule.ruleId, inputDigest: digest }),
    companyId: input.companyId,
    takeoffScopeId: input.takeoffScopeId,
    subjectMatchKey: input.subjectMatchKey,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectLabel: input.subjectLabel,
    requirementKind: input.requirementKind,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    inputs: [...input.inputs],
    inputDigest: digest,
    actorUserId: input.actorUserId,
    computedAt: input.computedAt,
    calculationContractVersion: ENGINEERING_CALCULATION_VERSION,
  };

  const unresolvedReasons = input.inputs.filter((item) => !item.resolved || item.value === null).map((item) => `${item.inputName}: ${item.unresolvedReason ?? "the input has no resolved governed value"}`);
  if (unresolvedReasons.length > 0) {
    return {
      ok: true,
      calculation: {
        ...base,
        resultValue: null,
        resultUnitLiteral: null,
        resultDimension: null,
        blocked: true,
        blockedReasons: unresolvedReasons,
      },
      problem: null,
    };
  }

  const resultUnit = resolveEngineeringUnit(input.resultUnitLiteral);
  if (!resultUnit.resolved) {
    return { ok: false, calculation: null, problem: `the result unit "${input.resultUnitLiteral}" is not a recognized engineering unit` };
  }

  // Dimension discipline: every input must be dimensionally compatible with what
  // the rule needs, and the result must land in the dimension the rule declares.
  const dimensional = checkRuleDimensions(rule, input.inputs, resultUnit);
  if (!dimensional.ok) {
    return {
      ok: true,
      calculation: {
        ...base,
        resultValue: null,
        resultUnitLiteral: null,
        resultDimension: null,
        blocked: true,
        blockedReasons: [dimensional.problem ?? "the inputs are not dimensionally compatible with this calculation rule"],
      },
      problem: null,
    };
  }

  const values = input.inputs.map((item) => item.value as number);
  const resultValue = applyRule(rule.ruleId, values);
  if (resultValue === null || !Number.isFinite(resultValue)) {
    return {
      ok: true,
      calculation: { ...base, resultValue: null, resultUnitLiteral: null, resultDimension: null, blocked: true, blockedReasons: [`the rule ${rule.ruleId} could not produce a finite result from the supplied inputs`] },
      problem: null,
    };
  }

  return {
    ok: true,
    calculation: {
      ...base,
      resultValue,
      resultUnitLiteral: resultUnit.canonicalUnit,
      resultDimension: resultUnit.dimension,
      blocked: false,
      blockedReasons: [],
    },
    problem: null,
  };
}

const EXPECTED_INPUT_DIMENSIONS: Record<string, readonly EngineeringDimension[]> = {
  rectangular_area: ["LENGTH", "LENGTH"],
  linear_quantity_with_spacing: ["LENGTH", "LENGTH"],
  volume_from_area_and_thickness: ["AREA", "LENGTH"],
  proportional_coverage: ["AREA", "COUNT"],
};

function checkRuleDimensions(rule: EngineeringFormulaRule, inputs: readonly EngineeringCalculationInput[], resultUnit: ResolvedEngineeringUnit): { ok: boolean; problem: string | null } {
  const expected = EXPECTED_INPUT_DIMENSIONS[rule.ruleId];
  if (!expected) return { ok: false, problem: `the rule ${rule.ruleId} declares no governed input dimensions` };
  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index]!;
    const unit = resolveEngineeringUnit(item.unitLiteral ?? "");
    if (!unit.resolved) return { ok: false, problem: `the ${item.inputName} input unit "${item.unitLiteral ?? ""}" could not be resolved to a known engineering dimension` };
    const wanted = expected[index];
    if (wanted && unit.dimension !== wanted) {
      return { ok: false, problem: `the ${item.inputName} input is in ${unit.dimension} but this rule requires ${wanted}` };
    }
  }
  if (resultUnit.dimension !== rule.outputDimension) {
    return { ok: false, problem: `this rule produces ${rule.outputDimension} and the requested result unit is ${resultUnit.dimension}` };
  }
  return { ok: true, problem: null };
}

/**
 * The arithmetic, by rule id.
 *
 * Rounding is part of the rule's published meaning rather than an incidental
 * detail: a spacing count rounds DOWN because a partial spacing places nothing,
 * and a coverage count rounds UP because under-providing coverage is a
 * construction defect. Both choices are stated in the registry above.
 */
function applyRule(ruleId: string, values: readonly number[]): number | null {
  switch (ruleId) {
    case "rectangular_area": {
      const [length, width] = values;
      if (length === undefined || width === undefined) return null;
      return length * width;
    }
    case "linear_quantity_with_spacing": {
      const [length, spacing] = values;
      if (length === undefined || spacing === undefined) return null;
      if (spacing <= 0) return null;
      return Math.floor(length / spacing);
    }
    case "volume_from_area_and_thickness": {
      const [area, thickness] = values;
      if (area === undefined || thickness === undefined) return null;
      return area * thickness;
    }
    case "proportional_coverage": {
      const [area, rate] = values;
      if (area === undefined || rate === undefined) return null;
      if (rate <= 0) return null;
      return Math.ceil(area * rate);
    }
    default:
      return null;
  }
}

/** True when two quantities in the same dimension may be combined. Re-exported for callers. */
export function calculationInputsCompatible(left: ResolvedEngineeringUnit, right: ResolvedEngineeringUnit): boolean {
  return checkDimensionCompatibility(left, right).compatible;
}

/** The calculation contract version this module implements. */
export const CALCULATION_CONTRACT_VERSION = ENGINEERING_CALCULATION_VERSION;
