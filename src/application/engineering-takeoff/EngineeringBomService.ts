/**
 * Phase 2A-11 — Engineering BOM Service.
 *
 * It assembles approved engineering quantity decisions into a versioned,
 * product-agnostic Engineering BOM, and it honours two absolutes:
 *
 * 1. A BOM version is IMMUTABLE once approved. Any change produces a NEW version
 *    that points at the one it replaces. Prior rows are never touched.
 * 2. A BOM carries ENGINEERING content only. It has no price, no supplier, no
 *    quotation line, and no procurement order quantity. A BOM row may name a
 *    manufacturer or a tender model as a SPECIFICATION CONSTRAINT, and even then
 *    the row creates no product selection and no supplier.
 *
 * A row without an approved decision is carried at REVIEW_REQUIRED with its
 * reasons stated, so an approved SUBSET is a real, visible state rather than a
 * silently-implied whole.
 */

import {
  buildBomRow,
  buildBomVersionId,
  computeBomCompleteness,
  computeBomCompletenessWithCoverage,
  decisionBomReadiness,
  detectBomVersionMutation,
  engineeringId,
  nextBomVersionNumber,
  weakestRowReadiness,
  type BomRequiredSubject,
  type BomRowConstraint,
  type BomSubjectResolution,
  type EngineeringBomRow,
  type EngineeringBomVersion,
  type EngineeringQuantityDecision,
  type EngineeringReadinessState,
} from "@/src/domain/engineering-takeoff";

import type { BomRequiredSubjectRecord, BomRowAdjustmentRecord, EngineeringClockPort, EngineeringStore } from "./ports";

// ---------------------------------------------------------------------------
// Requests / results
// ---------------------------------------------------------------------------

export type CreateBomVersionRequest = {
  companyId: string;
  takeoffScopeId: string;
  engineeringScope: string;
  /** The decisions to snapshot as rows. Only decisions in this scope are accepted. */
  decisionIds: readonly string[];
  actorUserId: string;
  reason: string;
  changeNote?: string;
  /** Serialized engineering subject per decision id, so a row has a readable subject. */
  engineeringSubjects?: Readonly<Record<string, string>>;
  /** Specification constraints per decision id. Manufacturer/tender model are SPECIFICATION ONLY. */
  constraints?: Readonly<Record<string, readonly BomRowConstraint[]>>;
  systemContexts?: Readonly<Record<string, string | null>>;
  locationContexts?: Readonly<Record<string, string | null>>;
};

export type CreateBomVersionResult = {
  version: EngineeringBomVersion;
  rows: EngineeringBomRow[];
  skippedDecisionIds: string[];
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type EngineeringBomDeps = {
  store: EngineeringStore;
  clock: EngineeringClockPort;
};

export class EngineeringBomService {
  constructor(private readonly deps: EngineeringBomDeps) {}

  /**
   * Creates a new BOM version snapshotting the named decisions.
   *
   * A superseded or withdrawn decision is SKIPPED and reported rather than
   * silently carried, because a BOM must not treat retired engineering truth as
   * current.
   */
  async createBomVersion(request: CreateBomVersionRequest): Promise<CreateBomVersionResult> {
    const now = this.deps.clock.now();
    const scope = await this.deps.store.findScope({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId });
    if (!scope) throw new Error(`the engineering takeoff scope ${request.takeoffScopeId} does not exist for this company`);

    const previous = await this.deps.store.latestBomVersion({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId });
    if (previous?.state === "APPROVED") {
      // An approved predecessor is retained untouched; the new version simply
      // points at it. This branch exists to make the intent explicit in code.
    }

    const versionNumber = nextBomVersionNumber(
      await this.deps.store.listBomVersions({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId, limit: 1000 }),
      { takeoffScopeId: request.takeoffScopeId },
    );
    const bomVersionId = buildBomVersionId({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId, versionNumber });

    const decisions: EngineeringQuantityDecision[] = [];
    const skippedDecisionIds: string[] = [];
    for (const decisionId of request.decisionIds) {
      const decision = await this.deps.store.findDecision({ companyId: request.companyId, decisionId });
      // A decision from another scope or another tenant is not engineering truth
      // this BOM may snapshot at all, so it is skipped outright and reported.
      if (!decision || decision.takeoffScopeId !== request.takeoffScopeId) {
        skippedDecisionIds.push(decisionId);
        continue;
      }
      // The decision lifecycle is APPROVED | SUPERSEDED | WITHDRAWN. A retired
      // decision is no longer the quantity of record, so a BOM built afterwards
      // must not carry it as current truth: it is skipped and reported instead.
      if (decision.state !== "APPROVED") {
        skippedDecisionIds.push(decisionId);
        continue;
      }
      decisions.push(decision);
    }

    const rows: EngineeringBomRow[] = [];
    for (const [index, decision] of decisions.entries()) {
      const adjustments = await this.deps.store.listAdjustments({
        companyId: request.companyId,
        takeoffScopeId: request.takeoffScopeId,
        subjectMatchKey: decision.subjectMatchKey,
        limit: 200,
      });
      const readiness = decisionBomReadiness(decision);
      const composed = composeApprovedQuantity(decision, adjustments);
      const row = buildBomRow({
        bomVersionId,
        companyId: request.companyId,
        position: index + 1,
        engineeringSubject: request.engineeringSubjects?.[decision.decisionId] ?? fallbackSubject(decision),
        decision,
        adjustments,
        constraints: request.constraints?.[decision.decisionId] ?? [],
        systemContext: request.systemContexts?.[decision.decisionId] ?? null,
        locationContext: request.locationContexts?.[decision.decisionId] ?? null,
        // The approved engineering quantity is the decision's value, or the
        // composed adjusted value when every allowance applied cleanly. A
        // blocked allowance keeps the base value visible rather than inflating it.
        approvedQuantity: composed.value ?? decision.approvedValue,
        unitLiteral: decision.approvedUnitLiteral,
        unitDimension: decision.approvedUnitDimension,
        sourceArtifactIds: [],
        derivationFamilyRootArtifactIds: [],
        occurrenceLedgerEntryIds: collectLedgerEntryIds(decision),
        readiness: readiness.readiness,
        readinessReasons: readiness.reasons,
        limitations: decision.limitations,
        createdAt: now,
      });
      rows.push(row);
    }

    const completeness = computeBomCompleteness(rows);

    // ------------------------------------------------------------------
    // Required-subject coverage manifest.
    //
    // Rows are built only from APPROVED decisions, so `completeness` above can
    // only ever judge the rows that exist. The governed scope may require far
    // more subjects than it has approved decisions, and an approved subset must
    // never be presented as a complete BOM. We therefore derive the FULL
    // required-subject set from the governed scope and record how this version
    // resolved every entry.
    // ------------------------------------------------------------------
    const coverage = await this.deriveCoverage({ companyId: request.companyId, takeoffScopeId: request.takeoffScopeId, rows, decisions });
    const coverageCompleteness = computeBomCompletenessWithCoverage({ rows, requiredSubjects: coverage });

    const version: EngineeringBomVersion = {
      bomVersionId,
      companyId: request.companyId,
      takeoffScopeId: request.takeoffScopeId,
      engineeringScope: request.engineeringScope,
      versionNumber,
      previousVersionId: previous?.bomVersionId ?? null,
      state: "DRAFT",
      completeness: coverageCompleteness.completeness,
      sourceDecisionIds: decisions.map((decision) => decision.decisionId),
      sourceAdjustmentIds: [...new Set(rows.flatMap((row) => row.adjustmentIds))].sort(),
      comparisonScopeId: scope.comparisonScopeId,
      comparisonRunId: scope.comparisonRunId,
      evidenceInputDigest: scope.evidenceInputDigest,
      actorUserId: request.actorUserId,
      reason: request.reason,
      changeNote: request.changeNote ?? "",
      createdAt: now,
      approvedByUserId: null,
      approvedAt: null,
      rowCount: rows.length,
      approvedRowCount: coverageCompleteness.approvedRowCount,
      reviewRequiredRowCount: coverageCompleteness.reviewRequiredRowCount,
      blockedRowCount: coverageCompleteness.blockedRowCount,
      unresolvedRequiredSubjectCount: coverageCompleteness.unresolvedSubjectCount,
      completenessReasons: coverageCompleteness.reasons,
      limitations: scope.limitations,
      bomContractVersion: "2a-11.bom.v1",
    };

    await this.deps.store.saveBomVersion(version);
    await this.deps.store.saveVersionDecisions({
      companyId: request.companyId,
      bomVersionId,
      decisionIds: decisions.map((decision) => decision.decisionId),
    });
    await this.deps.store.saveBomRows({ companyId: request.companyId, bomVersionId, rows });

    // Persist the coverage manifest, so the unresolved required work stays
    // visible in the durable record and not only in this call's memory.
    const coverageRecords: BomRequiredSubjectRecord[] = coverage.map((subject) => ({
      id: engineeringId("ebrs", "bom-required-subject", [request.companyId, bomVersionId, subject.subjectMatchKey]),
      companyId: request.companyId,
      bomVersionId,
      subjectMatchKey: subject.subjectMatchKey,
      subjectKeyNamespace: subject.subjectKeyNamespace,
      subjectLabel: subject.subjectLabel,
      requirementKind: subject.requirementKind,
      resolution: subject.resolution,
      resolvedByDecisionId: subject.resolvedByDecisionId,
      bomRowId: subject.bomRowId,
      reason: subject.reason,
    }));
    if (coverageRecords.length > 0) {
      await this.deps.store.saveRequiredSubjects({ companyId: request.companyId, bomVersionId, subjects: coverageRecords });
    }

    for (const row of rows) {
      if (row.constraints.length > 0) {
        await this.deps.store.saveRowConstraints({ companyId: request.companyId, bomRowId: row.rowId, constraints: row.constraints });
      }
      const adjustmentRecords: BomRowAdjustmentRecord[] = await this.rowAdjustmentRecords(request.companyId, row, decisions);
      if (adjustmentRecords.length > 0) {
        await this.deps.store.saveRowAdjustments({ companyId: request.companyId, bomRowId: row.rowId, adjustments: adjustmentRecords });
      }
    }

    return { version, rows, skippedDecisionIds };
  }

  /**
   * Approves a DRAFT BOM version.
   *
   * The approval writes ONLY the approval fields and the recomputed
   * completeness. Rows are not modified by an approval, so approving a version
   * cannot silently change an engineering quantity.
   */
  async approveBomVersion(input: {
    companyId: string;
    bomVersionId: string;
    approvedByUserId: string;
    approvalNote?: string;
  }): Promise<EngineeringBomVersion> {
    const version = await this.deps.store.findBomVersion({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    if (!version) throw new Error("the BOM version to approve does not exist for this company");
    if (version.state === "APPROVED") throw new Error("this BOM version is already approved and is immutable");
    if (version.state === "SUPERSEDED" || version.state === "WITHDRAWN") {
      throw new Error(`this BOM version is ${version.state} and can no longer be approved`);
    }

    const rows = await this.deps.store.listBomRows({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    const requiredSubjects = await this.deps.store.listRequiredSubjects({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    // Re-evaluate against the PERSISTED required-subject manifest, so an approved
    // subset can never be re-approved as a complete BOM.
    const completeness = computeBomCompletenessWithCoverage({
      rows,
      requiredSubjects: requiredSubjects.map((subject) => ({
        subjectMatchKey: subject.subjectMatchKey,
        subjectKeyNamespace: subject.subjectKeyNamespace,
        subjectLabel: subject.subjectLabel,
        requirementKind: subject.requirementKind,
        resolution: subject.resolution,
        resolvedByDecisionId: subject.resolvedByDecisionId,
        bomRowId: subject.bomRowId,
        reason: subject.reason,
      })),
    });
    const now = this.deps.clock.now();

    await this.deps.store.approveBomVersion({
      companyId: input.companyId,
      bomVersionId: input.bomVersionId,
      approvedByUserId: input.approvedByUserId,
      approvedAt: now,
      completeness: completeness.completeness,
      completenessReasons: completeness.reasons,
    });

    const updated = await this.deps.store.findBomVersion({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    if (!updated) throw new Error("the BOM version disappeared while it was being approved");
    return updated;
  }

  async findBomVersion(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomVersion | null> {
    return this.deps.store.findBomVersion(input);
  }

  async listBomVersions(input: { companyId: string; takeoffScopeId: string; limit?: number }): Promise<EngineeringBomVersion[]> {
    return this.deps.store.listBomVersions({ ...input, limit: input.limit ?? 200 });
  }

  /** The latest version regardless of state. */
  async latestBomVersion(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringBomVersion | null> {
    return this.deps.store.latestBomVersion(input);
  }

  async listRows(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomRow[]> {
    return this.deps.store.listBomRows(input);
  }

  /**
   * Proves the immutability mechanism: an attempt to change an APPROVED version
   * is detected rather than silently applied.
   */
  async detectAttemptedMutation(input: { companyId: string; bomVersionId: string; candidateHeader: Partial<EngineeringBomVersion> }): Promise<{ mutated: boolean; fields: string[] }> {
    const existing = await this.deps.store.findBomVersion({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    if (!existing) throw new Error("the BOM version does not exist for this company");
    const rows = await this.deps.store.listBomRows({ companyId: input.companyId, bomVersionId: input.bomVersionId });
    // The incoming version is reconstructed by overlaying the caller's header
    // change onto the stored version; rows are assumed unchanged so any header
    // change is what the detector reports.
    const incoming: EngineeringBomVersion = { ...existing, ...input.candidateHeader };
    return detectBomVersionMutation({ existing, existingRows: rows, incoming, incomingRows: rows });
  }

  /** The weakest readiness across the rows, for a reviewer deciding what to do next. */
  async weakestReadiness(input: { companyId: string; bomVersionId: string }): Promise<EngineeringReadinessState | null> {
    const rows = await this.deps.store.listBomRows(input);
    return weakestRowReadiness(rows);
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Derives the governed REQUIRED SUBJECT SET of a takeoff scope and records how
   * the new version resolved each subject.
   *
   * A subject is required when the scope carries governed engineering work for
   * it: an engineering quantity DECISION (any lifecycle state) or a CANDIDATE.
   * The set is the union, so:
   *
   * - a subject with an approved decision is CARRIED_BY_ROW;
   * - a subject whose only decision is SUPERSEDED/WITHDRAWN is DECISION_RETIRED;
   * - a subject with candidates but no decision is CANDIDATE_WITHOUT_DECISION;
   * - a subject whose candidates are unresolved/conflicting is
   *   UNRESOLVED_CANDIDATE;
   * - a subject with neither is NO_DECISION (only reachable when a caller named a
   *   subject explicitly, which the union above cannot produce, so it is a
   *   defensive value).
   *
   * The union is intentionally overset rather than underset: it is safer to
   * report one extra required subject than to silently drop governed work.
   */
  private async deriveCoverage(input: {
    companyId: string;
    takeoffScopeId: string;
    rows: readonly EngineeringBomRow[];
    decisions: readonly EngineeringQuantityDecision[];
  }): Promise<BomRequiredSubject[]> {
    const rowByKey = new Map(input.rows.map((row) => [row.quantityDecisionId, row]));

    // Every decision in the scope, regardless of state.
    const allDecisions = await this.deps.store.listDecisions({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      limit: 5000,
    });
    // Every candidate in the scope, so a subject with candidates but no decision
    // stays visible as required work.
    const candidates = await this.deps.store.listCandidates({
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      limit: 5000,
    });

    type Acc = { subjectMatchKey: string; subjectKeyNamespace: string; subjectLabel: string | null; requirementKind: string };
    const subjects = new Map<string, Acc>();
    for (const decision of allDecisions) {
      subjects.set(decision.subjectMatchKey, {
        subjectMatchKey: decision.subjectMatchKey,
        subjectKeyNamespace: decision.subjectKeyNamespace,
        subjectLabel: decision.subjectLabel,
        requirementKind: decision.requirementKind,
      });
    }
    for (const candidate of candidates) {
      if (subjects.has(candidate.subjectMatchKey)) continue;
      subjects.set(candidate.subjectMatchKey, {
        subjectMatchKey: candidate.subjectMatchKey,
        subjectKeyNamespace: candidate.subjectKeyNamespace,
        subjectLabel: candidate.subjectLabel,
        requirementKind: candidate.requirementKind,
      });
    }

    const coverage: BomRequiredSubject[] = [];
    for (const subject of subjects.values()) {
      const decisionsForSubject = allDecisions
        .filter((decision) => decision.subjectMatchKey === subject.subjectMatchKey)
        .sort((left, right) => right.decisionVersion - left.decisionVersion);
      const currentApproved = decisionsForSubject.find((decision) => decision.state === "APPROVED") ?? null;
      const row = currentApproved ? rowByKey.get(currentApproved.decisionId) ?? null : null;

      if (row && currentApproved) {
        coverage.push({
          ...subject,
          resolution: "CARRIED_BY_ROW",
          resolvedByDecisionId: currentApproved.decisionId,
          bomRowId: row.rowId,
          reason: null,
        });
        continue;
      }

      let resolution: BomSubjectResolution;
      let reason: string;
      if (decisionsForSubject.length > 0 && !currentApproved) {
        resolution = "DECISION_RETIRED";
        reason = "every engineering decision for this subject is superseded or withdrawn, so the subject has no current approved quantity";
      } else if (decisionsForSubject.length === 0) {
        const subjectCandidates = candidates.filter((candidate) => candidate.subjectMatchKey === subject.subjectMatchKey);
        if (subjectCandidates.some((candidate) => candidate.conflictState !== "UNDISPUTED" || candidate.readiness === "BLOCKED")) {
          resolution = "UNRESOLVED_CANDIDATE";
          reason = "this subject has conflicting or blocked candidates and no engineering decision has resolved them";
        } else if (subjectCandidates.length > 0) {
          resolution = "CANDIDATE_WITHOUT_DECISION";
          reason = "this subject has governed candidates but no engineering decision has been taken";
        } else {
          resolution = "NO_DECISION";
          reason = "this subject is required by the governed scope but has neither a decision nor a candidate";
        }
      } else {
        // A current approved decision exists but produced no row: it was outside
        // the requested decision set, so the subject is still unresolved here.
        resolution = "CANDIDATE_WITHOUT_DECISION";
        reason = "this subject's approved decision was not included in this BOM version, so the subject is not carried";
      }

      coverage.push({
        ...subject,
        resolution,
        resolvedByDecisionId: null,
        bomRowId: null,
        reason,
      });
    }

    return coverage;
  }

  private async rowAdjustmentRecords(companyId: string, row: EngineeringBomRow, decisions: readonly EngineeringQuantityDecision[]): Promise<BomRowAdjustmentRecord[]> {
    const decision = decisions.find((candidate) => candidate.decisionId === row.quantityDecisionId);
    if (!decision) return [];
    const records: BomRowAdjustmentRecord[] = [];
    for (const adjustmentId of row.adjustmentIds) {
      const adjustment = await this.deps.store.findAdjustment({ companyId, adjustmentId });
      if (!adjustment) continue;
      records.push({
        id: `${row.rowId}:adj:${adjustment.adjustmentId}`,
        companyId,
        bomRowId: row.rowId,
        adjustmentId: adjustment.adjustmentId,
        adjustmentType: adjustment.adjustmentType,
        mode: adjustment.mode,
        factor: String(adjustment.adjustmentFactor),
        baseValue: String(adjustment.baseValue),
        adjustedValue: adjustment.adjustedValue === null ? null : String(adjustment.adjustedValue),
      });
    }
    return records;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A readable subject when the caller supplied none. Never invents a product. */
function fallbackSubject(decision: EngineeringQuantityDecision): string {
  return decision.subjectLabel ?? decision.subjectMatchKey;
}

/**
 * The 2A-10 claims a decision rests on.
 *
 * The decision carries claim ids directly (it recorded them from the candidates
 * it considered), so the row lineage is exact rather than reconstructed.
 */
function collectClaimIds(decision: EngineeringQuantityDecision): string[] {
  return [...new Set(decision.sourceClaimIds)].sort();
}

/** The 2A-10 ledger entries a decision's counted candidates rested on. */
function collectLedgerEntryIds(decision: EngineeringQuantityDecision): string[] {
  return [...new Set(decision.sourceLedgerEntryIds)].sort();
}

/**
 * Composes approved allowances onto the base quantity.
 *
 * A blocked allowance makes the composition blocked, in which case the row keeps
 * the BASE approved value — never a partially-adjusted number.
 */
function composeApprovedQuantity(decision: EngineeringQuantityDecision, adjustments: readonly { blocked: boolean; adjustmentType: string; mode: string; adjustmentFactor: number }[]): { value: number | null; blocked: boolean } {
  if (adjustments.length === 0) return { value: decision.approvedValue, blocked: false };
  if (adjustments.some((adjustment) => adjustment.blocked)) return { value: null, blocked: true };
  let value = decision.approvedValue;
  const ordered = [...adjustments].sort((left, right) => (left.mode === "ABSOLUTE_ADDITION" ? 1 : 0) - (right.mode === "ABSOLUTE_ADDITION" ? 1 : 0));
  for (const adjustment of ordered) {
    if (adjustment.mode === "PERCENTAGE") value = value * (1 + adjustment.adjustmentFactor / 100);
    else if (adjustment.mode === "MULTIPLIER") value = value * adjustment.adjustmentFactor;
    else value = value + adjustment.adjustmentFactor;
  }
  return { value, blocked: false };
}
