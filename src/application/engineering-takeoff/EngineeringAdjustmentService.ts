/**
 * Phase 2A-11 — Governed Engineering Adjustment Service.
 *
 * Adjustments express allowances that change the REQUIRED quantity: wastage,
 * spare allowance, cutting loss, contingency, overlap, lapping, coverage
 * allowance. Each is persisted SEPARATELY with its own rule, factor, rationale,
 * base decision, and actor.
 *
 * The rule this service exists to enforce: an adjustment NEVER mutates the base
 * engineering quantity. The base value is read FROM the approved decision and
 * recorded alongside the adjusted result, so a reviewer can always see both the
 * approved engineering quantity and the allowance applied to it.
 */

import {
  adjustmentRequiresApproval,
  buildAdjustment,
  baseQuantityPreserved,
  composeAdjustedQuantity,
  validateAdjustmentRequest,
  type AdjustmentMode,
  type EngineeringAdjustment,
  type EngineeringAdjustmentType,
  type EngineeringQuantityDecision,
  type EngineeringRequirementKind,
} from "@/src/domain/engineering-takeoff";

import type { EngineeringClockPort, EngineeringStore } from "./ports";

// ---------------------------------------------------------------------------
// Requests / results
// ---------------------------------------------------------------------------

export type RecordAdjustmentRequest = {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel?: string | null;
  requirementKind: EngineeringRequirementKind;
  adjustmentType: EngineeringAdjustmentType;
  mode: AdjustmentMode;
  /** Percentage as a number in percent (e.g. 5 for 5%). */
  adjustmentFactor: number;
  rationale: string;
  /** The APPROVED decision this adjustment extends. Never a candidate. */
  baseDecisionId: string;
  unitLiteral: string;
  actorUserId: string;
  /** Required only for adjustment types flagged as needing approval. */
  approvedByUserId?: string | null;
  approvedAt?: string | null;
};

export type RecordAdjustmentResult = {
  adjustment: EngineeringAdjustment;
  requiresApproval: boolean;
  /** The base engineering quantity, unchanged, echoed for audit. */
  baseValue: number;
  /** The adjusted quantity, or null when the adjustment is blocked. */
  adjustedValue: number | null;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type EngineeringAdjustmentDeps = {
  store: EngineeringStore;
  clock: EngineeringClockPort;
};

export class EngineeringAdjustmentService {
  constructor(private readonly deps: EngineeringAdjustmentDeps) {}

  /**
   * Records a governed engineering adjustment on top of an approved decision.
   *
   * The base decision must be an APPROVED decision. An adjustment on a
   * superseded or withdrawn decision is refused, because the base it would
   * extend is no longer engineering truth.
   */
  async recordAdjustment(request: RecordAdjustmentRequest): Promise<RecordAdjustmentResult> {
    const now = this.deps.clock.now();
    const scope = await this.deps.store.findScope({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId });
    if (!scope) throw new Error(`the engineering takeoff scope ${request.takeoffScopeId} does not exist for this company`);

    const baseDecision = await this.deps.store.findDecision({ companyId: request.companyId, decisionId: request.baseDecisionId });
    if (!baseDecision) throw new Error("the base decision this adjustment extends does not exist for this company");
    if (baseDecision.takeoffScopeId !== request.takeoffScopeId) {
      throw new Error("an adjustment may only extend a decision from the same takeoff scope");
    }
    if (baseDecision.subjectMatchKey !== request.subjectMatchKey) {
      throw new Error("an adjustment may only extend a decision about the same engineering subject");
    }

    const validation = validateAdjustmentRequest({
      adjustmentType: request.adjustmentType,
      mode: request.mode,
      adjustmentFactor: request.adjustmentFactor,
      rationale: request.rationale,
      baseDecision,
    });
    if (!validation.valid) throw new Error(validation.problem ?? "the engineering adjustment is invalid");

    const adjustment = buildAdjustment({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
      subjectKeyNamespace: request.subjectKeyNamespace,
      subjectLabel: request.subjectLabel ?? null,
      requirementKind: request.requirementKind,
      adjustmentType: request.adjustmentType,
      mode: request.mode,
      adjustmentFactor: request.adjustmentFactor,
      rationale: request.rationale,
      baseDecision,
      unitLiteral: request.unitLiteral,
      actorUserId: request.actorUserId,
      createdAt: now,
      approvedByUserId: request.approvedByUserId ?? null,
      approvedAt: request.approvedAt ?? null,
    });

    await this.deps.store.saveAdjustment(adjustment);

    // Proves the base was not mutated: the decision reloaded from the store
    // still holds its original approved value, id, and state after the
    // adjustment was written.
    const reloaded = await this.deps.store.findDecision({ companyId: request.companyId, decisionId: request.baseDecisionId });
    if (!reloaded || !baseQuantityPreserved({ before: baseDecision, after: reloaded })) {
      throw new Error("the adjustment mutated its base engineering quantity, which Phase 2A-11 forbids");
    }

    return {
      adjustment,
      requiresApproval: adjustmentRequiresApproval(request.adjustmentType),
      baseValue: adjustment.baseValue,
      adjustedValue: adjustment.adjustedValue,
    };
  }

  async findAdjustment(input: { companyId: string; adjustmentId: string }): Promise<EngineeringAdjustment | null> {
    return this.deps.store.findAdjustment(input);
  }

  async listAdjustments(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; adjustmentType?: EngineeringAdjustmentType; limit?: number }) {
    return this.deps.store.listAdjustments({ ...input, limit: input.limit ?? 500 });
  }

  /**
   * Composes every adjustment on a subject into ONE adjusted quantity.
   *
   * Proportional adjustments are applied before absolute additions, and a single
   * blocked adjustment blocks the whole composition. The base value is passed in
   * from the decision and is never itself altered.
   */
  async composeForSubject(input: {
    companyId: string;
    takeoffScopeId: string;
    subjectMatchKey: string;
    baseDecision: EngineeringQuantityDecision;
  }): Promise<{ value: number | null; blocked: boolean; reasons: string[]; baseValue: number }> {
    const adjustments = await this.deps.store.listAdjustments({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: input.subjectMatchKey,
      limit: 500,
    });
    const composed = composeAdjustedQuantity({ baseValue: input.baseDecision.approvedValue, adjustments });
    return { ...composed, baseValue: input.baseDecision.approvedValue };
  }

  /**
   * The adjustment lineage of one approved decision.
   *
   * It reports the base value and each allowance separately, so a BOM row can
   * carry the whole chain rather than one unexplained adjusted figure.
   */
  async lineageFor(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string; baseDecision: EngineeringQuantityDecision }) {
    const adjustments = await this.deps.store.listAdjustments({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: input.subjectMatchKey,
      limit: 500,
    });
    return {
      baseDecisionId: input.baseDecision.decisionId,
      baseValue: input.baseDecision.approvedValue,
      baseUnitLiteral: input.baseDecision.approvedUnitLiteral,
      adjustments: adjustments.map((adjustment) => ({
        adjustmentId: adjustment.adjustmentId,
        adjustmentType: adjustment.adjustmentType,
        mode: adjustment.mode,
        factor: adjustment.adjustmentFactor,
        baseValue: adjustment.baseValue,
        adjustedValue: adjustment.adjustedValue,
        blocked: adjustment.blocked,
        ruleId: adjustment.ruleId,
        ruleVersion: adjustment.ruleVersion,
        approvedByUserId: adjustment.approvedByUserId,
      })),
    };
  }
}
