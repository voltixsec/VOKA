/**
 * Phase 2A-11: ENGINEERING UNITS OF MEASURE AND CONVERSION GOVERNANCE.
 *
 * Phase 2A-10 proved that two verbatim unit spellings mean the same thing. That
 * is a COMPARISON. This module is different in kind: it decides whether two
 * quantities may be added together at all, and it performs conversions only
 * through an explicit, versioned, reviewable rule.
 *
 * Hard rules enforced here:
 *
 * - never sum incompatible dimensions: adding metres to kilograms is refused,
 *   not coerced, and the refusal names both dimensions;
 * - no implicit conversions: a quantity keeps its original value and unit, and
 *   a converted value exists only as a separate, rule-attributed companion;
 * - no currency conversion anywhere in this phase — currency is not an
 *   engineering dimension and is deliberately absent from the dimension table;
 * - a unit VOKA cannot prove never silently equals another unit: it stays
 *   `UNRESOLVED` and blocks the operation that needed it.
 *
 * This module is a CATALOG-AGNOSTIC layer. It does not duplicate the tenant
 * `Unit` catalog model: that model is presentation/business master data, while
 * this is the dimension algebra engineering arithmetic needs. The two are
 * bridged by `resolveEngineeringUnit` at the edge, never merged.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { ENGINEERING_CONVERSION_VERSION, engineeringId } from "./EngineeringQuantityTaxonomy";

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/**
 * Engineering dimensions.
 *
 * `COUNT` covers discrete occurrences (each, set, lot). `OTHER` is an honest
 * "this is a real unit whose dimension VOKA does not model", which keeps such a
 * unit usable for display and traceable in lineage while refusing arithmetic on
 * it.
 */
export const ENGINEERING_DIMENSIONS = [
  "COUNT",
  "LENGTH",
  "AREA",
  "VOLUME",
  "MASS",
  "TIME",
  "POWER",
  "TEMPERATURE",
  "PRESSURE",
  "FLOW",
  "OTHER",
] as const;
export type EngineeringDimension = (typeof ENGINEERING_DIMENSIONS)[number];

const ENGINEERING_DIMENSION_SET = new Set<string>(ENGINEERING_DIMENSIONS);
export function isEngineeringDimension(value: string): value is EngineeringDimension {
  return ENGINEERING_DIMENSION_SET.has(value);
}

/**
 * Dimensions that are safe to ADD within themselves.
 *
 * `OTHER` is excluded: two quantities in unmodelled units are not provably
 * additive, so their sum is refused rather than assumed.
 */
const ADDITIVE_DIMENSIONS: readonly EngineeringDimension[] = [
  "COUNT",
  "LENGTH",
  "AREA",
  "VOLUME",
  "MASS",
  "TIME",
  "POWER",
];

export function isAdditiveDimension(dimension: EngineeringDimension): boolean {
  return ADDITIVE_DIMENSIONS.includes(dimension);
}

// ---------------------------------------------------------------------------
// Unit resolution
// ---------------------------------------------------------------------------

export type ResolvedEngineeringUnit = {
  /** Verbatim spelling as it appeared in the source or as supplied by a user. */
  originalLiteral: string;
  /** Case-folded comparison token. Never displayed instead of the literal. */
  normalizedToken: string;
  /** Canonical engineering unit code, when the spelling is recognized. */
  canonicalUnit: string | null;
  dimension: EngineeringDimension;
  /** False when the spelling is not in the closed table; arithmetic is then refused. */
  resolved: boolean;
  limitations: string[];
};

/**
 * Closed unit table.
 *
 * Deliberately small and unambiguous. It mirrors the accepted 2A-10 synonym
 * groups so the two phases agree on what a spelling means, but it is owned here
 * because engineering arithmetic needs a dimension decision rather than a
 * comparison decision. Aliases already accepted by 2A-10 are not re-invented.
 */
export const ENGINEERING_UNIT_TABLE: ReadonlyArray<{
  canonical: string;
  dimension: EngineeringDimension;
  aliases: readonly string[];
}> = [
  { canonical: "ea", dimension: "COUNT", aliases: ["ea", "each", "no", "nos", "pc", "pcs", "piece", "pieces", "unit", "units", "عدد", "حبة"] },
  { canonical: "set", dimension: "COUNT", aliases: ["set", "sets", "st", "مجموعة", "طقم"] },
  { canonical: "lot", dimension: "COUNT", aliases: ["lot", "lots", "ls", "l.s", "مقطوعية"] },
  { canonical: "m", dimension: "LENGTH", aliases: ["m", "meter", "meters", "metre", "metres", "lm", "r.m", "rm", "م", "متر"] },
  { canonical: "m2", dimension: "AREA", aliases: ["m2", "sqm", "sq.m", "square meter", "square meters", "م2", "متر مربع"] },
  { canonical: "m3", dimension: "VOLUME", aliases: ["m3", "cum", "cu.m", "cubic meter", "cubic meters", "م3", "متر مكعب"] },
  { canonical: "kg", dimension: "MASS", aliases: ["kg", "kgs", "kilogram", "kilograms", "كجم"] },
  { canonical: "ton", dimension: "MASS", aliases: ["ton", "tons", "tonne", "tonnes", "mt", "طن"] },
  { canonical: "l", dimension: "VOLUME", aliases: ["l", "lt", "ltr", "liter", "liters", "litre", "litres", "لتر"] },
  { canonical: "kW", dimension: "POWER", aliases: ["kw", "kilowatt", "kilowatts", "كيلوواط"] },
  { canonical: "hp", dimension: "POWER", aliases: ["hp", "horsepower", "حصان"] },
  { canonical: "hr", dimension: "TIME", aliases: ["hr", "hrs", "hour", "hours", "ساعة"] },
  { canonical: "day", dimension: "TIME", aliases: ["day", "days", "يوم", "أيام"] },
  { canonical: "bar", dimension: "PRESSURE", aliases: ["bar", "bars", "بار"] },
  { canonical: "c", dimension: "TEMPERATURE", aliases: ["c", "degc", "celsius", "°c"] },
  { canonical: "lps", dimension: "FLOW", aliases: ["lps", "l/s", "litre per second", "liter per second"] },
  { canonical: "cfm", dimension: "FLOW", aliases: ["cfm"] },
  { canonical: "gpm", dimension: "FLOW", aliases: ["gpm"] },
];

/** Case-folds, strips a trailing period, and collapses whitespace. Never transliterates. */
export function normalizeEngineeringUnitToken(raw: string): string {
  return raw
    .replace(/[\u0640]/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\.$/u, "")
    .replace(/\s+/gu, " ");
}

const ENGINEERING_UNIT_LOOKUP: ReadonlyMap<string, { canonical: string; dimension: EngineeringDimension }> = (() => {
  const lookup = new Map<string, { canonical: string; dimension: EngineeringDimension }>();
  for (const entry of ENGINEERING_UNIT_TABLE) {
    for (const alias of entry.aliases) {
      lookup.set(normalizeEngineeringUnitToken(alias), { canonical: entry.canonical, dimension: entry.dimension });
    }
  }
  return lookup;
})();

/**
 * Resolves a verbatim unit spelling.
 *
 * An unrecognized spelling is NOT an error and NOT a guess: it returns a
 * resolved unit with `resolved: false`, `canonicalUnit: null`, and an `OTHER`
 * dimension, plus a recorded limitation. The caller must then refuse arithmetic,
 * exactly as the spec requires.
 */
export function resolveEngineeringUnit(rawLiteral: string): ResolvedEngineeringUnit {
  const normalizedToken = normalizeEngineeringUnitToken(rawLiteral);
  const found = ENGINEERING_UNIT_LOOKUP.get(normalizedToken);
  if (found) {
    return {
      originalLiteral: rawLiteral,
      normalizedToken,
      canonicalUnit: found.canonical,
      dimension: found.dimension,
      resolved: true,
      limitations: [],
    };
  }
  return {
    originalLiteral: rawLiteral,
    normalizedToken,
    canonicalUnit: null,
    dimension: "OTHER",
    resolved: false,
    limitations: [
      `the unit "${rawLiteral}" is not in the closed engineering unit table, so no dimension could be proven and engineering arithmetic on it is refused`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Quantity carrier
// ---------------------------------------------------------------------------

/**
 * A quantity carried with its EXACT original unit alongside any converted view.
 *
 * The original value and unit are the record. A converted value is a separate,
 * attributed companion and never overwrites the original, which is what makes
 * "original value/unit" and "converted value/unit" both durable.
 */
export type EngineeringQuantity = {
  value: number;
  unit: ResolvedEngineeringUnit;
  /** Original unit spelling, verbatim. Duplicated from `unit` for snapshot clarity. */
  originalUnitLiteral: string;
  originalValue: number;
  convertedValue: number | null;
  convertedUnit: string | null;
  conversionRuleId: string | null;
  conversionRuleVersion: string | null;
};

export function buildEngineeringQuantity(input: {
  value: number;
  unitLiteral: string;
  convertedValue?: number | null;
  convertedUnit?: string | null;
  conversionRuleId?: string | null;
  conversionRuleVersion?: string | null;
}): EngineeringQuantity {
  const unit = resolveEngineeringUnit(input.unitLiteral);
  return {
    value: input.value,
    unit,
    originalUnitLiteral: input.unitLiteral,
    originalValue: input.value,
    convertedValue: input.convertedValue ?? null,
    convertedUnit: input.convertedUnit ?? null,
    conversionRuleId: input.conversionRuleId ?? null,
    conversionRuleVersion: input.conversionRuleVersion ?? null,
  };
}

// ---------------------------------------------------------------------------
// Compatibility and additivity
// ---------------------------------------------------------------------------

export type DimensionCompatibility = {
  compatible: boolean;
  dimension: EngineeringDimension;
  problem: string | null;
};

/**
 * Whether two quantities may be added.
 *
 * Both dimensions must be known, equal, and additive. The refusal message names
 * both dimensions so a reviewer sees WHY, rather than a generic failure.
 */
export function checkDimensionCompatibility(left: ResolvedEngineeringUnit, right: ResolvedEngineeringUnit): DimensionCompatibility {
  if (!left.resolved || !right.resolved) {
    const unresolved = !left.resolved ? left.originalLiteral : right.originalLiteral;
    return { compatible: false, dimension: "OTHER", problem: `the unit "${unresolved}" could not be resolved to a known engineering dimension, so the quantities cannot be combined` };
  }
  if (left.dimension !== right.dimension) {
    return {
      compatible: false,
      dimension: left.dimension,
      problem: `the dimensions ${left.dimension} and ${right.dimension} are incompatible and must never be summed`,
    };
  }
  if (!isAdditiveDimension(left.dimension)) {
    return {
      compatible: false,
      dimension: left.dimension,
      problem: `the dimension ${left.dimension} is not provably additive, so these quantities are not summed automatically`,
    };
  }
  return { compatible: true, dimension: left.dimension, problem: null };
}

export type EngineeringSum = {
  ok: boolean;
  total: number | null;
  unit: string | null;
  dimension: EngineeringDimension;
  /** Verbatim unit spellings that participated, for provenance. */
  contributingUnits: string[];
  problem: string | null;
};

/**
 * Sums quantities by converting each into an explicit target unit through a
 * governed rule, refusing the whole operation if any part is incompatible.
 *
 * Partial sums are never returned: a total that silently omits an unconvertible
 * term would be a wrong number presented as a right one.
 */
export function sumEngineeringQuantities(input: {
  quantities: readonly EngineeringQuantity[];
  targetUnit: string;
  convert: (input: { value: number; fromUnit: ResolvedEngineeringUnit; toUnit: ResolvedEngineeringUnit }) => ConversionResult;
}): EngineeringSum {
  if (input.quantities.length === 0) {
    return { ok: false, total: null, unit: null, dimension: "OTHER", contributingUnits: [], problem: "there are no quantities to total" };
  }
  const target = resolveEngineeringUnit(input.targetUnit);
  if (!target.resolved) {
    return { ok: false, total: null, unit: null, dimension: "OTHER", contributingUnits: [], problem: `the target unit "${input.targetUnit}" is not a recognized engineering unit` };
  }

  let total = 0;
  const contributingUnits: string[] = [];
  for (const quantity of input.quantities) {
    const compatibility = checkDimensionCompatibility(quantity.unit, target);
    if (!compatibility.compatible) {
      return { ok: false, total: null, unit: target.canonicalUnit, dimension: target.dimension, contributingUnits, problem: compatibility.problem };
    }
    if (quantity.unit.canonicalUnit === target.canonicalUnit) {
      total += quantity.value;
      contributingUnits.push(quantity.originalUnitLiteral);
      continue;
    }
    const converted = input.convert({ value: quantity.value, fromUnit: quantity.unit, toUnit: target });
    if (!converted.ok || converted.value === null) {
      return { ok: false, total: null, unit: target.canonicalUnit, dimension: target.dimension, contributingUnits, problem: converted.problem ?? "a conversion was required but no governed rule produced it" };
    }
    total += converted.value;
    contributingUnits.push(quantity.originalUnitLiteral);
  }
  return { ok: true, total, unit: target.canonicalUnit, dimension: target.dimension, contributingUnits, problem: null };
}

// ---------------------------------------------------------------------------
// Governed conversion rules
// ---------------------------------------------------------------------------

/**
 * An explicit conversion rule.
 *
 * `factor` multiplies the value in `fromUnit` to express it in `toUnit`. Both
 * units must already resolve, and both must share a dimension: a rule that
 * crosses dimensions is refused at construction so it can never be applied.
 */
export type EngineeringConversionRule = {
  ruleId: string;
  ruleVersion: string;
  /** Exact governed rule identity, so a conversion can cite the rule it used. */
  fromUnit: string;
  toUnit: string;
  dimension: EngineeringDimension;
  factor: number;
  rationale: string;
  actorUserId: string;
  createdAt: string;
};

export type ConversionResult = {
  ok: boolean;
  value: number | null;
  unit: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  problem: string | null;
};

/** Deterministic rule id, so the same rule is never registered twice under two ids. */
export function buildConversionRuleId(input: { companyId: string; fromUnit: string; toUnit: string; ruleVersion: string }): string {
  return engineeringId("ecr", "conversion-rule", [input.companyId, input.fromUnit, input.toUnit, input.ruleVersion]);
}

/**
 * Validates a candidate conversion rule.
 *
 * Refuses: unproven units, cross-dimension rules, non-additive dimensions, and
 * non-positive or non-finite factors. A factor of zero would silently delete a
 * quantity, so it is refused rather than accepted as a degenerate rule.
 */
export function validateConversionRule(input: {
  fromUnitLiteral: string;
  toUnitLiteral: string;
  factor: number;
  rationale: string;
}): { valid: boolean; problem: string | null; dimension: EngineeringDimension | null } {
  const from = resolveEngineeringUnit(input.fromUnitLiteral);
  const to = resolveEngineeringUnit(input.toUnitLiteral);
  if (!from.resolved || !to.resolved) {
    return { valid: false, problem: "a conversion rule may only be defined between units that both resolve to a known engineering unit", dimension: null };
  }
  if (from.dimension !== to.dimension) {
    return { valid: false, problem: `a conversion rule may not cross dimensions: ${from.dimension} to ${to.dimension}`, dimension: null };
  }
  if (!isAdditiveDimension(from.dimension)) {
    return { valid: false, problem: `the dimension ${from.dimension} is not additive, so no engineering conversion rule may be defined for it`, dimension: null };
  }
  if (!Number.isFinite(input.factor) || input.factor <= 0) {
    return { valid: false, problem: "a conversion rule factor must be a finite positive number", dimension: null };
  }
  if (!input.rationale.trim()) {
    return { valid: false, problem: "a conversion rule must record the rationale for the factor", dimension: null };
  }
  return { valid: true, problem: null, dimension: from.dimension };
}

/**
 * Applies explicit rules only.
 *
 * There is deliberately no fallback, no inference, and no unit library lookup: a
 * conversion that no governed rule covers returns `ok: false`, and the caller
 * must surface that as BLOCKED rather than substitute a guessed factor.
 */
export function convertQuantityWithRules(input: {
  value: number;
  fromUnit: ResolvedEngineeringUnit;
  toUnit: ResolvedEngineeringUnit;
  rules: readonly EngineeringConversionRule[];
}): ConversionResult {
  if (!input.fromUnit.resolved || !input.toUnit.resolved) {
    return { ok: false, value: null, unit: null, ruleId: null, ruleVersion: null, problem: "a conversion requires both units to resolve to known engineering units" };
  }
  if (input.fromUnit.dimension !== input.toUnit.dimension) {
    return { ok: false, value: null, unit: null, ruleId: null, ruleVersion: null, problem: `no conversion exists between the incompatible dimensions ${input.fromUnit.dimension} and ${input.toUnit.dimension}` };
  }
  const rule = input.rules.find((candidate) => candidate.fromUnit === input.fromUnit.canonicalUnit && candidate.toUnit === input.toUnit.canonicalUnit);
  if (!rule) {
    return {
      ok: false,
      value: null,
      unit: null,
      ruleId: null,
      ruleVersion: null,
      problem: `no governed conversion rule converts ${input.fromUnit.canonicalUnit} to ${input.toUnit.canonicalUnit}; an implicit factor is never applied`,
    };
  }
  return { ok: true, value: input.value * rule.factor, unit: rule.toUnit, ruleId: rule.ruleId, ruleVersion: rule.ruleVersion, problem: null };
}

/** The conversion contract version this module implements. */
export const CONVERSION_CONTRACT_VERSION = ENGINEERING_CONVERSION_VERSION;
