/**
 * Phase 2A-11: application-layer ports for engineering takeoff + governed BOM.
 *
 * Everything the takeoff service, the decision service, the calculation
 * service, the adjustment service, and the BOM service depend on is declared
 * here. The Prisma implementation lives in
 * `src/infrastructure/engineering-takeoff`; the deterministic in-memory
 * implementation lives beside the tests so the real services are exercised
 * rather than a re-implementation of them.
 *
 * Two contract rules are load-bearing:
 *
 * 1. The engineering store can only ever write ENGINEERING records. There is no
 *    method that could create a Quotation, QuotationLine, Invoice,
 *    ProductSelection, Supplier, ProcurementRequirement, Rfq, Offer, Award, or
 *    PurchaseOrder. The no-promotion guarantee is structural, not a convention.
 *
 * 2. Every read and every write is company-scoped. No method accepts a company
 *    id without requiring it, and the authenticated company context always
 *    supplies it.
 */

import type {
  BomRowConstraint,
  CountingRule,
  CountingRuleFamily,
  CrossDocumentHandoffLike,
  EngineeringAdjustment,
  AdjustmentMode,
  EngineeringAdjustmentType,
  BomCompletenessState,
  EngineeringBomRow,
  EngineeringBomVersion,
  BomVersionState,
  BomSubjectResolution,
  EngineeringCalculationRecord,
  EngineeringGovernanceView,
  EngineeringQuantityCandidate,
  EngineeringQuantityDecision,
  EngineeringReadinessState,
  EngineeringTakeoffScope,
  TakeoffScopeState,
  OccurrenceLedgerEntry,
} from "@/src/domain/engineering-takeoff";

export type { EngineeringGovernanceView };

/**
 * Domain types the ports expose in their signatures, re-exported so an
 * implementation of a port (the Prisma store, the in-memory store) can name them
 * without reaching into the domain barrel directly. Names that the application
 * barrel already exports from another module are deliberately omitted here to
 * keep the barrel unambiguous.
 */
export type {
  AdjustmentMode,
  BomCompletenessState,
  BomRowConstraint,
  BomSubjectResolution,
  BomVersionState,
  CountingRule,
  CountingRuleFamily,
  CrossDocumentHandoffLike,
  EngineeringAdjustment,
  EngineeringAdjustmentType,
  EngineeringBomRow,
  EngineeringBomVersion,
  EngineeringCalculationRecord,
  EngineeringQuantityCandidate,
  EngineeringQuantityDecision,
  EngineeringReadinessState,
  EngineeringTakeoffScope,
  TakeoffScopeState,
  OccurrenceLedgerEntry,
};

/**
 * Domain types the ports expose in their signatures, re-exported so an
 * implementation of a port (the Prisma store, the in-memory store) can name them
 * without reaching into the domain barrel directly.
 */


// ---------------------------------------------------------------------------
// Clock / ids
// ---------------------------------------------------------------------------

export interface EngineeringClockPort {
  now(): string;
}

export interface EngineeringIdPort {
  next(prefix: string): string;
}

// ---------------------------------------------------------------------------
// Scope persistence
// ---------------------------------------------------------------------------

export interface EngineeringScopeStore {
  saveScope(record: EngineeringTakeoffScope): Promise<EngineeringTakeoffScope>;
  findScope(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringTakeoffScope | null>;
  listScopes(input: { companyId: string; comparisonScopeId?: string; state?: TakeoffScopeState; limit: number }): Promise<EngineeringTakeoffScope[]>;
  /**
   * Persists the explicitly derived state/readiness of a scope.
   *
   * It can update readiness, counts, and block reasons — never an engineering
   * quantity, because a scope holds none.
   */
  updateScopeDerivedState(input: {
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
  }): Promise<EngineeringTakeoffScope | null>;
}

// ---------------------------------------------------------------------------
// Counting rules and the occurrence ledger
// ---------------------------------------------------------------------------

/** A persisted counting rule: the domain rule plus its scope binding. */
export type PersistedCountingRule = CountingRule & {
  companyId: string;
  takeoffScopeId: string;
  createdAt: string;
};

export interface EngineeringCountingRuleStore {
  saveCountingRule(record: PersistedCountingRule): Promise<void>;
  findCountingRule(input: { companyId: string; takeoffScopeId: string; family: CountingRuleFamily; ruleVersion: string }): Promise<PersistedCountingRule | null>;
  listCountingRules(input: { companyId: string; takeoffScopeId: string }): Promise<PersistedCountingRule[]>;
}

export interface EngineeringOccurrenceLedgerStore {
  /**
   * Appends occurrences. The ledger is append-only: an occurrence that was
   * already recorded is never rewritten, so a later count cannot quietly
   * reinterpret an earlier inclusion decision.
   */
  saveOccurrences(entries: readonly OccurrenceLedgerEntry[]): Promise<{ inserted: number; existing: number }>;
  listOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean; subjectMatchKey?: string; limit: number }): Promise<OccurrenceLedgerEntry[]>;
  countOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean }): Promise<number>;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export type CandidateSourceRecord = {
  id: string;
  companyId: string;
  candidateId: string;
  basis: string;
  claimId: string | null;
  sourceArtifactId: string | null;
  derivationFamilyRootArtifactId: string | null;
  locator: string | null;
  humanLocator: string | null;
  citationId: string | null;
  ledgerEntryId: string | null;
  calculationId: string | null;
  adjustmentId: string | null;
};

/**
 * A recorded dispute.
 *
 * There is deliberately no `selectedCandidateId` and no `resolvedValue`: the
 * row states that two candidates disagree and that an EXPLICIT decision is
 * required. Any winner field would invite auto-resolution, which Phase 2A-11
 * forbids.
 */
export type ConflictRecord = {
  conflictId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string;
  leftCandidateId: string;
  rightCandidateId: string;
  conflictState: string;
  reason: string;
  requiresExplicitDecision: true;
  resolvedByDecisionId: string | null;
  createdAt: string;
};

export interface EngineeringCandidateStore {
  saveCandidate(record: EngineeringQuantityCandidate): Promise<void>;
  findCandidate(input: { companyId: string; candidateId: string }): Promise<EngineeringQuantityCandidate | null>;
  listCandidates(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; conflictState?: string; origin?: string; limit: number }): Promise<EngineeringQuantityCandidate[]>;
  /** Exact provenance links. Relational rather than a String[] pointer. */
  saveCandidateSources(input: { companyId: string; candidateId: string; sources: readonly CandidateSourceRecord[] }): Promise<void>;
  listCandidateSources(input: { companyId: string; candidateId: string }): Promise<CandidateSourceRecord[]>;
  saveConflict(input: { companyId: string; takeoffScopeId: string; conflict: ConflictRecord }): Promise<void>;
  listConflicts(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<ConflictRecord[]>;
}

// ---------------------------------------------------------------------------
// Decisions (append-only)
// ---------------------------------------------------------------------------

export interface EngineeringDecisionStore {
  appendDecision(record: EngineeringQuantityDecision): Promise<void>;
  findDecision(input: { companyId: string; decisionId: string }): Promise<EngineeringQuantityDecision | null>;
  /**
   * Retires an earlier decision by reference.
   *
   * It writes ONLY `state`/`supersededByDecisionId`; the approved value is
   * never touched, and the store must refuse any payload that carries one.
   */
  retireDecision(input: { companyId: string; decisionId: string; supersededByDecisionId: string; state: "SUPERSEDED" | "WITHDRAWN" }): Promise<void>;
  listDecisions(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; state?: string; limit: number }): Promise<EngineeringQuantityDecision[]>;
  /** Current (non-retired) decision for a subject, if any. */
  currentDecision(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision | null>;
  /** Full history for a subject, oldest version first. */
  decisionHistory(input: { companyId: string; takeoffScopeId: string; subjectMatchKey: string }): Promise<EngineeringQuantityDecision[]>;
  saveDecisionSources(input: { companyId: string; decisionId: string; candidateIds: readonly string[]; calculationIds?: readonly string[] }): Promise<void>;
  listDecisionSources(input: { companyId: string; decisionId: string }): Promise<Array<{ candidateId: string; calculationId: string | null }>>;
  saveDecisionClaims(input: { companyId: string; decisionId: string; claimIds: readonly string[] }): Promise<void>;
  listDecisionClaims(input: { companyId: string; decisionId: string }): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

export type CalculationInputRecord = {
  id: string;
  companyId: string;
  calculationId: string;
  inputName: string;
  source: string;
  sourceReferenceId: string;
  inputValue: string | null;
  inputUnitLiteral: string | null;
  resolved: boolean;
  unresolvedReason: string | null;
  candidateId: string | null;
};

export type PersistedCalculation = EngineeringCalculationRecord & {
  companyId: string;
  takeoffScopeId: string;
};

export interface EngineeringCalculationStore {
  saveCalculation(input: { record: PersistedCalculation; inputs: readonly CalculationInputRecord[] }): Promise<void>;
  findCalculation(input: { companyId: string; calculationId: string }): Promise<PersistedCalculation | null>;
  listCalculationInputs(input: { companyId: string; calculationId: string }): Promise<CalculationInputRecord[]>;
  listCalculations(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; limit: number }): Promise<PersistedCalculation[]>;
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

export interface EngineeringAdjustmentStore {
  saveAdjustment(record: EngineeringAdjustment): Promise<void>;
  findAdjustment(input: { companyId: string; adjustmentId: string }): Promise<EngineeringAdjustment | null>;
  listAdjustments(input: { companyId: string; takeoffScopeId: string; subjectMatchKey?: string; adjustmentType?: EngineeringAdjustmentType; limit: number }): Promise<EngineeringAdjustment[]>;
}

// ---------------------------------------------------------------------------
// Engineering BOM
// ---------------------------------------------------------------------------

export type BomRowAdjustmentRecord = {
  id: string;
  companyId: string;
  bomRowId: string;
  adjustmentId: string;
  adjustmentType: EngineeringAdjustmentType;
  mode: AdjustmentMode;
  factor: string;
  baseValue: string;
  adjustedValue: string | null;
};

/**
 * One row of a BOM version's required-subject coverage manifest.
 *
 * The `resolution` vocabulary lives in the domain (`BomSubjectResolution`); this
 * record adds only the persistence identity the store needs.
 */
export type BomRequiredSubjectRecord = {
  id: string;
  companyId: string;
  bomVersionId: string;
  subjectMatchKey: string;
  subjectKeyNamespace: string;
  subjectLabel: string | null;
  requirementKind: string;
  resolution: BomSubjectResolution;
  resolvedByDecisionId: string | null;
  bomRowId: string | null;
  reason: string | null;
};

export interface EngineeringBomStore {
  /** Creates a version. An existing version is never mutated in place. */
  saveBomVersion(record: EngineeringBomVersion): Promise<void>;
  findBomVersion(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomVersion | null>;
  listBomVersions(input: { companyId: string; takeoffScopeId: string; state?: BomVersionState; limit: number }): Promise<EngineeringBomVersion[]>;
  latestBomVersion(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringBomVersion | null>;
  /**
   * Transitions a DRAFT version to APPROVED.
   *
   * It writes ONLY the approval fields and the recomputed completeness; rows
   * are never modified by an approval, so approving a version cannot silently
   * change an engineering quantity.
   */
  approveBomVersion(input: {
    companyId: string;
    bomVersionId: string;
    approvedByUserId: string;
    approvedAt: string;
    completeness: BomCompletenessState;
    completenessReasons: readonly string[];
  }): Promise<void>;
  saveBomRows(input: { companyId: string; bomVersionId: string; rows: readonly EngineeringBomRow[] }): Promise<void>;
  listBomRows(input: { companyId: string; bomVersionId: string }): Promise<EngineeringBomRow[]>;
  findBomRow(input: { companyId: string; bomRowId: string }): Promise<EngineeringBomRow | null>;
  saveRowConstraints(input: { companyId: string; bomRowId: string; constraints: readonly BomRowConstraint[] }): Promise<void>;
  listRowConstraints(input: { companyId: string; bomRowId: string }): Promise<BomRowConstraint[]>;
  saveRowAdjustments(input: { companyId: string; bomRowId: string; adjustments: readonly BomRowAdjustmentRecord[] }): Promise<void>;
  listRowAdjustments(input: { companyId: string; bomRowId: string }): Promise<BomRowAdjustmentRecord[]>;
  saveVersionDecisions(input: { companyId: string; bomVersionId: string; decisionIds: readonly string[] }): Promise<void>;
  listVersionDecisions(input: { companyId: string; bomVersionId: string }): Promise<string[]>;
  /**
   * Persists the required-subject coverage manifest of a version.
   *
   * The manifest records EVERY subject the governed scope required, with how the
   * version resolved it, so an approved subset can never be read as a complete
   * BOM. `replace: false` (the default for a first build) appends; a rebuild for
   * the SAME version is impossible because versions are immutable.
   */
  saveRequiredSubjects(input: { companyId: string; bomVersionId: string; subjects: readonly BomRequiredSubjectRecord[] }): Promise<void>;
  listRequiredSubjects(input: { companyId: string; bomVersionId: string }): Promise<BomRequiredSubjectRecord[]>;
}

// ---------------------------------------------------------------------------
// Evidence access (2A-10 consumption)
// ---------------------------------------------------------------------------

/**
 * Reads the accepted Phase 2A-10 handoff bundle.
 *
 * Phase 2A-11 NEVER reads raw documents or parser-native structures. This port
 * returns exactly the accepted handoff contract — governance-filtered claims
 * with citations, clusters, findings, identities, revision memberships, active
 * revision decisions, coverage, staleness, and block reasons — so engineering
 * candidates rest on governed evidence rather than on a re-parse.
 */
export interface CrossDocumentHandoffReaderPort {
  loadHandoff(input: { companyId: string; comparisonScopeId: string; comparisonRunId?: string | null }): Promise<CrossDocumentHandoffLike | null>;
  /** Rebuilds the 2A-10 governance view (ungoverned/blocked/superseded claims). */
  loadGovernanceView(input: { companyId: string; comparisonScopeId: string; comparisonRunId?: string | null }): Promise<EngineeringGovernanceView | null>;
}

/**
 * Optional reader that supplies pre-classified source occurrences.
 *
 * The counting rules — not this port — decide eligibility, so a caller cannot
 * smuggle an inflated total past the ledger. Structural flags are supplied
 * separately from countability precisely so the classifier can apply its
 * exclusions before asking whether something is countable.
 */
export type RawOccurrenceRecord = {
  artifactId: string;
  derivationFamilyRootArtifactId: string;
  family: CountingRuleFamily;
  sourceType: string;
  /** Structural flags the classifier reads BEFORE asking about countability. */
  structural: {
    modelSpace: boolean;
    insideTitleBlock: boolean;
    insideLegend: boolean;
    annotation: boolean;
    blockDefinition: boolean;
    xrefMetadata: boolean;
    definitionGroupKey?: string | null;
  };
  entityType?: string | null;
  locator: string;
  evidenceClaimId?: string | null;
  subjectMatchKey?: string | null;
  subjectKeyNamespace?: string | null;
  sourceCoverage?: "COMPLETE" | "PARTIAL";
};

export interface OccurrenceSourcePort {
  listOccurrences(input: { companyId: string; takeoffScopeId: string; artifactIds: readonly string[]; family: CountingRuleFamily }): Promise<RawOccurrenceRecord[]>;
}

// ---------------------------------------------------------------------------
// Aggregate store
// ---------------------------------------------------------------------------

/**
 * The complete engineering persistence surface.
 *
 * It deliberately composes only engineering stores. There is no procurement,
 * commercial, or catalog store in this type, so no Phase 2A-11 code path can
 * reach one even by mistake.
 */
export type EngineeringStore = EngineeringScopeStore &
  EngineeringCountingRuleStore &
  EngineeringOccurrenceLedgerStore &
  EngineeringCandidateStore &
  EngineeringDecisionStore &
  EngineeringCalculationStore &
  EngineeringAdjustmentStore &
  EngineeringBomStore;
