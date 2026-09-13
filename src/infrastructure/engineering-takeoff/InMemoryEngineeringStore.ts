/**
 * Phase 2A-11 in-memory engineering store.
 *
 * It implements the full `EngineeringStore` surface with the SAME governance
 * semantics the Prisma implementation must have:
 *
 * - occurrences append only; a re-appended occurrence is reported as existing
 *   rather than rewritten;
 * - decisions append only; `retireDecision` writes state fields only and can
 *   never touch an approved value;
 * - a BOM version's rows cannot change after approval;
 * - every read and write is company-scoped, so a cross-tenant read returns
 *   nothing rather than leaking a row.
 *
 * Tests exercise the real services against this store, so they test the
 * governance rules rather than a mock's expectations.
 */

import type {
  BomRowConstraint,
  EngineeringAdjustment,
  EngineeringAdjustmentType,
  BomCompletenessState as EngineeringBomCompletenessState,
  EngineeringBomRow,
  EngineeringBomVersion,
  EngineeringQuantityCandidate,
  EngineeringQuantityDecision,
  EngineeringTakeoffScope,
  OccurrenceLedgerEntry,
} from "@/src/domain/engineering-takeoff";

import type {
  BomRequiredSubjectRecord,
  BomRowAdjustmentRecord,
  CalculationInputRecord,
  CandidateSourceRecord,
  ConflictRecord,
  EngineeringStore,
  PersistedCalculation,
  PersistedCountingRule,
  TakeoffScopeState,
} from "@/src/application/engineering-takeoff/ports";

export class InMemoryEngineeringStore implements EngineeringStore {
  private scopes = new Map<string, EngineeringTakeoffScope>();
  private rules = new Map<string, PersistedCountingRule>();
  private occurrences = new Map<string, OccurrenceLedgerEntry>();
  private candidates = new Map<string, EngineeringQuantityCandidate>();
  private candidateSources = new Map<string, CandidateSourceRecord[]>();
  private conflicts = new Map<string, ConflictRecord>();
  private decisions = new Map<string, EngineeringQuantityDecision>();
  private decisionSources = new Map<string, Array<{ candidateId: string; calculationId: string | null }>>();
  private decisionClaims = new Map<string, string[]>();
  private calculations = new Map<string, PersistedCalculation>();
  private calculationInputs = new Map<string, CalculationInputRecord[]>();
  private adjustments = new Map<string, EngineeringAdjustment>();
  private bomVersions = new Map<string, EngineeringBomVersion>();
  private bomRows = new Map<string, EngineeringBomRow[]>();
  private rowConstraints = new Map<string, BomRowConstraint[]>();
  private rowAdjustments = new Map<string, BomRowAdjustmentRecord[]>();
  private versionDecisions = new Map<string, string[]>();
  private requiredSubjects = new Map<string, BomRequiredSubjectRecord[]>();

  /** Records every method call, so a no-promotion test can assert the surface. */
  readonly callLog: string[] = [];

  private key(companyId: string, id: string): string {
    return `${companyId}\u0000${id}`;
  }

  // -------------------------------------------------------------------------
  // Scope
  // -------------------------------------------------------------------------

  async saveScope(record: EngineeringTakeoffScope): Promise<EngineeringTakeoffScope> {
    this.callLog.push("saveScope");
    this.scopes.set(this.key(record.companyId, record.takeoffScopeId), record);
    return record;
  }

  async findScope(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringTakeoffScope | null> {
    this.callLog.push("findScope");
    return this.scopes.get(this.key(input.companyId, input.takeoffScopeId)) ?? null;
  }

  async listScopes(input: { companyId: string; comparisonScopeId?: string; state?: TakeoffScopeState; limit: number }): Promise<EngineeringTakeoffScope[]> {
    this.callLog.push("listScopes");
    return [...this.scopes.values()]
      .filter((scope) => scope.companyId === input.companyId)
      .filter((scope) => (input.comparisonScopeId ? scope.comparisonScopeId === input.comparisonScopeId : true))
      .filter((scope) => (input.state ? scope.state === input.state : true))
      .slice(0, input.limit);
  }

  async updateScopeDerivedState(input: {
    companyId: string;
    takeoffScopeId: string;
    state: TakeoffScopeState;
    readiness: EngineeringTakeoffScope["readiness"];
    readinessReasons: readonly string[];
    completeness: EngineeringBomCompletenessState | null;
    blockReasons: readonly string[];
    acceptedClaimCount: number;
    withheldClaimCount: number;
    updatedAt: string;
  }): Promise<EngineeringTakeoffScope | null> {
    this.callLog.push("updateScopeDerivedState");
    const existing = this.scopes.get(this.key(input.companyId, input.takeoffScopeId));
    if (!existing) return null;
    const updated: EngineeringTakeoffScope = {
      ...existing,
      state: input.state,
      readiness: input.readiness,
      readinessReasons: [...input.readinessReasons],
      completeness: input.completeness,
      blockReasons: [...input.blockReasons],
      acceptedClaimCount: input.acceptedClaimCount,
      withheldClaimCount: input.withheldClaimCount,
      updatedAt: input.updatedAt,
    };
    this.scopes.set(this.key(input.companyId, input.takeoffScopeId), updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Counting rules
  // -------------------------------------------------------------------------

  async saveCountingRule(record: PersistedCountingRule): Promise<void> {
    this.callLog.push("saveCountingRule");
    this.rules.set(this.key(record.companyId, `${record.takeoffScopeId}\u0000${record.family}\u0000${record.ruleVersion}`), record);
  }

  async findCountingRule(input: { companyId: string; takeoffScopeId: string; family: "DXF" | "IFC"; ruleVersion: string }): Promise<PersistedCountingRule | null> {
    this.callLog.push("findCountingRule");
    return this.rules.get(this.key(input.companyId, `${input.takeoffScopeId}\u0000${input.family}\u0000${input.ruleVersion}`)) ?? null;
  }

  async listCountingRules(input: { companyId: string; takeoffScopeId: string }): Promise<PersistedCountingRule[]> {
    this.callLog.push("listCountingRules");
    return [...this.rules.values()].filter((rule) => rule.companyId === input.companyId && rule.takeoffScopeId === input.takeoffScopeId);
  }

  // -------------------------------------------------------------------------
  // Occurrence ledger (append-only)
  // -------------------------------------------------------------------------

  async saveOccurrences(entries: readonly OccurrenceLedgerEntry[]): Promise<{ inserted: number; existing: number }> {
    this.callLog.push("saveOccurrences");
    let inserted = 0;
    let existing = 0;
    for (const entry of entries) {
      const key = this.key(entry.companyId, entry.entryId);
      if (this.occurrences.has(key)) {
        // Append-only: an already recorded occurrence is NEVER rewritten.
        existing += 1;
        continue;
      }
      this.occurrences.set(key, entry);
      inserted += 1;
    }
    return { inserted, existing };
  }

  async listOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean; subjectMatchKey?: string; limit: number }): Promise<OccurrenceLedgerEntry[]> {
    this.callLog.push("listOccurrences");
    return [...this.occurrences.values()]
      .filter((entry) => entry.companyId === input.companyId && entry.takeoffScopeId === input.takeoffScopeId)
      .filter((entry) => (input.included === undefined ? true : entry.included === input.included))
      .filter((entry) => (input.subjectMatchKey ? entry.subjectMatchKey === input.subjectMatchKey : true))
      .slice(0, input.limit);
  }

  async countOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean }): Promise<number> {
    this.callLog.push("countOccurrences");
    return [...this.occurrences.values()]
      .filter((entry) => entry.companyId === input.companyId && entry.takeoffScopeId === input.takeoffScopeId)
      .filter((entry) => (input.included === undefined ? true : entry.included === input.included)).length;
  }

  // -------------------------------------------------------------------------
  // Candidates
  // -------------------------------------------------------------------------

  async saveCandidate(record: EngineeringQuantityCandidate): Promise<void> {
    this.callLog.push("saveCandidate");
    this.candidates.set(this.key(record.companyId, record.candidateId), record);
  }

  async findCandidate(input: { companyId: string; candidateId: string }): Promise<EngineeringQuantityCandidate | null> {
    this.callLog.push("findCandidate");
    return this.candidates.get(this.key(input.companyId, input.candidateId)) ?? null;
  }

  async listCandidates(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; conflictState?: string; origin?: string; limit: number }): Promise<EngineeringQuantityCandidate[]> {
    this.callLog.push("listCandidates");
    return [...this.candidates.values()]
      .filter((candidate) => candidate.companyId === input.companyId && candidate.takeoffScopeId === input.takeoffScopeId)
      .filter((candidate) => (input.subjectMatchKey ? candidate.subjectMatchKey === input.subjectMatchKey : true))
      .filter((candidate) => (input.conflictState ? candidate.conflictState === input.conflictState : true))
      .filter((candidate) => (input.origin ? candidate.origin === input.origin : true))
      .slice(0, input.limit);
  }

  async saveCandidateSources(input: { companyId: string; candidateId: string; sources: readonly CandidateSourceRecord[] }): Promise<void> {
    this.callLog.push("saveCandidateSources");
    this.candidateSources.set(this.key(input.companyId, input.candidateId), [...input.sources]);
  }

  async listCandidateSources(input: { companyId: string; candidateId: string }): Promise<CandidateSourceRecord[]> {
    this.callLog.push("listCandidateSources");
    return this.candidateSources.get(this.key(input.companyId, input.candidateId)) ?? [];
  }

  async saveConflict(input: { companyId: string; takeoffScopeId: string; conflict: ConflictRecord }): Promise<void> {
    this.callLog.push("saveConflict");
    this.conflicts.set(this.key(input.companyId, input.conflict.conflictId), input.conflict);
  }

  async listConflicts(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<ConflictRecord[]> {
    this.callLog.push("listConflicts");
    return [...this.conflicts.values()]
      .filter((conflict) => conflict.companyId === input.companyId && conflict.takeoffScopeId === input.takeoffScopeId)
      .filter((conflict) => (input.subjectMatchKey ? conflict.subjectMatchKey === input.subjectMatchKey : true))
      .slice(0, input.limit);
  }

  // -------------------------------------------------------------------------
  // Decisions (append-only)
  // -------------------------------------------------------------------------

  async appendDecision(record: EngineeringQuantityDecision): Promise<void> {
    this.callLog.push("appendDecision");
    const key = this.key(record.companyId, record.decisionId);
    if (this.decisions.has(key)) throw new Error("a decision is append-only and may not be written twice");
    this.decisions.set(key, record);
  }

  async findDecision(input: { companyId: string; decisionId: string }): Promise<EngineeringQuantityDecision | null> {
    this.callLog.push("findDecision");
    return this.decisions.get(this.key(input.companyId, input.decisionId)) ?? null;
  }

  async retireDecision(input: { companyId: string; decisionId: string; supersededByDecisionId: string; state: "SUPERSEDED" | "WITHDRAWN" }): Promise<void> {
    this.callLog.push("retireDecision");
    const key = this.key(input.companyId, input.decisionId);
    const existing = this.decisions.get(key);
    if (!existing) throw new Error("the decision to retire does not exist for this company");
    // Only state fields move. The approved value is carried over verbatim.
    this.decisions.set(key, { ...existing, state: input.state, supersededByDecisionId: input.supersededByDecisionId });
  }

  async listDecisions(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; state?: string; limit: number }): Promise<EngineeringQuantityDecision[]> {
    this.callLog.push("listDecisions");
    return [...this.decisions.values()]
      .filter((decision) => decision.companyId === input.companyId && decision.takeoffScopeId === input.takeoffScopeId)
      .filter((decision) => (input.subjectMatchKey ? decision.subjectMatchKey === input.subjectMatchKey : true))
      .filter((decision) => (input.state ? decision.state === input.state : true))
      .slice(0, input.limit);
  }

  async currentDecision(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision | null> {
    this.callLog.push("currentDecision");
    const history = await this.decisionHistory(input);
    return history.filter((decision) => decision.state === "APPROVED").sort((left, right) => right.decisionVersion - left.decisionVersion)[0] ?? null;
  }

  async decisionHistory(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision[]> {
    this.callLog.push("decisionHistory");
    return [...this.decisions.values()]
      .filter((decision) => decision.companyId === input.companyId && decision.takeoffScopeId === input.takeoffScopeId && decision.subjectMatchKey === input.subjectMatchKey)
      .sort((left, right) => left.decisionVersion - right.decisionVersion);
  }

  async saveDecisionSources(input: { companyId: string; decisionId: string; candidateIds: readonly string[]; calculationIds?: readonly string[] }): Promise<void> {
    this.callLog.push("saveDecisionSources");
    const calculationIds = input.calculationIds ?? [];
    this.decisionSources.set(
      this.key(input.companyId, input.decisionId),
      input.candidateIds.map((candidateId, index) => ({ candidateId, calculationId: calculationIds[index] ?? null })),
    );
  }

  async listDecisionSources(input: { companyId: string; decisionId: string }): Promise<Array<{ candidateId: string; calculationId: string | null }>> {
    this.callLog.push("listDecisionSources");
    return this.decisionSources.get(this.key(input.companyId, input.decisionId)) ?? [];
  }

  async saveDecisionClaims(input: { companyId: string; decisionId: string; claimIds: readonly string[] }): Promise<void> {
    this.callLog.push("saveDecisionClaims");
    this.decisionClaims.set(this.key(input.companyId, input.decisionId), [...input.claimIds]);
  }

  async listDecisionClaims(input: { companyId: string; decisionId: string }): Promise<string[]> {
    this.callLog.push("listDecisionClaims");
    return this.decisionClaims.get(this.key(input.companyId, input.decisionId)) ?? [];
  }

  // -------------------------------------------------------------------------
  // Calculations
  // -------------------------------------------------------------------------

  async saveCalculation(input: { record: PersistedCalculation; inputs: readonly CalculationInputRecord[] }): Promise<void> {
    this.callLog.push("saveCalculation");
    this.calculations.set(this.key(input.record.companyId, input.record.calculationId), input.record);
    this.calculationInputs.set(this.key(input.record.companyId, input.record.calculationId), [...input.inputs]);
  }

  async findCalculation(input: { companyId: string; calculationId: string }): Promise<PersistedCalculation | null> {
    this.callLog.push("findCalculation");
    return this.calculations.get(this.key(input.companyId, input.calculationId)) ?? null;
  }

  async listCalculationInputs(input: { companyId: string; calculationId: string }): Promise<CalculationInputRecord[]> {
    this.callLog.push("listCalculationInputs");
    return this.calculationInputs.get(this.key(input.companyId, input.calculationId)) ?? [];
  }

  async listCalculations(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<PersistedCalculation[]> {
    this.callLog.push("listCalculations");
    return [...this.calculations.values()]
      .filter((calculation) => calculation.companyId === input.companyId && calculation.takeoffScopeId === input.takeoffScopeId)
      .filter((calculation) => (input.subjectMatchKey ? calculation.subjectMatchKey === input.subjectMatchKey : true))
      .slice(0, input.limit);
  }

  // -------------------------------------------------------------------------
  // Adjustments
  // -------------------------------------------------------------------------

  async saveAdjustment(record: EngineeringAdjustment): Promise<void> {
    this.callLog.push("saveAdjustment");
    this.adjustments.set(this.key(record.companyId, record.adjustmentId), record);
  }

  async findAdjustment(input: { companyId: string; adjustmentId: string }): Promise<EngineeringAdjustment | null> {
    this.callLog.push("findAdjustment");
    return this.adjustments.get(this.key(input.companyId, input.adjustmentId)) ?? null;
  }

  async listAdjustments(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; adjustmentType?: EngineeringAdjustmentType; limit: number }): Promise<EngineeringAdjustment[]> {
    this.callLog.push("listAdjustments");
    return [...this.adjustments.values()]
      .filter((adjustment) => adjustment.companyId === input.companyId && adjustment.takeoffScopeId === input.takeoffScopeId)
      .filter((adjustment) => (input.subjectMatchKey ? adjustment.subjectMatchKey === input.subjectMatchKey : true))
      .filter((adjustment) => (input.adjustmentType ? adjustment.adjustmentType === input.adjustmentType : true))
      .slice(0, input.limit);
  }

  // -------------------------------------------------------------------------
  // Engineering BOM
  // -------------------------------------------------------------------------

  async saveBomVersion(record: EngineeringBomVersion): Promise<void> {
    this.callLog.push("saveBomVersion");
    this.bomVersions.set(this.key(record.companyId, record.bomVersionId), record);
  }

  async findBomVersion(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomVersion | null> {
    this.callLog.push("findBomVersion");
    return this.bomVersions.get(this.key(input.companyId, input.bomVersionId)) ?? null;
  }

  async listBomVersions(input: { companyId: string; takeoffScopeId: string; state?: EngineeringBomVersion["state"]; limit: number }): Promise<EngineeringBomVersion[]> {
    this.callLog.push("listBomVersions");
    return [...this.bomVersions.values()]
      .filter((version) => version.companyId === input.companyId && version.takeoffScopeId === input.takeoffScopeId)
      .filter((version) => (input.state ? version.state === input.state : true))
      .slice(0, input.limit);
  }

  async latestBomVersion(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringBomVersion | null> {
    this.callLog.push("latestBomVersion");
    const versions = await this.listBomVersions({ ...input, limit: 1000 });
    return versions.sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null;
  }

  async approveBomVersion(input: {
    companyId: string;
    bomVersionId: string;
    approvedByUserId: string;
    approvedAt: string;
    completeness: EngineeringBomCompletenessState;
    completenessReasons: readonly string[];
  }): Promise<void> {
    this.callLog.push("approveBomVersion");
    const key = this.key(input.companyId, input.bomVersionId);
    const existing = this.bomVersions.get(key);
    if (!existing) throw new Error("the BOM version to approve does not exist for this company");
    if (existing.state === "APPROVED") throw new Error("an approved BOM version is immutable and may not be re-approved");
    // Only approval fields and completeness move. Rows are never touched here.
    this.bomVersions.set(key, {
      ...existing,
      state: "APPROVED",
      approvedByUserId: input.approvedByUserId,
      approvedAt: input.approvedAt,
      completeness: input.completeness,
      completenessReasons: [...input.completenessReasons],
    });
  }

  async saveBomRows(input: { companyId: string; bomVersionId: string; rows: readonly EngineeringBomRow[] }): Promise<void> {
    this.callLog.push("saveBomRows");
    const key = this.key(input.companyId, input.bomVersionId);
    const version = this.bomVersions.get(key);
    // A BOM version's rows cannot change once the version is APPROVED. This is
    // the store-level half of the immutability guarantee.
    if (version?.state === "APPROVED" && (this.bomRows.get(key)?.length ?? 0) > 0) {
      throw new Error("an approved BOM version is immutable: its rows cannot be rewritten, only superseded by a new version");
    }
    this.bomRows.set(key, [...input.rows]);
  }

  async listBomRows(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomRow[]> {
    this.callLog.push("listBomRows");
    return this.bomRows.get(this.key(input.companyId, input.bomVersionId)) ?? [];
  }

  async findBomRow(input: { companyId: string; bomRowId: string }): Promise<EngineeringBomRow | null> {
    this.callLog.push("findBomRow");
    for (const rows of this.bomRows.values()) {
      const found = rows.find((row) => row.rowId === input.bomRowId && row.companyId === input.companyId);
      if (found) return found;
    }
    return null;
  }

  async saveRowConstraints(input: { companyId: string; bomRowId: string; constraints: readonly BomRowConstraint[] }): Promise<void> {
    this.callLog.push("saveRowConstraints");
    this.rowConstraints.set(this.key(input.companyId, input.bomRowId), [...input.constraints]);
  }

  async listRowConstraints(input: { companyId: string; bomRowId: string }): Promise<BomRowConstraint[]> {
    this.callLog.push("listRowConstraints");
    return this.rowConstraints.get(this.key(input.companyId, input.bomRowId)) ?? [];
  }

  async saveRowAdjustments(input: { companyId: string; bomRowId: string; adjustments: readonly BomRowAdjustmentRecord[] }): Promise<void> {
    this.callLog.push("saveRowAdjustments");
    this.rowAdjustments.set(this.key(input.companyId, input.bomRowId), [...input.adjustments]);
  }

  async listRowAdjustments(input: { companyId: string; bomRowId: string }): Promise<BomRowAdjustmentRecord[]> {
    this.callLog.push("listRowAdjustments");
    return this.rowAdjustments.get(this.key(input.companyId, input.bomRowId)) ?? [];
  }

  async saveVersionDecisions(input: { companyId: string; bomVersionId: string; decisionIds: readonly string[] }): Promise<void> {
    this.callLog.push("saveVersionDecisions");
    this.versionDecisions.set(this.key(input.companyId, input.bomVersionId), [...input.decisionIds]);
  }

  async listVersionDecisions(input: { companyId: string; bomVersionId: string }): Promise<string[]> {
    this.callLog.push("listVersionDecisions");
    return this.versionDecisions.get(this.key(input.companyId, input.bomVersionId)) ?? [];
  }

  async saveRequiredSubjects(input: { companyId: string; bomVersionId: string; subjects: readonly BomRequiredSubjectRecord[] }): Promise<void> {
    this.callLog.push("saveRequiredSubjects");
    this.requiredSubjects.set(this.key(input.companyId, input.bomVersionId), [...input.subjects]);
  }

  async listRequiredSubjects(input: { companyId: string; bomVersionId: string }): Promise<BomRequiredSubjectRecord[]> {
    this.callLog.push("listRequiredSubjects");
    return this.requiredSubjects.get(this.key(input.companyId, input.bomVersionId)) ?? [];
  }
}
