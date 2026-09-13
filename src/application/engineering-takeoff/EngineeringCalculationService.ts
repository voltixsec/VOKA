/**
 * Phase 2A-11 — Governed Engineering Calculation Service.
 *
 * Calculated quantities are derived ONLY from explicit governed inputs. Every
 * input is persisted as its own row naming the governed record it read, so the
 * arithmetic can be re-derived by hand and no hidden assumption can enter.
 *
 * What this service refuses, by construction:
 *
 * - No LLM arithmetic. Only the enumerated, versioned formula registry in the
 *   domain is used.
 * - No inferred values. A missing dimension is an UNRESOLVED input, and an
 *   unresolved input yields a BLOCKED record — never a default, a guess, or a
 *   pixel-measured substitute.
 * - No silent unit mixing. A calculation whose inputs are dimensionally wrong
 *   for the rule is refused before any arithmetic happens.
 */

import {
  calculationInputDigest,
  evaluateCalculation,


  type EngineeringCalculationInput,
  type EngineeringCalculationRecord,

  type EngineeringRequirementKind,
} from "@/src/domain/engineering-takeoff";

import type { EngineeringClockPort, EngineeringStore, CalculationInputRecord } from "./ports";

// ---------------------------------------------------------------------------
// Requests / results
// ---------------------------------------------------------------------------

/** One input a caller wants the calculation to read. */
export type CalculationInputRequest = {
  inputName: string;
  source: "EVIDENCE_CLAIM" | "QUANTITY_DECISION" | "ADJUSTMENT" | "CALCULATION_RESULT";
  /** Exact governed record id this input reads from. */
  sourceReferenceId: string;
  /** The value, when the caller has resolved it. */
  value?: number | null;
  unitLiteral?: string | null;
  /** When true, the input is being supplied unresolved and the calculation blocks. */
  unresolved?: boolean;
  unresolvedReason?: string | null;
};

export type RunCalculationRequest = {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel?: string | null;
  requirementKind: EngineeringRequirementKind;
  ruleId: string;
  ruleVersion: string;
  inputs: readonly CalculationInputRequest[];
  resultUnitLiteral: string;
  actorUserId: string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type EngineeringCalculationDeps = {
  store: EngineeringStore;
  clock: EngineeringClockPort;
};

export class EngineeringCalculationService {
  constructor(private readonly deps: EngineeringCalculationDeps) {}

  /**
   * Runs a governed calculation and persists its inputs and result.
   *
   * A calculation whose rule is unknown, whose arity is wrong, or whose inputs
   * did not all resolve is persisted as a BLOCKED record that holds NO result.
   * A blocked calculation can still be cited by a decision, so an unresolved
   * quantity is visible rather than silently absent.
   */
  async runCalculation(request: RunCalculationRequest): Promise<EngineeringCalculationRecord> {
    const scope = await this.deps.store.findScope({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId });
    if (!scope) throw new Error(`the engineering takeoff scope ${request.takeoffScopeId} does not exist for this company`);

    const now = this.deps.clock.now();

    const inputs: EngineeringCalculationInput[] = request.inputs.map((input) => {
      const isUnresolved = input.unresolved === true || input.value === null || input.value === undefined;
      // An unresolved input carries no value and no unit. Anything else would be
      // an inferred number, which the phase forbids.
      const unitLiteral = isUnresolved ? null : (input.unitLiteral ?? null);
      return {
        inputName: input.inputName,
        source: input.source,
        sourceReferenceId: input.sourceReferenceId,
        value: isUnresolved ? null : (input.value as number),
        unitLiteral,
        resolved: !isUnresolved,
        unresolvedReason: isUnresolved
          ? (input.unresolvedReason ?? "this input is not resolved to a governed value, so the calculation cannot be performed")
          : null,
      };
    });

    // `evaluateCalculation` validates the rule, the arity, the resolution of
    // every input, and each input's DIMENSION against the rule before any
    // arithmetic happens. A dimensionally wrong input therefore yields a BLOCKED
    // record rather than a plausibly-sized wrong number, and this service does
    // not need to duplicate that check.
    const outcome = evaluateCalculation({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
      subjectKeyNamespace: request.subjectKeyNamespace,
      subjectLabel: request.subjectLabel ?? null,
      requirementKind: request.requirementKind,
      ruleId: request.ruleId,
      ruleVersion: request.ruleVersion,
      inputs,
      resultUnitLiteral: request.resultUnitLiteral,
      actorUserId: request.actorUserId,
      computedAt: now,
    });

    if (!outcome.ok || !outcome.calculation) {
      // A refused rule (unknown rule, wrong arity) is a programming error in the
      // CALLER, not a data condition, so it is raised rather than persisted as a
      // blocked record that would look like legitimate engineering state.
      throw new Error(outcome.problem ?? "the governed engineering calculation could not be evaluated");
    }

    const calculation: EngineeringCalculationRecord = outcome.calculation;

    const inputRecords: CalculationInputRecord[] = inputs.map((input, index) => ({
      id: `${calculation.calculationId}:in:${index}`,
      companyId: request.companyId,
      calculationId: calculation.calculationId,
      inputName: input.inputName,
      source: input.source,
      sourceReferenceId: input.sourceReferenceId,
      inputValue: input.value === null ? null : String(input.value),
      inputUnitLiteral: input.unitLiteral,
      resolved: input.resolved,
      unresolvedReason: input.unresolvedReason,
      candidateId: null,
    }));

    await this.deps.store.saveCalculation({ record: calculation, inputs: inputRecords });
    return calculation;
  }

  async findCalculation(input: { companyId: string; calculationId: string }) {
    return this.deps.store.findCalculation(input);
  }

  async listCalculations(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit?: number }) {
    return this.deps.store.listCalculations({ ...input, limit: input.limit ?? 500 });
  }

  async listInputs(input: { companyId: string; calculationId: string }) {
    return this.deps.store.listCalculationInputs(input);
  }

  /**
   * The deterministic digest of a calculation request.
   *
   * Exposed so a caller (or a test) can prove that the same logical calculation
   * always yields the same identity, and that a changed input yields a
   * different one.
   */
  digestOf(input: {
    ruleId: string;
    ruleVersion: string;
    inputs: readonly EngineeringCalculationInput[];
  }): string {
    return calculationInputDigest({ ruleId: input.ruleId, ruleVersion: input.ruleVersion, inputs: input.inputs });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------
}
