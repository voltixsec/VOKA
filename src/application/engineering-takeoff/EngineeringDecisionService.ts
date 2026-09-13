/**
 * Phase 2A-11 — Governed Engineering Quantity Decision Service.
 *
 * This is the ONLY place an engineering quantity becomes approved. Everything
 * upstream — source claims, counted occurrences, calculations, adjustments —
 * produces CANDIDATES. Approval is an explicit, attributed, rationale-bearing,
 * versioned human act recorded here.
 *
 * The command is named `approveQuantity`, not `recordDecision`, and the naming is
 * load-bearing. Nothing in this phase approves a quantity except this command:
 *
 * - persisting a candidate does not approve it (a candidate has no approved field);
 * - creating a BOM version from approved decisions does not approve anything
 *   (it refuses a decision that is not already APPROVED);
 * - rebuilding candidates does not approve anything.
 *
 * `recordDecision` is retained as an explicit DELEGATING alias so older callers
 * keep working, but it performs the identical governed approval and is documented
 * as such rather than remaining a generic "record" that happens to approve.
 *
 * The service enforces the phase's central governance rules:
 *
 * - A decision never overwrites history. Approving a revised quantity appends a
 *   new decision version and retires the previous one BY REFERENCE; the earlier
 *   approved value is never rewritten.
 * - A decision is only ever built from candidates that exist in the same scope
 *   and company, so a decision cannot cite evidence outside its tenant.
 * - A conflict is resolved by naming the candidate the reviewer chose, with a
 *   rationale. The service never picks for them.
 * - Approval requires an actor and a rationale. There is no anonymous, silent,
 *   or default approval path.
 */

import {
  buildQuantityDecision,
  decisionHistory as orderDecisionHistory,
  decisionBomReadiness,
  detectDecisionMutation,
  nextDecisionVersion,
  supersedeDecision,
  type BomCompletenessState,
  type EngineeringQuantityCandidate,
  type EngineeringQuantityDecision,
  type EngineeringReadinessState,
  type QuantityDecisionBasis,
  type EngineeringRequirementKind,
} from "@/src/domain/engineering-takeoff";

import type { EngineeringClockPort, EngineeringStore } from "./ports";

// ---------------------------------------------------------------------------
// Requests / results
// ---------------------------------------------------------------------------

/**
 * The governed APPROVAL request.
 *
 * Every field is required by the approval contract: the subject being approved,
 * the approved value and unit, the actor who approved it, the rationale they
 * recorded, and at least one governed candidate the approval rests on. The
 * domain refuses a request that omits the actor, the rationale, or the source
 * candidates, so no approval can be anonymous, unexplained, or unattributed.
 */
export type ApproveQuantityRequest = {
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel?: string | null;
  requirementKind: EngineeringRequirementKind;
  approvedValue: number;
  approvedUnitLiteral: string;
  approvedUnitDimension: string;
  decisionBasis: QuantityDecisionBasis;
  /** The authorized human actor. Required and never inferred. */
  actorUserId: string;
  /** Why this quantity was adopted. Required and never inferred. */
  rationale: string;
  /** The candidate the reviewer chose, when they chose one explicitly. */
  selectedCandidateId?: string | null;
  /** Every candidate the decision considered, including the ones not chosen. */
  consideredCandidateIds: readonly string[];
  resolvedConflictSubjectKey?: string | null;
  revisionMembershipIds?: readonly string[];
  documentIdentityIds?: readonly string[];
};

/**
 * The legacy name for the approval request.
 *
 * Retained so existing callers compile, but it is the SAME governed approval:
 * `recordDecision` delegates to `approveQuantity`.
 */
export type RecordDecisionRequest = ApproveQuantityRequest;

export type ApproveQuantityResult = {
  decision: EngineeringQuantityDecision;
  /** The previous decision this one superseded, when there was one. */
  superseded: EngineeringQuantityDecision | null;
  readiness: { readiness: EngineeringReadinessState; reasons: string[] };
};

/** The legacy result alias. */
export type RecordDecisionResult = ApproveQuantityResult;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type EngineeringDecisionDeps = {
  store: EngineeringStore;
  clock: EngineeringClockPort;
};

export class EngineeringDecisionService {
  constructor(private readonly deps: EngineeringDecisionDeps) {}

  /**
   * APPROVES an engineering quantity explicitly.
   *
   * This is the phase's governed approval action. It is named for what it does:
   * it creates an APPROVED quantity decision. It is not a generic "record" — a
   * caller cannot use it to store a non-approved quantity, because a decision is
   * APPROVED by definition and retirement is the only other lifecycle movement.
   *
   * When a current decision already exists for the subject, this appends a new
   * version and retires the old one by reference. The old record keeps its
   * approved value forever; only its `state` and `supersededByDecisionId` move.
   */
  async approveQuantity(request: ApproveQuantityRequest): Promise<ApproveQuantityResult> {
    const now = this.deps.clock.now();
    const scope = await this.deps.store.findScope({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId });
    if (!scope) throw new Error(`the engineering takeoff scope ${request.takeoffScopeId} does not exist for this company`);

    // Candidates are resolved INSIDE this company and scope only, so a decision
    // can never cite evidence belonging to another tenant or another takeoff.
    const allCandidates = await this.deps.store.listCandidates({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
      limit: 500,
    });
    const candidateById = new Map(allCandidates.map((candidate) => [candidate.candidateId, candidate]));

    const considered: EngineeringQuantityCandidate[] = [];
    for (const candidateId of new Set(request.consideredCandidateIds)) {
      const candidate = candidateById.get(candidateId);
      if (!candidate) {
        throw new Error(`the candidate ${candidateId} is not a candidate in this company and takeoff scope, so it cannot be relied on by a decision`);
      }
      considered.push(candidate);
    }
    if (considered.length === 0) {
      throw new Error("an engineering quantity decision must rest on at least one governed candidate in this scope");
    }

    if (request.selectedCandidateId) {
      const selected = candidateById.get(request.selectedCandidateId);
      if (!selected) {
        throw new Error(`the selected candidate ${request.selectedCandidateId} is not a candidate in this company and takeoff scope`);
      }
      if (!considered.some((candidate) => candidate.candidateId === selected.candidateId)) {
        throw new Error("the selected candidate must also appear among the candidates the decision considered");
      }
    }

    const previous = await this.deps.store.currentDecision({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
    });

    const history = await this.deps.store.decisionHistory({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
    });

    const decision = buildQuantityDecision({
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      subjectMatchKey: request.subjectMatchKey,
      subjectKeyNamespace: request.subjectKeyNamespace,
      subjectLabel: request.subjectLabel ?? null,
      requirementKind: request.requirementKind,
      decisionVersion: nextDecisionVersion(history, {
        takeoffScopeId: request.takeoffScopeId,
        subjectMatchKey: request.subjectMatchKey,
      }),
      approvedValue: request.approvedValue,
      approvedUnitLiteral: request.approvedUnitLiteral,
      approvedUnitDimension: request.approvedUnitDimension,
      quantityOrigin: "APPROVED_ENGINEERING",
      decisionBasis: request.decisionBasis,
      actorUserId: request.actorUserId,
      rationale: request.rationale,
      decidedAt: now,
      sourceCandidates: considered,
      selectedCandidateId: request.selectedCandidateId ?? null,
      supersedesDecisionId: previous?.decisionId ?? null,
      revisionMembershipIds: request.revisionMembershipIds ?? [],
      documentIdentityIds: request.documentIdentityIds ?? [],
      resolvedConflictSubjectKey: request.resolvedConflictSubjectKey ?? null,
    });

    await this.deps.store.appendDecision(decision);
    await this.deps.store.saveDecisionSources({
      companyId: request.companyId,
      decisionId: decision.decisionId,
      candidateIds: considered.map((candidate) => candidate.candidateId),
    });
    await this.deps.store.saveDecisionClaims({
      companyId: request.companyId,
      decisionId: decision.decisionId,
      claimIds: [...new Set(considered.flatMap((candidate) => decisionClaimIds(candidate)))],
    });

    let superseded: EngineeringQuantityDecision | null = null;
    if (previous) {
      // The retirement is computed by the DOMAIN so the "same subject, same
      // scope, higher version" rules are enforced in one place, then only the
      // state fields are persisted. The approved value is never written.
      superseded = supersedeDecision({ previous, replacement: decision });
      await this.deps.store.retireDecision({
        companyId: request.companyId,
        decisionId: previous.decisionId,
        supersededByDecisionId: decision.decisionId,
        state: "SUPERSEDED",
      });
    }

    return { decision, superseded, readiness: decisionBomReadiness(decision) };
  }

  /**
   * @deprecated Use `approveQuantity`. This is the SAME governed approval, kept
   * as a delegating alias so existing callers compile. It is not a generic
   * record: it creates an APPROVED decision and requires an actor, a rationale,
   * and source candidates exactly as `approveQuantity` does.
   */
  async recordDecision(request: RecordDecisionRequest): Promise<RecordDecisionResult> {
    return this.approveQuantity(request);
  }

  /** Withdraws a decision without replacing it. History is preserved. */
  async withdrawDecision(input: { companyId: string; decisionId: string; withdrawalReference: string }): Promise<void> {
    const decision = await this.deps.store.findDecision({ companyId: input.companyId, decisionId: input.decisionId });
    if (!decision) throw new Error("the decision to withdraw does not exist for this company");
    await this.deps.store.retireDecision({
      companyId: input.companyId,
      decisionId: input.decisionId,
      // A withdrawal has no successor, so the reference is the withdrawal itself.
      supersededByDecisionId: input.withdrawalReference,
      state: "WITHDRAWN",
    });
  }

  async findDecision(input: { companyId: string; decisionId: string }): Promise<EngineeringQuantityDecision | null> {
    return this.deps.store.findDecision(input);
  }

  /** The full, ordered history of a subject's decisions. Nothing is ever removed. */
  async decisionHistory(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision[]> {
    const history = await this.deps.store.decisionHistory(input);
    return orderDecisionHistory(history, { takeoffScopeId: input.takeoffScopeId, subjectMatchKey: input.subjectMatchKey });
  }

  async currentDecision(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision | null> {
    return this.deps.store.currentDecision(input);
  }

  async listDecisions(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; state?: string; limit?: number }): Promise<EngineeringQuantityDecision[]> {
    return this.deps.store.listDecisions({ ...input, limit: input.limit ?? 500 });
  }

  /**
   * Proves the history mechanism: an attempt to change the approved value of an
   * already recorded decision is detected rather than silently applied.
   */
  async detectAttemptedMutation(input: { companyId: string; incoming: EngineeringQuantityDecision }): Promise<{ mutated: boolean; fields: string[] }> {
    const existing = await this.deps.store.findDecision({ companyId: input.companyId, decisionId: input.incoming.decisionId });
    if (!existing) return { mutated: false, fields: [] };
    return detectDecisionMutation(existing, input.incoming);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * The 2A-10 claim ids a candidate rests on.
 *
 * They come from the candidate's own exact provenance references, so a decision
 * traces back through the candidate to the governed claims and citations.
 */
function decisionClaimIds(candidate: EngineeringQuantityCandidate): string[] {
  return candidate.sourceReferences
    .map((reference) => reference.claimId)
    .filter((claimId): claimId is string => typeof claimId === "string" && claimId.length > 0);
}

export type { BomCompletenessState, EngineeringRequirementKind };
