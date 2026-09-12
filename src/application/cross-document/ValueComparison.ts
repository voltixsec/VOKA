/**
 * Phase 2A-10: comparing what two sources STATE about one subject.
 *
 * The outcome vocabulary is deliberately tiny: sources either agree, or they
 * state different things, or the comparison cannot be made safely. There is no
 * "correct" outcome, no delta, no difference, no average, no highest, no
 * lowest, no majority vote, and no preferred source. No arithmetic result is
 * stored anywhere.
 *
 * Quantity comparison is allowed only when ALL of the following hold:
 *
 * - the subject identity is strong enough (a `SAME_SUBJECT` match);
 * - the match is not ambiguous;
 * - the units are safely comparable through the closed synonym table;
 * - source coverage supports the comparison;
 * - the active revision context is valid.
 *
 * A numeric literal the source did not supply as a number may be parsed
 * EPHEMERALLY here for a comparison of simple literals. That parse never
 * overwrites the literal, is marked `ENGINE_PARSED_LITERAL`, and never lowers
 * the source's own reliability.
 */

import {
  comparableNumericView,
  compactSubjectKey,
  type ClaimPredicate,
  type FindingKind,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import { resolveUnit } from "@/src/domain/cross-document";

/** A claim that a workbook marked as formula-backed is excluded from strict literal comparison. */
export function isFormulaBackedQuantity(claim: NormalizedEvidenceClaim): boolean {
  return claim.context.sourceQualifiers.includes("FORMULA_BACKED");
}

export type ValueComparisonOutcome =
  | { outcome: "NO_FINDING"; reason: string }
  | { outcome: "FINDING"; findingKind: FindingKind; reason: string; limitation: string | null };

const TEXT_PREDICATE_FINDINGS: Partial<Record<ClaimPredicate, FindingKind>> = {
  MANUFACTURER: "MANUFACTURER_MISMATCH",
  BRAND: "BRAND_MISMATCH",
  MODEL_REFERENCE: "MODEL_REFERENCE_MISMATCH",
  RATING: "RATING_MISMATCH",
  MATERIAL: "MATERIAL_MISMATCH",
  LOCATION: "LOCATION_MISMATCH",
  SYSTEM_ASSIGNMENT: "SYSTEM_ASSIGNMENT_MISMATCH",
  IDENTITY_TAG: "IDENTITY_TAG_MISMATCH",
  TYPE_NAME: "TYPE_MISMATCH",
  CLASSIFICATION_CODE: "CLASSIFICATION_MISMATCH",
  PROPERTY_VALUE: "PROPERTY_MISSING_IN_SOURCE",
  DESCRIPTION_TEXT: "DESCRIPTION_MISMATCH",
  EQUIPMENT_TAG: "IDENTITY_TAG_MISMATCH",
  ITEM_NUMBER: "INCLUSION_EXCLUSION_MISMATCH",
  REVISION_LABEL: "REVISION_MISMATCH",
};

/** Predicates whose value is disclosure or context only and never compared. */
const NON_COMPARABLE_PREDICATES: readonly ClaimPredicate[] = ["UNIT_DECLARATION", "SECTION_OR_DIVISION", "DOCUMENT_IDENTITY"];

export function isComparablePredicate(predicate: ClaimPredicate): boolean {
  return !NON_COMPARABLE_PREDICATES.includes(predicate);
}

/**
 * Compares one pair of claims about the same subject.
 *
 * `descriptionMismatchEnabled` is off by default: similar wording is not a
 * discrepancy until a governed policy explicitly says it is.
 */
export function compareClaims(input: {
  left: NormalizedEvidenceClaim;
  right: NormalizedEvidenceClaim;
  descriptionMismatchEnabled: boolean;
}): ValueComparisonOutcome {
  const { left, right } = input;
  const predicate = left.assertion.predicate;
  if (predicate !== right.assertion.predicate) return { outcome: "NO_FINDING", reason: "the two claims assert different predicates" };
  if (!isComparablePredicate(predicate)) return { outcome: "NO_FINDING", reason: `the ${predicate} predicate is disclosure or context only and is never compared as a value` };
  if (predicate === "DESCRIPTION_TEXT" && !input.descriptionMismatchEnabled) {
    return { outcome: "NO_FINDING", reason: "description comparison is disabled by policy; similar wording is not a discrepancy until a governed policy enables it" };
  }
  // A property value only compares against the SAME property name.
  if (predicate === "PROPERTY_VALUE") {
    const leftName = left.context.qualifiers.at(-1) ?? "";
    const rightName = right.context.qualifiers.at(-1) ?? "";
    if (compactSubjectKey(leftName) !== compactSubjectKey(rightName)) {
      return { outcome: "NO_FINDING", reason: `different property names ('${leftName}' and '${rightName}') were not compared` };
    }
  }
  if (predicate === "CLASSIFICATION_CODE") {
    const leftScheme = left.context.qualifiers[0] ?? null;
    const rightScheme = right.context.qualifiers[0] ?? null;
    if (compactSubjectKey(leftScheme ?? "") !== compactSubjectKey(rightScheme ?? "")) {
      return { outcome: "NO_FINDING", reason: "the classification codes belong to different schemes, so their codes were not compared" };
    }
  }

  if (predicate === "STATED_QUANTITY") return compareStatedQuantities(left, right);

  const findingKind = TEXT_PREDICATE_FINDINGS[predicate];
  if (!findingKind) return { outcome: "NO_FINDING", reason: `the ${predicate} predicate has no comparison policy in this phase` };
  if (compactSubjectKey(left.assertion.valueLiteral) === compactSubjectKey(right.assertion.valueLiteral)) {
    return { outcome: "NO_FINDING", reason: "the two sources state the same value for this predicate" };
  }
  return { outcome: "FINDING", findingKind, reason: "the two sources state different values for this predicate", limitation: null };
}

/**
 * Stated-quantity comparison.
 *
 * Order of decisions:
 * 1. a formula-backed side is excluded from strict literal comparison;
 * 2. a side with no declared unit, or a unit outside the closed synonym table,
 *    suppresses the numeric mismatch and surfaces a unit issue instead;
 * 3. units of different dimensions are a unit mismatch and are never converted;
 * 4. otherwise the numeric views are compared, source-supplied first and
 *    engine-parsed literals second.
 */
export function compareStatedQuantities(left: NormalizedEvidenceClaim, right: NormalizedEvidenceClaim): ValueComparisonOutcome {
  if (isFormulaBackedQuantity(left) || isFormulaBackedQuantity(right)) {
    return {
      outcome: "NO_FINDING",
      reason: "a formula-backed workbook quantity is preserved evidence but is excluded from the strict stated-versus-stated numeric comparison; VOKA never evaluates the formula",
    };
  }

  const leftUnit = resolveUnit(left.assertion.unitLiteral);
  const rightUnit = resolveUnit(right.assertion.unitLiteral);
  const leftDeclared = left.assertion.unitDeclared && Boolean(left.assertion.unitLiteral);
  const rightDeclared = right.assertion.unitDeclared && Boolean(right.assertion.unitLiteral);

  if (!leftDeclared || !rightDeclared || !leftUnit || !rightUnit) {
    const missing = !leftDeclared || !rightDeclared
      ? "one side did not state a unit"
      : "one side's unit is outside the closed synonym table and cannot be proven equivalent";
    return {
      outcome: "FINDING",
      findingKind: "UNIT_NOT_COMPARABLE",
      reason: `${missing}, so the numeric values were not compared`,
      limitation: "no unit was inferred and no conversion was performed; the units are the sources' own text",
    };
  }

  if (leftUnit.canonical !== rightUnit.canonical) {
    return {
      outcome: "FINDING",
      findingKind: "UNIT_MISMATCH",
      reason: `the sources state different units (${leftUnit.canonical} and ${rightUnit.canonical}), so no numeric comparison was performed`,
      limitation: "no unit conversion and no currency conversion exist in this phase; the units are reported exactly as the sources stated them",
    };
  }

  const leftNumber = comparableNumericView(left);
  const rightNumber = comparableNumericView(right);
  if (leftNumber.value === null || rightNumber.value === null) {
    return {
      outcome: "FINDING",
      findingKind: "EVIDENCE_UNAVAILABLE_FOR_COMPARISON",
      reason: "one side's stated quantity could not be read as a number, so no numeric comparison was performed and the literals are both preserved",
      limitation: "a non-numeric quantity stays a literal; VOKA never invents a number for it",
    };
  }
  if (leftNumber.value === rightNumber.value) {
    return { outcome: "NO_FINDING", reason: "the sources state the same quantity in the same unit" };
  }
  return {
    outcome: "FINDING",
    findingKind: "STATED_QUANTITY_MISMATCH",
    reason: "the sources state different quantities for this subject",
    limitation:
      leftNumber.basis === "ENGINE_PARSED_LITERAL" || rightNumber.basis === "ENGINE_PARSED_LITERAL"
        ? "at least one side's number was parsed from a simple numeric literal by the engine for comparison only; the source literal is preserved and the source reliability was not lowered"
        : null,
  };
}

/** Bounded, honest disclosure of every comparison a run did not perform. */
export type ComparisonSkip = { reason: string; claimIds: string[] };

export const QUANTITY_COMPARISON_PROHIBITIONS: readonly string[] = [
  "no delta is computed or stored",
  "no difference, average, highest, or lowest is computed",
  "no majority vote exists",
  "no source is preferred or ranked",
  "no quantity is approved, corrected, or selected",
];
