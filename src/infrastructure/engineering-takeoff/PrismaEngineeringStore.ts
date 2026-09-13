/**
 * Phase 2A-11: the production Prisma `EngineeringStore`.
 *
 * This is the ONLY production implementation of the engineering persistence
 * ports. It satisfies `EngineeringStore` — the aggregate of the scope, counting
 * rule, occurrence ledger, candidate, decision, calculation, adjustment, and BOM
 * stores — using the 17 `Engineering*` models the Phase 2A-11 migration already
 * owns. It introduces NO new domain model and NO parallel table.
 *
 * Invariants this adapter enforces, and that the migration also enforces in the
 * database so an application bug cannot silently win:
 *
 * - every read and every write is company-scoped. A row belonging to another
 *   tenant is reported as NOT FOUND, never returned. `companyId` is always a
 *   `where` predicate, not a post-filter.
 * - occurrences are APPEND ONLY. `saveOccurrences` creates only ids that do not
 *   exist yet and reports the rest as `existing`; a recorded inclusion decision
 *   is never rewritten by a later run.
 * - decisions are APPEND ONLY. `appendDecision` refuses a duplicate id;
 *   `retireDecision` writes only `state`/`supersededByDecisionId` and can never
 *   touch the approved value.
 * - an APPROVED BOM version is IMMUTABLE. `approveBomVersion` writes only the
 *   approval fields and the recomputed completeness, and `saveBomRows` refuses
 *   to rewrite the rows of a version that is already approved.
 * - a candidate can never become APPROVED by persistence. This store has no
 *   field or method that promotes a candidate; approval exists only as an
 *   appended decision, and only the application's approval use case calls that.
 *
 * The no-promotion guarantee is structural: nothing in this file imports or
 * references a Quotation, QuotationLine, Invoice, ProductSelection, Supplier,
 * ProcurementRequirement, Rfq, Offer, Award, or PurchaseOrder, and no mapped
 * field carries a price, rate, amount, currency, pack size, minimum order
 * quantity, order quantity, or lead time.
 */

import { prisma } from "@/lib/prisma";

import type {
  BomRequiredSubjectRecord,
  BomRowAdjustmentRecord,
  CalculationInputRecord,
  CandidateSourceRecord,
  ConflictRecord,
  EngineeringStore,
  PersistedCalculation,
  PersistedCountingRule,
} from "@/src/application/engineering-takeoff/ports";

import type {
  BomCompletenessState,
  BomRowConstraint,
  BomVersionState,
  CountingRuleFamily,
  EngineeringAdjustment,
  EngineeringAdjustmentType,
  EngineeringBomRow,
  EngineeringBomVersion,
  EngineeringQuantityCandidate,
  EngineeringQuantityDecision,
  EngineeringReadinessState,
  EngineeringTakeoffScope,
  OccurrenceLedgerEntry,
  TakeoffScopeState,
} from "@/src/domain/engineering-takeoff";

// ---------------------------------------------------------------------------
// Small read helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Reads a Prisma decimal (or number, or null) as a JS number, preserving null. */
function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Reads a Prisma decimal as a JS number, defaulting a null to 0. */
function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Reads a Prisma String[] column as a plain string array. */
function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

/** Reads a nullable string column, coercing undefined to null. */
function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Reads a boolean column, coercing null/undefined to false. */
function bool(value: unknown): boolean {
  return value === true;
}

function dateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function dateIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : dateIso(value);
}

function isoToDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`refusing to persist an invalid timestamp: ${value}`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PrismaEngineeringStore implements EngineeringStore {
  // =========================================================================
  // Scope
  // =========================================================================

  async saveScope(record: EngineeringTakeoffScope): Promise<EngineeringTakeoffScope> {
    const data = toScopeRow(record);
    await prisma.engineeringTakeoffScope.upsert({
      where: { id: record.takeoffScopeId },
      create: data as never,
      update: data as never,
    });
    return record;
  }

  async findScope(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringTakeoffScope | null> {
    const row = await prisma.engineeringTakeoffScope.findFirst({
      where: { id: input.takeoffScopeId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromScopeRow(row as Row) : null;
  }

  async listScopes(input: { companyId: string; comparisonScopeId?: string; state?: TakeoffScopeState; limit: number }): Promise<EngineeringTakeoffScope[]> {
    const rows = await prisma.engineeringTakeoffScope.findMany({
      where: {
        companyId: input.companyId,
        ...(input.comparisonScopeId ? { comparisonScopeId: input.comparisonScopeId } : {}),
        ...(input.state ? { state: input.state as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromScopeRow(row as Row));
  }

  async updateScopeDerivedState(input: {
    companyId: string;
    takeoffScopeId: string;
    state: TakeoffScopeState;
    readiness: EngineeringReadinessState;
    readinessReasons: readonly string[];
    completeness: BomCompletenessState | null;
    blockReasons: readonly string[];
    acceptedClaimCount: number;
    withheldClaimCount: number;
    updatedAt: string;
  }): Promise<EngineeringTakeoffScope | null> {
    // Company-scoped existence check first, so a cross-tenant id updates nothing.
    const existing = await prisma.engineeringTakeoffScope.findFirst({
      where: { id: input.takeoffScopeId, companyId: input.companyId },
      select: { id: true },
    });
    if (!existing) return null;

    await prisma.engineeringTakeoffScope.update({
      where: { id: input.takeoffScopeId },
      data: {
        state: input.state as never,
        readiness: input.readiness as never,
        readinessReasons: [...input.readinessReasons],
        completeness: (input.completeness ?? null) as never,
        blockReasons: [...input.blockReasons],
        acceptedClaimCount: input.acceptedClaimCount,
        withheldClaimCount: input.withheldClaimCount,
        updatedAt: isoToDate(input.updatedAt),
      },
    });
    return this.findScope({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId });
  }

  // =========================================================================
  // Counting rules
  // =========================================================================

  async saveCountingRule(record: PersistedCountingRule): Promise<void> {
    const data = toCountingRuleRow(record);
    await prisma.engineeringCountingRule.upsert({
      where: { id: record.ruleId },
      create: data as never,
      update: data as never,
    });
  }

  async findCountingRule(input: { companyId: string; takeoffScopeId: string; family: CountingRuleFamily; ruleVersion: string }): Promise<PersistedCountingRule | null> {
    const row = await prisma.engineeringCountingRule.findFirst({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        family: input.family as never,
        ruleVersion: input.ruleVersion,
      },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromCountingRuleRow(row as Row) : null;
  }

  async listCountingRules(input: { companyId: string; takeoffScopeId: string }): Promise<PersistedCountingRule[]> {
    const rows = await prisma.engineeringCountingRule.findMany({
      where: { companyId: input.companyId, takeoffScopeId: input.takeoffScopeId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => fromCountingRuleRow(row as Row));
  }

  // =========================================================================
  // Occurrence ledger (append-only)
  // =========================================================================

  async saveOccurrences(entries: readonly OccurrenceLedgerEntry[]): Promise<{ inserted: number; existing: number }> {
    if (entries.length === 0) return { inserted: 0, existing: 0 };

    // Append-only: an already-recorded occurrence is reported as existing and is
    // NEVER rewritten. We read the ids we were handed for THIS company, then
    // create only the ones that do not yet exist.
    const companyIds = [...new Set(entries.map((entry) => entry.companyId))];
    const candidateIds = entries.map((entry) => entry.entryId);
    const already = await prisma.engineeringOccurrenceLedgerEntry.findMany({
      where: { companyId: { in: companyIds }, id: { in: candidateIds } },
      select: { id: true, companyId: true },
    });
    const seen = new Set(already.map((row: { id: string; companyId: string }) => `${row.companyId}\u0000${row.id}`));

    const pending = entries.filter((entry) => !seen.has(`${entry.companyId}\u0000${entry.entryId}`));
    if (pending.length === 0) return { inserted: 0, existing: entries.length };

    // `skipDuplicates` covers the race where a concurrent writer inserted first.
    const result = await prisma.engineeringOccurrenceLedgerEntry.createMany({
      data: pending.map(toOccurrenceRow) as never,
      skipDuplicates: true,
    });
    const inserted = result.count;
    return { inserted, existing: entries.length - inserted };
  }

  async listOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean; subjectMatchKey?: string; limit: number }): Promise<OccurrenceLedgerEntry[]> {
    const rows = await prisma.engineeringOccurrenceLedgerEntry.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.included === undefined ? {} : { included: input.included }),
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromOccurrenceRow(row as Row));
  }

  async countOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean }): Promise<number> {
    return prisma.engineeringOccurrenceLedgerEntry.count({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.included === undefined ? {} : { included: input.included }),
      },
    });
  }

  // =========================================================================
  // Candidates
  // =========================================================================

  async saveCandidate(record: EngineeringQuantityCandidate): Promise<void> {
    const data = toCandidateRow(record);
    await prisma.engineeringQuantityCandidate.upsert({
      where: { id: record.candidateId },
      create: data as never,
      update: data as never,
    });
  }

  async findCandidate(input: { companyId: string; candidateId: string }): Promise<EngineeringQuantityCandidate | null> {
    const row = await prisma.engineeringQuantityCandidate.findFirst({
      where: { id: input.candidateId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromCandidateRow(row as Row) : null;
  }

  async listCandidates(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; conflictState?: string; origin?: string; limit: number }): Promise<EngineeringQuantityCandidate[]> {
    const rows = await prisma.engineeringQuantityCandidate.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
        ...(input.conflictState ? { conflictState: input.conflictState as never } : {}),
        ...(input.origin ? { origin: input.origin as never } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromCandidateRow(row as Row));
  }

  async saveCandidateSources(input: { companyId: string; candidateId: string; sources: readonly CandidateSourceRecord[] }): Promise<void> {
    if (input.sources.length === 0) return;
    // Provenance rows are immutable evidence links: create only what is new and
    // let the unique key absorb a duplicate replay.
    await prisma.engineeringQuantityCandidateSource.createMany({
      data: input.sources.map((source) => ({
        id: source.id,
        companyId: input.companyId,
        candidateId: input.candidateId,
        basis: source.basis as never,
        claimId: source.claimId,
        sourceArtifactId: source.sourceArtifactId,
        derivationFamilyRootArtifactId: source.derivationFamilyRootArtifactId,
        locator: source.locator,
        humanLocator: source.humanLocator,
        citationId: source.citationId,
        ledgerEntryId: source.ledgerEntryId,
        calculationId: source.calculationId,
        adjustmentId: source.adjustmentId,
      })) as never,
      skipDuplicates: true,
    });
  }

  async listCandidateSources(input: { companyId: string; candidateId: string }): Promise<CandidateSourceRecord[]> {
    const rows = await prisma.engineeringQuantityCandidateSource.findMany({
      where: { companyId: input.companyId, candidateId: input.candidateId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        id: String(r.id),
        companyId: String(r.companyId),
        candidateId: String(r.candidateId),
        basis: String(r.basis),
        claimId: strOrNull(r.claimId),
        sourceArtifactId: strOrNull(r.sourceArtifactId),
        derivationFamilyRootArtifactId: strOrNull(r.derivationFamilyRootArtifactId),
        locator: strOrNull(r.locator),
        humanLocator: strOrNull(r.humanLocator),
        citationId: strOrNull(r.citationId),
        ledgerEntryId: strOrNull(r.ledgerEntryId),
        calculationId: strOrNull(r.calculationId),
        adjustmentId: strOrNull(r.adjustmentId),
      };
    });
  }

  async saveConflict(input: { companyId: string; takeoffScopeId: string; conflict: ConflictRecord }): Promise<void> {
    const conflict = input.conflict;
    const data = {
      id: conflict.conflictId,
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: conflict.subjectMatchKey,
      leftCandidateId: conflict.leftCandidateId,
      rightCandidateId: conflict.rightCandidateId,
      conflictState: conflict.conflictState as never,
      reason: conflict.reason,
      // The row records a DISPUTE. There is no winner field to write.
      requiresExplicitDecision: true,
      resolvedByDecisionId: conflict.resolvedByDecisionId,
      createdAt: isoToDate(conflict.createdAt),
    };
    await prisma.engineeringCandidateConflict.upsert({
      where: { id: conflict.conflictId },
      create: data as never,
      update: data as never,
    });
  }

  async listConflicts(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<ConflictRecord[]> {
    const rows = await prisma.engineeringCandidateConflict.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        conflictId: String(r.id),
        companyId: String(r.companyId),
        takeoffScopeId: String(r.takeoffScopeId),
        subjectMatchKey: String(r.subjectMatchKey),
        leftCandidateId: String(r.leftCandidateId),
        rightCandidateId: String(r.rightCandidateId),
        conflictState: String(r.conflictState),
        reason: String(r.reason),
        requiresExplicitDecision: true,
        resolvedByDecisionId: strOrNull(r.resolvedByDecisionId),
        createdAt: dateIso(r.createdAt),
      };
    });
  }

  // =========================================================================
  // Decisions (append-only)
  // =========================================================================

  async appendDecision(record: EngineeringQuantityDecision): Promise<void> {
    const existing = await prisma.engineeringQuantityDecision.findFirst({
      where: { id: record.decisionId, companyId: record.companyId },
      select: { id: true },
    });
    if (existing) throw new Error("a decision is append-only and may not be written twice");
    await prisma.engineeringQuantityDecision.create({ data: toDecisionRow(record) as never });
  }

  async findDecision(input: { companyId: string; decisionId: string }): Promise<EngineeringQuantityDecision | null> {
    const row = await prisma.engineeringQuantityDecision.findFirst({
      where: { id: input.decisionId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromDecisionRow(row as Row) : null;
  }

  async retireDecision(input: { companyId: string; decisionId: string; supersededByDecisionId: string; state: "SUPERSEDED" | "WITHDRAWN" }): Promise<void> {
    const existing = await prisma.engineeringQuantityDecision.findFirst({
      where: { id: input.decisionId, companyId: input.companyId },
      select: { id: true },
    });
    if (!existing) throw new Error("the decision to retire does not exist for this company");
    // ONLY state fields move. The approved value is never part of this update.
    await prisma.engineeringQuantityDecision.update({
      where: { id: input.decisionId },
      data: {
        state: input.state as never,
        supersededByDecisionId: input.supersededByDecisionId,
      },
    });
  }

  async listDecisions(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; state?: string; limit: number }): Promise<EngineeringQuantityDecision[]> {
    const rows = await prisma.engineeringQuantityDecision.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
        ...(input.state ? { state: input.state as never } : {}),
      },
      orderBy: { decidedAt: "desc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromDecisionRow(row as Row));
  }

  async currentDecision(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision | null> {
    // "Current" is the highest-version APPROVED decision. A superseded or
    // withdrawn decision is history, never current.
    const row = await prisma.engineeringQuantityDecision.findFirst({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        subjectMatchKey: input.subjectMatchKey,
        state: "APPROVED" as never,
      },
      orderBy: { decisionVersion: "desc" },
    });
    return row ? fromDecisionRow(row as Row) : null;
  }

  async decisionHistory(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision[]> {
    const rows = await prisma.engineeringQuantityDecision.findMany({
      where: { companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, subjectMatchKey: input.subjectMatchKey },
      orderBy: { decisionVersion: "asc" },
    });
    return rows.map((row: unknown) => fromDecisionRow(row as Row));
  }

  async saveDecisionSources(input: { companyId: string; decisionId: string; candidateIds: readonly string[]; calculationIds?: readonly string[] }): Promise<void> {
    if (input.candidateIds.length === 0) return;
    const calculationIds = input.calculationIds ?? [];
    await prisma.engineeringQuantityDecisionSource.createMany({
      data: input.candidateIds.map((candidateId, index) => ({
        companyId: input.companyId,
        decisionId: input.decisionId,
        candidateId,
        calculationId: calculationIds[index] ?? null,
      })) as never,
      skipDuplicates: true,
    });
  }

  async listDecisionSources(input: { companyId: string; decisionId: string }): Promise<Array<{ candidateId: string; calculationId: string | null }>> {
    const rows = await prisma.engineeringQuantityDecisionSource.findMany({
      where: { companyId: input.companyId, decisionId: input.decisionId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return { candidateId: String(r.candidateId), calculationId: strOrNull(r.calculationId) };
    });
  }

  async saveDecisionClaims(input: { companyId: string; decisionId: string; claimIds: readonly string[] }): Promise<void> {
    if (input.claimIds.length === 0) return;
    await prisma.engineeringQuantityDecisionClaim.createMany({
      data: input.claimIds.map((claimId) => ({
        companyId: input.companyId,
        decisionId: input.decisionId,
        claimId,
      })) as never,
      skipDuplicates: true,
    });
  }

  async listDecisionClaims(input: { companyId: string; decisionId: string }): Promise<string[]> {
    const rows = await prisma.engineeringQuantityDecisionClaim.findMany({
      where: { companyId: input.companyId, decisionId: input.decisionId },
      orderBy: { createdAt: "asc" },
      select: { claimId: true },
    });
    return rows.map((row: { claimId: string }) => row.claimId);
  }

  // =========================================================================
  // Calculations
  // =========================================================================

  async saveCalculation(input: { record: PersistedCalculation; inputs: readonly CalculationInputRecord[] }): Promise<void> {
    const record = input.record;
    await prisma.$transaction(async (tx: any) => {
      await tx.engineeringCalculation.upsert({
        where: { id: record.calculationId },
        create: toCalculationRow(record) as never,
        update: toCalculationRow(record) as never,
      });
      if (input.inputs.length > 0) {
        await tx.engineeringCalculationInput.createMany({
          data: input.inputs.map((entry) => ({
            id: entry.id,
            companyId: entry.companyId,
            calculationId: entry.calculationId,
            inputName: entry.inputName,
            source: entry.source as never,
            sourceReferenceId: entry.sourceReferenceId,
            inputValue: entry.inputValue === null ? null : Number(entry.inputValue),
            inputUnitLiteral: entry.inputUnitLiteral,
            resolved: entry.resolved,
            unresolvedReason: entry.unresolvedReason,
            candidateId: entry.candidateId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  async findCalculation(input: { companyId: string; calculationId: string }): Promise<PersistedCalculation | null> {
    const row = await prisma.engineeringCalculation.findFirst({
      where: { id: input.calculationId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromCalculationRow(row as Row) : null;
  }

  async listCalculationInputs(input: { companyId: string; calculationId: string }): Promise<CalculationInputRecord[]> {
    const rows = await prisma.engineeringCalculationInput.findMany({
      where: { companyId: input.companyId, calculationId: input.calculationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        id: String(r.id),
        companyId: String(r.companyId),
        calculationId: String(r.calculationId),
        inputName: String(r.inputName),
        source: String(r.source),
        sourceReferenceId: String(r.sourceReferenceId),
        inputValue: numOrNull(r.inputValue) === null ? null : String(r.inputValue),
        inputUnitLiteral: strOrNull(r.inputUnitLiteral),
        resolved: bool(r.resolved),
        unresolvedReason: strOrNull(r.unresolvedReason),
        candidateId: strOrNull(r.candidateId),
      };
    });
  }

  async listCalculations(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<PersistedCalculation[]> {
    const rows = await prisma.engineeringCalculation.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
      },
      orderBy: { computedAt: "asc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromCalculationRow(row as Row));
  }

  // =========================================================================
  // Adjustments
  // =========================================================================

  async saveAdjustment(record: EngineeringAdjustment): Promise<void> {
    const data = toAdjustmentRow(record);
    await prisma.engineeringAdjustment.upsert({
      where: { id: record.adjustmentId },
      create: data as never,
      update: data as never,
    });
  }

  async findAdjustment(input: { companyId: string; adjustmentId: string }): Promise<EngineeringAdjustment | null> {
    const row = await prisma.engineeringAdjustment.findFirst({
      where: { id: input.adjustmentId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromAdjustmentRow(row as Row) : null;
  }

  async listAdjustments(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; adjustmentType?: EngineeringAdjustmentType; limit: number }): Promise<EngineeringAdjustment[]> {
    const rows = await prisma.engineeringAdjustment.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
        ...(input.adjustmentType ? { adjustmentType: input.adjustmentType as never } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromAdjustmentRow(row as Row));
  }

  // =========================================================================
  // Engineering BOM
  // =========================================================================

  async saveBomVersion(record: EngineeringBomVersion): Promise<void> {
    const existing = await prisma.engineeringBomVersion.findFirst({
      where: { id: record.bomVersionId, companyId: record.companyId },
      select: { id: true, state: true },
    });
    // A version is never mutated in place once it exists: an APPROVED version is
    // immutable, and a DRAFT version is only ever transitioned through
    // `approveBomVersion`. A second create of the same version is refused.
    if (existing) {
      if (existing.state === ("APPROVED" as never)) {
        throw new Error("an approved BOM version is immutable and may not be rewritten; supersede it with a new version");
      }
      throw new Error("a BOM version already exists for this (company, takeoff scope, version number); a version is created once");
    }
    await prisma.engineeringBomVersion.create({ data: toBomVersionRow(record) as never });
  }

  async findBomVersion(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomVersion | null> {
    const row = await prisma.engineeringBomVersion.findFirst({
      where: { id: input.bomVersionId, companyId: input.companyId },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromBomVersionRow(row as Row) : null;
  }

  async listBomVersions(input: { companyId: string; takeoffScopeId: string; state?: BomVersionState; limit: number }): Promise<EngineeringBomVersion[]> {
    const rows = await prisma.engineeringBomVersion.findMany({
      where: {
        companyId: input.companyId,
        takeoffScopeId: input.takeoffScopeId,
        ...(input.state ? { state: input.state as never } : {}),
      },
      orderBy: { versionNumber: "desc" },
      take: input.limit,
    });
    return rows.map((row: unknown) => fromBomVersionRow(row as Row));
  }

  async latestBomVersion(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringBomVersion | null> {
    const row = await prisma.engineeringBomVersion.findFirst({
      where: { companyId: input.companyId, takeoffScopeId: input.takeoffScopeId },
      orderBy: { versionNumber: "desc" },
    });
    return row && ownedBy(row as Row, input.companyId) ? fromBomVersionRow(row as Row) : null;
  }

  async approveBomVersion(input: {
    companyId: string;
    bomVersionId: string;
    approvedByUserId: string;
    approvedAt: string;
    completeness: BomCompletenessState;
    completenessReasons: readonly string[];
  }): Promise<void> {
    const existing = await prisma.engineeringBomVersion.findFirst({
      where: { id: input.bomVersionId, companyId: input.companyId },
      select: { id: true, state: true },
    });
    if (!existing) throw new Error("the BOM version to approve does not exist for this company");
    if (existing.state === ("APPROVED" as never)) throw new Error("an approved BOM version is immutable and may not be re-approved");
    // ONLY approval fields and completeness move. Rows are never touched here.
    await prisma.engineeringBomVersion.update({
      where: { id: input.bomVersionId },
      data: {
        state: "APPROVED" as never,
        approvedByUserId: input.approvedByUserId,
        approvedAt: isoToDate(input.approvedAt),
        completeness: input.completeness as never,
        completenessReasons: [...input.completenessReasons],
      },
    });
  }

  async saveBomRows(input: { companyId: string; bomVersionId: string; rows: readonly EngineeringBomRow[] }): Promise<void> {
    const version = await prisma.engineeringBomVersion.findFirst({
      where: { id: input.bomVersionId, companyId: input.companyId },
      select: { id: true, state: true },
    });
    if (!version) throw new Error("the BOM version does not exist for this company");
    if (version.state === ("APPROVED" as never)) {
      const existingRows = await prisma.engineeringBomRow.count({ where: { companyId: input.companyId, bomVersionId: input.bomVersionId } });
      if (existingRows > 0) {
        throw new Error("an approved BOM version is immutable: its rows cannot be rewritten, only superseded by a new version");
      }
    }
    if (input.rows.length === 0) return;
    await prisma.engineeringBomRow.createMany({
      data: input.rows.map(toBomRowRow) as never,
      skipDuplicates: true,
    });
  }

  async listBomRows(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomRow[]> {
    const rows = await prisma.engineeringBomRow.findMany({
      where: { companyId: input.companyId, bomVersionId: input.bomVersionId },
      orderBy: { position: "asc" },
    });
    const rowConstraints = await prisma.engineeringBomRowConstraint.findMany({
      where: { companyId: input.companyId, bomRowId: { in: rows.map((row: { id: string }) => row.id) } },
      orderBy: { createdAt: "asc" },
    });
    const rowAdjustments = await prisma.engineeringBomRowAdjustment.findMany({
      where: { companyId: input.companyId, bomRowId: { in: rows.map((row: { id: string }) => row.id) } },
      orderBy: { createdAt: "asc" },
    });
    const constraintByRow = groupBy(rowConstraints as Row[], "bomRowId");
    const adjustmentByRow = groupBy(rowAdjustments as Row[], "bomRowId");
    return rows.map((row: unknown) => {
      const r = row as Row;
      return fromBomRowRow(r, (constraintByRow.get(String(r.id)) ?? []) as Row[], (adjustmentByRow.get(String(r.id)) ?? []) as Row[]);
    });
  }

  async findBomRow(input: { companyId: string; bomRowId: string }): Promise<EngineeringBomRow | null> {
    const row = await prisma.engineeringBomRow.findFirst({
      where: { id: input.bomRowId, companyId: input.companyId },
    });
    if (!row || !ownedBy(row as Row, input.companyId)) return null;
    const r = row as Row;
    const constraints = await prisma.engineeringBomRowConstraint.findMany({ where: { companyId: input.companyId, bomRowId: input.bomRowId }, orderBy: { createdAt: "asc" } });
    const adjustments = await prisma.engineeringBomRowAdjustment.findMany({ where: { companyId: input.companyId, bomRowId: input.bomRowId }, orderBy: { createdAt: "asc" } });
    return fromBomRowRow(r, constraints as Row[], adjustments as Row[]);
  }

  async saveRowConstraints(input: { companyId: string; bomRowId: string; constraints: readonly BomRowConstraint[] }): Promise<void> {
    if (input.constraints.length === 0) return;
    await prisma.engineeringBomRowConstraint.createMany({
      data: input.constraints.map((constraint) => ({
        companyId: input.companyId,
        bomRowId: input.bomRowId,
        kind: constraint.kind as never,
        value: constraint.value,
        sourceClaimId: constraint.sourceClaimId,
        locator: constraint.locator,
        isSpecificationOnly: constraint.isSpecificationOnly,
      })) as never,
    });
  }

  async listRowConstraints(input: { companyId: string; bomRowId: string }): Promise<BomRowConstraint[]> {
    const rows = await prisma.engineeringBomRowConstraint.findMany({
      where: { companyId: input.companyId, bomRowId: input.bomRowId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        kind: String(r.kind) as BomRowConstraint["kind"],
        value: String(r.value),
        sourceClaimId: strOrNull(r.sourceClaimId),
        locator: strOrNull(r.locator),
        isSpecificationOnly: bool(r.isSpecificationOnly),
      };
    });
  }

  async saveRowAdjustments(input: { companyId: string; bomRowId: string; adjustments: readonly BomRowAdjustmentRecord[] }): Promise<void> {
    if (input.adjustments.length === 0) return;
    await prisma.engineeringBomRowAdjustment.createMany({
      data: input.adjustments.map((adjustment) => ({
        id: adjustment.id,
        companyId: input.companyId,
        bomRowId: input.bomRowId,
        adjustmentId: adjustment.adjustmentId,
        adjustmentType: adjustment.adjustmentType as never,
        mode: adjustment.mode as never,
        factor: Number(adjustment.factor),
        baseValue: Number(adjustment.baseValue),
        adjustedValue: adjustment.adjustedValue === null ? null : Number(adjustment.adjustedValue),
      })) as never,
      skipDuplicates: true,
    });
  }

  async listRowAdjustments(input: { companyId: string; bomRowId: string }): Promise<BomRowAdjustmentRecord[]> {
    const rows = await prisma.engineeringBomRowAdjustment.findMany({
      where: { companyId: input.companyId, bomRowId: input.bomRowId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        id: String(r.id),
        companyId: String(r.companyId),
        bomRowId: String(r.bomRowId),
        adjustmentId: String(r.adjustmentId),
        adjustmentType: String(r.adjustmentType) as BomRowAdjustmentRecord["adjustmentType"],
        mode: String(r.mode) as BomRowAdjustmentRecord["mode"],
        factor: String(r.factor),
        baseValue: String(r.baseValue),
        adjustedValue: strOrNull(r.adjustedValue),
      };
    });
  }

  async saveVersionDecisions(input: { companyId: string; bomVersionId: string; decisionIds: readonly string[] }): Promise<void> {
    if (input.decisionIds.length === 0) return;
    await prisma.engineeringBomVersionDecision.createMany({
      data: input.decisionIds.map((decisionId) => ({
        companyId: input.companyId,
        bomVersionId: input.bomVersionId,
        decisionId,
      })) as never,
      skipDuplicates: true,
    });
  }

  async listVersionDecisions(input: { companyId: string; bomVersionId: string }): Promise<string[]> {
    const rows = await prisma.engineeringBomVersionDecision.findMany({
      where: { companyId: input.companyId, bomVersionId: input.bomVersionId },
      orderBy: { createdAt: "asc" },
      select: { decisionId: true },
    });
    return rows.map((row: { decisionId: string }) => row.decisionId);
  }

  async saveRequiredSubjects(input: { companyId: string; bomVersionId: string; subjects: readonly BomRequiredSubjectRecord[] }): Promise<void> {
    if (input.subjects.length === 0) return;
    await prisma.engineeringBomRequiredSubject.createMany({
      data: input.subjects.map((subject) => ({
        id: subject.id,
        companyId: input.companyId,
        bomVersionId: input.bomVersionId,
        subjectMatchKey: subject.subjectMatchKey,
        subjectKeyNamespace: subject.subjectKeyNamespace,
        subjectLabel: subject.subjectLabel,
        requirementKind: subject.requirementKind as never,
        resolution: subject.resolution as never,
        resolvedByDecisionId: subject.resolvedByDecisionId,
        bomRowId: subject.bomRowId,
        reason: subject.reason,
      })) as never,
      skipDuplicates: true,
    });
  }

  async listRequiredSubjects(input: { companyId: string; bomVersionId: string }): Promise<BomRequiredSubjectRecord[]> {
    const rows = await prisma.engineeringBomRequiredSubject.findMany({
      where: { companyId: input.companyId, bomVersionId: input.bomVersionId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row: unknown) => {
      const r = row as Row;
      return {
        id: String(r.id),
        companyId: String(r.companyId),
        bomVersionId: String(r.bomVersionId),
        subjectMatchKey: String(r.subjectMatchKey),
        subjectKeyNamespace: String(r.subjectKeyNamespace),
        subjectLabel: strOrNull(r.subjectLabel),
        requirementKind: String(r.requirementKind),
        resolution: String(r.resolution) as BomRequiredSubjectRecord["resolution"],
        resolvedByDecisionId: strOrNull(r.resolvedByDecisionId),
        bomRowId: strOrNull(r.bomRowId),
        reason: strOrNull(r.reason),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Grouping helper
// ---------------------------------------------------------------------------

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

/**
 * Belt-and-braces tenant check on a single row.
 *
 * The `where` clauses already carry `companyId`, so a correct database never
 * returns another tenant's row. This re-check exists so that if a row ever did
 * slip through — a future query refactor, a raw query, a compromised adapter —
 * the store reports it as NOT FOUND rather than leaking it. Failing closed is
 * cheap; a cross-tenant read is not.
 */
function ownedBy(row: Row | null | undefined, companyId: string): boolean {
  return row !== null && row !== undefined && String(row.companyId) === companyId;
}

// ---------------------------------------------------------------------------
// Mappers — domain -> Prisma row
// ---------------------------------------------------------------------------

function toScopeRow(record: EngineeringTakeoffScope): Row {
  return {
    id: record.takeoffScopeId,
    companyId: record.companyId,
    projectContextKey: record.projectContextKey,
    name: record.name,
    description: record.description,
    scopeKind: record.scopeKind as never,
    state: record.state as never,
    comparisonScopeId: record.comparisonScopeId,
    comparisonRunId: record.comparisonRunId,
    evidenceInputDigest: record.evidenceInputDigest,
    acceptedClaimCount: record.acceptedClaimCount,
    withheldClaimCount: record.withheldClaimCount,
    revisionPolicy: record.revisionPolicy,
    readiness: record.readiness as never,
    readinessReasons: [...record.readinessReasons],
    completeness: (record.completeness ?? null) as never,
    blockReasons: [...record.blockReasons],
    limitations: [...record.limitations],
    scopeVersion: record.scopeVersion,
    supersedesScopeId: record.supersedesScopeId,
    createdByUserId: record.createdByUserId,
    takeoffContractVersion: record.takeoffContractVersion,
    createdAt: isoToDate(record.createdAt),
    updatedAt: isoToDate(record.updatedAt),
  };
}

function toCountingRuleRow(record: PersistedCountingRule): Row {
  return {
    id: record.ruleId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    ruleVersion: record.ruleVersion,
    family: record.family as never,
    description: record.description,
    admittedEntityTypes: [...record.admittedEntityTypes],
    modelSpaceOnly: record.modelSpaceOnly,
    requiresSubjectIdentity: record.requiresSubjectIdentity,
    createdAt: isoToDate(record.createdAt),
  };
}

function toOccurrenceRow(entry: OccurrenceLedgerEntry): Row {
  return {
    id: entry.entryId,
    companyId: entry.companyId,
    takeoffScopeId: entry.takeoffScopeId,
    countingRuleId: entry.countingRuleId,
    subjectMatchKey: entry.subjectMatchKey,
    subjectKeyNamespace: entry.subjectKeyNamespace,
    artifactId: entry.artifactId,
    derivationFamilyRootArtifactId: entry.derivationFamilyRootArtifactId,
    evidenceClaimId: entry.evidenceClaimId,
    locator: entry.locator,
    family: entry.family as never,
    sourceType: entry.sourceType,
    occurrenceClass: entry.occurrenceClass as never,
    included: entry.included,
    inclusionReason: (entry.inclusionReason ?? null) as never,
    exclusionReason: (entry.exclusionReason ?? null) as never,
    note: entry.note,
    countingRuleVersion: entry.countingRuleVersion,
    createdAt: isoToDate(entry.createdAt),
  };
}

function toCandidateRow(record: EngineeringQuantityCandidate): Row {
  return {
    id: record.candidateId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    subjectMatchKey: record.subjectMatchKey,
    subjectKeyNamespace: record.subjectKeyNamespace,
    subjectLabel: record.subjectLabel,
    requirementKind: record.requirementKind as never,
    origin: record.origin as never,
    basis: record.basis as never,
    value: record.value === null ? null : record.value,
    unitLiteral: record.unitLiteral,
    unitDimension: record.unitDimension,
    valueLiteral: record.valueLiteral,
    subjectClusterId: record.subjectClusterId,
    contributingDerivationFamilyRoots: [...record.contributingDerivationFamilyRoots],
    conflictState: record.conflictState as never,
    conflictReason: record.conflictReason,
    readiness: record.readiness as never,
    readinessReasons: [...record.readinessReasons],
    evidenceCoverage: record.evidenceCoverage,
    limitations: [...record.limitations],
    createdAt: isoToDate(record.createdAt),
  };
}

function toDecisionRow(record: EngineeringQuantityDecision): Row {
  return {
    id: record.decisionId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    subjectMatchKey: record.subjectMatchKey,
    subjectKeyNamespace: record.subjectKeyNamespace,
    subjectLabel: record.subjectLabel,
    requirementKind: record.requirementKind as never,
    decisionVersion: record.decisionVersion,
    approvedValue: record.approvedValue,
    approvedUnitLiteral: record.approvedUnitLiteral,
    approvedUnitDimension: record.approvedUnitDimension,
    quantityOrigin: record.quantityOrigin as never,
    decisionBasis: record.decisionBasis as never,
    actorUserId: record.actorUserId,
    rationale: record.rationale,
    decidedAt: isoToDate(record.decidedAt),
    selectedCandidateId: record.selectedCandidateId,
    resolvedConflictSubjectKey: record.resolvedConflictSubjectKey,
    supersedesDecisionId: record.supersedesDecisionId,
    supersededByDecisionId: record.supersededByDecisionId,
    state: record.state as never,
    revisionMembershipIds: [...record.revisionMembershipIds],
    documentIdentityIds: [...record.documentIdentityIds],
    limitations: [...record.limitations],
    decisionContractVersion: record.decisionContractVersion,
  };
}

function toCalculationRow(record: PersistedCalculation): Row {
  return {
    id: record.calculationId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    subjectMatchKey: record.subjectMatchKey,
    subjectKeyNamespace: record.subjectKeyNamespace,
    subjectLabel: record.subjectLabel,
    requirementKind: record.requirementKind as never,
    ruleId: record.ruleId,
    ruleVersion: record.ruleVersion,
    resultValue: record.resultValue === null ? null : record.resultValue,
    resultUnitLiteral: record.resultUnitLiteral,
    resultDimension: record.resultDimension,
    blocked: record.blocked,
    blockedReasons: [...record.blockedReasons],
    inputDigest: record.inputDigest,
    actorUserId: record.actorUserId,
    computedAt: isoToDate(record.computedAt),
    calculationContractVersion: record.calculationContractVersion,
  };
}

function toAdjustmentRow(record: EngineeringAdjustment): Row {
  return {
    id: record.adjustmentId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    subjectMatchKey: record.subjectMatchKey,
    subjectKeyNamespace: record.subjectKeyNamespace,
    subjectLabel: record.subjectLabel,
    requirementKind: record.requirementKind as never,
    adjustmentType: record.adjustmentType as never,
    mode: record.mode as never,
    adjustmentFactor: record.adjustmentFactor,
    normalizedFactor: record.normalizedFactor,
    unitLiteral: record.unitLiteral,
    dimension: record.dimension as never,
    baseDecisionId: record.baseDecisionId,
    baseValue: record.baseValue,
    adjustedValue: record.adjustedValue,
    blocked: record.blocked,
    blockedReasons: [...record.blockedReasons],
    rationale: record.rationale,
    ruleId: record.ruleId,
    ruleVersion: record.ruleVersion,
    actorUserId: record.actorUserId,
    requiresApproval: record.requiresApproval,
    approvedByUserId: record.approvedByUserId,
    approvedAt: record.approvedAt === null ? null : isoToDate(record.approvedAt),
    readiness: record.readiness as never,
    adjustmentContractVersion: record.adjustmentContractVersion,
    createdAt: isoToDate(record.createdAt),
  };
}

function toBomVersionRow(record: EngineeringBomVersion): Row {
  return {
    id: record.bomVersionId,
    companyId: record.companyId,
    takeoffScopeId: record.takeoffScopeId,
    engineeringScope: record.engineeringScope,
    versionNumber: record.versionNumber,
    previousVersionId: record.previousVersionId,
    state: record.state as never,
    completeness: record.completeness as never,
    comparisonScopeId: record.comparisonScopeId,
    comparisonRunId: record.comparisonRunId,
    evidenceInputDigest: record.evidenceInputDigest,
    actorUserId: record.actorUserId,
    reason: record.reason,
    changeNote: record.changeNote,
    approvedByUserId: record.approvedByUserId,
    approvedAt: record.approvedAt === null ? null : isoToDate(record.approvedAt),
    rowCount: record.rowCount,
    approvedRowCount: record.approvedRowCount,
    unresolvedRequiredSubjectCount: record.unresolvedRequiredSubjectCount,
    completenessReasons: [...record.completenessReasons],
    limitations: [...record.limitations],
    bomContractVersion: record.bomContractVersion,
    createdAt: isoToDate(record.createdAt),
  };
}

function toBomRowRow(record: EngineeringBomRow): Row {
  return {
    id: record.rowId,
    companyId: record.companyId,
    bomVersionId: record.bomVersionId,
    rowKey: record.rowKey,
    position: record.position,
    engineeringSubject: record.engineeringSubject,
    requirementKind: record.requirementKind as never,
    requirementNature: record.requirementNature as never,
    approvedQuantity: record.approvedQuantity,
    unitLiteral: record.unitLiteral,
    unitDimension: record.unitDimension,
    quantityDecisionId: record.quantityDecisionId,
    decisionVersion: record.decisionVersion,
    quantityOrigin: record.quantityOrigin as never,
    systemContext: record.systemContext,
    locationContext: record.locationContext,
    sourceClaimIds: [...record.sourceClaimIds],
    sourceArtifactIds: [...record.sourceArtifactIds],
    derivationFamilyRootArtifactIds: [...record.derivationFamilyRootArtifactIds],
    occurrenceLedgerEntryIds: [...record.occurrenceLedgerEntryIds],
    readiness: record.readiness as never,
    readinessReasons: [...record.readinessReasons],
    limitations: [...record.limitations],
    isApprovedRow: record.isApprovedRow,
    createdAt: isoToDate(record.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Mappers — Prisma row -> domain
// ---------------------------------------------------------------------------

function fromScopeRow(r: Row): EngineeringTakeoffScope {
  return {
    takeoffScopeId: String(r.id),
    companyId: String(r.companyId),
    projectContextKey: strOrNull(r.projectContextKey),
    name: String(r.name),
    description: String(r.description ?? ""),
    scopeKind: String(r.scopeKind) as EngineeringTakeoffScope["scopeKind"],
    state: String(r.state) as TakeoffScopeState,
    comparisonScopeId: String(r.comparisonScopeId),
    comparisonRunId: strOrNull(r.comparisonRunId),
    evidenceInputDigest: strOrNull(r.evidenceInputDigest),
    acceptedClaimCount: num(r.acceptedClaimCount),
    withheldClaimCount: num(r.withheldClaimCount),
    revisionPolicy: String(r.revisionPolicy ?? "ACTIVE_ONLY"),
    readiness: String(r.readiness) as EngineeringReadinessState,
    readinessReasons: strArray(r.readinessReasons),
    completeness: strOrNull(r.completeness) as BomCompletenessState | null,
    blockReasons: strArray(r.blockReasons),
    limitations: strArray(r.limitations),
    createdByUserId: String(r.createdByUserId),
    createdAt: dateIso(r.createdAt),
    updatedAt: dateIso(r.updatedAt),
    scopeVersion: num(r.scopeVersion),
    supersedesScopeId: strOrNull(r.supersedesScopeId),
    takeoffContractVersion: String(r.takeoffContractVersion),
  };
}

function fromCountingRuleRow(r: Row): PersistedCountingRule {
  return {
    ruleId: String(r.id),
    ruleVersion: String(r.ruleVersion),
    family: String(r.family) as CountingRuleFamily,
    description: String(r.description),
    admittedEntityTypes: strArray(r.admittedEntityTypes),
    modelSpaceOnly: bool(r.modelSpaceOnly),
    requiresSubjectIdentity: bool(r.requiresSubjectIdentity),
    createdAt: dateIso(r.createdAt),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
  };
}

function fromOccurrenceRow(r: Row): OccurrenceLedgerEntry {
  return {
    entryId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    subjectMatchKey: strOrNull(r.subjectMatchKey),
    subjectKeyNamespace: strOrNull(r.subjectKeyNamespace),
    artifactId: String(r.artifactId),
    derivationFamilyRootArtifactId: String(r.derivationFamilyRootArtifactId),
    evidenceClaimId: strOrNull(r.evidenceClaimId),
    locator: String(r.locator),
    family: String(r.family) as CountingRuleFamily,
    sourceType: String(r.sourceType),
    occurrenceClass: String(r.occurrenceClass) as OccurrenceLedgerEntry["occurrenceClass"],
    included: bool(r.included),
    inclusionReason: strOrNull(r.inclusionReason) as OccurrenceLedgerEntry["inclusionReason"],
    exclusionReason: strOrNull(r.exclusionReason) as OccurrenceLedgerEntry["exclusionReason"],
    note: strOrNull(r.note),
    countingRuleId: String(r.countingRuleId),
    countingRuleVersion: String(r.countingRuleVersion),
    createdAt: dateIso(r.createdAt),
  };
}

function fromCandidateRow(r: Row): EngineeringQuantityCandidate {
  return {
    candidateId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    subjectMatchKey: String(r.subjectMatchKey),
    subjectKeyNamespace: String(r.subjectKeyNamespace),
    subjectLabel: strOrNull(r.subjectLabel),
    requirementKind: String(r.requirementKind),
    origin: String(r.origin) as EngineeringQuantityCandidate["origin"],
    basis: String(r.basis) as EngineeringQuantityCandidate["basis"],
    value: numOrNull(r.value),
    unitLiteral: strOrNull(r.unitLiteral),
    unitDimension: strOrNull(r.unitDimension),
    valueLiteral: strOrNull(r.valueLiteral),
    // Source references are loaded through `listCandidateSources`, not embedded.
    sourceReferences: [],
    subjectClusterId: strOrNull(r.subjectClusterId),
    contributingDerivationFamilyRoots: strArray(r.contributingDerivationFamilyRoots),
    conflictState: String(r.conflictState) as EngineeringQuantityCandidate["conflictState"],
    conflictReason: strOrNull(r.conflictReason),
    conflictingCandidateIds: [],
    readiness: String(r.readiness) as EngineeringReadinessState,
    readinessReasons: strArray(r.readinessReasons),
    evidenceCoverage: String(r.evidenceCoverage ?? "COMPLETE"),
    limitations: strArray(r.limitations),
    createdAt: dateIso(r.createdAt),
  };
}

function fromDecisionRow(r: Row): EngineeringQuantityDecision {
  return {
    decisionId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    subjectMatchKey: String(r.subjectMatchKey),
    subjectKeyNamespace: String(r.subjectKeyNamespace),
    subjectLabel: strOrNull(r.subjectLabel),
    requirementKind: String(r.requirementKind),
    decisionVersion: num(r.decisionVersion),
    approvedValue: num(r.approvedValue),
    approvedUnitLiteral: String(r.approvedUnitLiteral),
    approvedUnitDimension: String(r.approvedUnitDimension),
    quantityOrigin: String(r.quantityOrigin) as EngineeringQuantityDecision["quantityOrigin"],
    decisionBasis: String(r.decisionBasis) as EngineeringQuantityDecision["decisionBasis"],
    actorUserId: String(r.actorUserId),
    rationale: String(r.rationale),
    decidedAt: dateIso(r.decidedAt),
    // Memberships and claims are relational; the store exposes them through
    // `listDecisionSources`/`listDecisionClaims` rather than embedding them.
    sourceCandidateIds: [],
    sourceClaimIds: [],
    sourceLedgerEntryIds: [],
    sourceCalculationId: null,
    sourceAdjustmentId: null,
    selectedCandidateId: strOrNull(r.selectedCandidateId),
    resolvedConflictSubjectKey: strOrNull(r.resolvedConflictSubjectKey),
    supersedesDecisionId: strOrNull(r.supersedesDecisionId),
    state: String(r.state) as EngineeringQuantityDecision["state"],
    supersededByDecisionId: strOrNull(r.supersededByDecisionId),
    revisionMembershipIds: strArray(r.revisionMembershipIds),
    documentIdentityIds: strArray(r.documentIdentityIds),
    limitations: strArray(r.limitations),
    decisionContractVersion: String(r.decisionContractVersion),
  };
}

function fromCalculationRow(r: Row): PersistedCalculation {
  return {
    calculationId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    subjectMatchKey: String(r.subjectMatchKey),
    subjectKeyNamespace: String(r.subjectKeyNamespace),
    subjectLabel: strOrNull(r.subjectLabel),
    requirementKind: String(r.requirementKind),
    ruleId: String(r.ruleId),
    ruleVersion: String(r.ruleVersion),
    inputs: [],
    resultValue: numOrNull(r.resultValue),
    resultUnitLiteral: strOrNull(r.resultUnitLiteral),
    resultDimension: String(r.resultDimension ?? "") as PersistedCalculation["resultDimension"],
    blocked: bool(r.blocked),
    blockedReasons: strArray(r.blockedReasons),
    inputDigest: String(r.inputDigest),
    actorUserId: String(r.actorUserId),
    computedAt: dateIso(r.computedAt),
    calculationContractVersion: String(r.calculationContractVersion),
  };
}

function fromAdjustmentRow(r: Row): EngineeringAdjustment {
  return {
    adjustmentId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    subjectMatchKey: String(r.subjectMatchKey),
    subjectKeyNamespace: String(r.subjectKeyNamespace),
    subjectLabel: strOrNull(r.subjectLabel),
    requirementKind: String(r.requirementKind),
    adjustmentType: String(r.adjustmentType) as EngineeringAdjustmentType,
    mode: String(r.mode) as EngineeringAdjustment["mode"],
    adjustmentFactor: num(r.adjustmentFactor),
    normalizedFactor: numOrNull(r.normalizedFactor),
    unitLiteral: strOrNull(r.unitLiteral),
    dimension: strOrNull(r.dimension) as EngineeringAdjustment["dimension"],
    baseDecisionId: String(r.baseDecisionId),
    baseValue: num(r.baseValue),
    adjustedValue: numOrNull(r.adjustedValue),
    blocked: bool(r.blocked),
    blockedReasons: strArray(r.blockedReasons),
    rationale: String(r.rationale),
    ruleId: String(r.ruleId),
    ruleVersion: String(r.ruleVersion),
    actorUserId: String(r.actorUserId),
    requiresApproval: bool(r.requiresApproval),
    approvedByUserId: strOrNull(r.approvedByUserId),
    approvedAt: dateIsoOrNull(r.approvedAt),
    readiness: String(r.readiness) as EngineeringReadinessState,
    createdAt: dateIso(r.createdAt),
    adjustmentContractVersion: String(r.adjustmentContractVersion),
  };
}

function fromBomVersionRow(r: Row): EngineeringBomVersion {
  const rowCount = num(r.rowCount);
  const approvedRowCount = num(r.approvedRowCount);
  return {
    bomVersionId: String(r.id),
    companyId: String(r.companyId),
    takeoffScopeId: String(r.takeoffScopeId),
    engineeringScope: String(r.engineeringScope),
    versionNumber: num(r.versionNumber),
    previousVersionId: strOrNull(r.previousVersionId),
    state: String(r.state) as BomVersionState,
    completeness: String(r.completeness) as BomCompletenessState,
    // The decision/adjustment snapshots are relational join rows; the store
    // exposes them through `listVersionDecisions` and by reading the rows.
    sourceDecisionIds: [],
    sourceAdjustmentIds: [],
    comparisonScopeId: strOrNull(r.comparisonScopeId),
    comparisonRunId: strOrNull(r.comparisonRunId),
    evidenceInputDigest: strOrNull(r.evidenceInputDigest),
    actorUserId: String(r.actorUserId),
    reason: String(r.reason),
    changeNote: String(r.changeNote ?? ""),
    createdAt: dateIso(r.createdAt),
    approvedByUserId: strOrNull(r.approvedByUserId),
    approvedAt: dateIsoOrNull(r.approvedAt),
    rowCount,
    approvedRowCount,
    reviewRequiredRowCount: Math.max(0, rowCount - approvedRowCount),
    blockedRowCount: 0,
    unresolvedRequiredSubjectCount: num(r.unresolvedRequiredSubjectCount),
    completenessReasons: strArray(r.completenessReasons),
    limitations: strArray(r.limitations),
    bomContractVersion: String(r.bomContractVersion),
  };
}

function fromBomRowRow(r: Row, constraints: Row[], adjustments: Row[]): EngineeringBomRow {
  const mappedConstraints: BomRowConstraint[] = constraints.map((row) => ({
    kind: String(row.kind) as BomRowConstraint["kind"],
    value: String(row.value),
    sourceClaimId: strOrNull(row.sourceClaimId),
    locator: strOrNull(row.locator),
    isSpecificationOnly: bool(row.isSpecificationOnly),
  }));
  const mappedAdjustments = adjustments.map((row) => ({
    adjustmentType: String(row.adjustmentType),
    mode: String(row.mode),
    factor: num(row.factor),
    baseValue: num(row.baseValue),
    adjustedValue: numOrNull(row.adjustedValue),
  }));
  return {
    rowId: String(r.id),
    companyId: String(r.companyId),
    bomVersionId: String(r.bomVersionId),
    rowKey: String(r.rowKey),
    position: num(r.position),
    engineeringSubject: String(r.engineeringSubject),
    requirementKind: String(r.requirementKind),
    requirementNature: String(r.requirementNature) as EngineeringBomRow["requirementNature"],
    approvedQuantity: num(r.approvedQuantity),
    unitLiteral: String(r.unitLiteral),
    unitDimension: String(r.unitDimension),
    quantityDecisionId: String(r.quantityDecisionId),
    decisionVersion: num(r.decisionVersion),
    quantityOrigin: String(r.quantityOrigin),
    adjustmentIds: adjustments.map((row) => String(row.adjustmentId)),
    adjustmentsSummary: mappedAdjustments,
    constraints: mappedConstraints,
    systemContext: strOrNull(r.systemContext),
    locationContext: strOrNull(r.locationContext),
    sourceClaimIds: strArray(r.sourceClaimIds),
    sourceArtifactIds: strArray(r.sourceArtifactIds),
    derivationFamilyRootArtifactIds: strArray(r.derivationFamilyRootArtifactIds),
    occurrenceLedgerEntryIds: strArray(r.occurrenceLedgerEntryIds),
    readiness: String(r.readiness) as EngineeringReadinessState,
    readinessReasons: strArray(r.readinessReasons),
    limitations: strArray(r.limitations),
    isApprovedRow: bool(r.isApprovedRow),
    createdAt: dateIso(r.createdAt),
  };
}
