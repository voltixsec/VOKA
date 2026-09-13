/**
 * Phase 2A-11 → Phase 2A-12 READ CONTRACT.
 *
 * This is the ONLY surface Phase 2A-12 consumes. It is a stable, persisted
 * projection over ONE approved EngineeringBomVersion, and it exposes the full
 * lineage chain:
 *
 *   BOM Version
 *     → BOM Row
 *       → approved engineering quantity decision
 *         → the candidates/takeoff that decision considered
 *           → the governed 2A-10 evidence claims
 *             → the source citations and exact locators
 *
 * Two properties matter to 2A-12 and are guaranteed here:
 *
 * 1. It is a PERSISTED contract. It is rebuilt from durable rows, never from a
 *    re-parse of a document. A downstream phase never needs the original file.
 * 2. It does NOT expose mutable parser-native structures. The `raw` escape
 *    hatches of the parser world are absent by construction; what 2A-12 sees is
 *    engineering truth plus its lineage.
 *
 * A row is included at its ACTUAL readiness. A row that is not approved is
 * carried with `readiness` and `readinessReasons` set, so 2A-12 can decide what
 * to do with an unapproved subset instead of being told the BOM is finished.
 */

import type {
  BomRowConstraint,
  BomCompletenessState as EngineeringBomCompletenessState,
  EngineeringBomRow,
  EngineeringBomVersion,
  EngineeringReadinessState,
  EngineeringRequirementKind,
} from "@/src/domain/engineering-takeoff";

import type { EngineeringStore } from "./ports";

// ---------------------------------------------------------------------------
// Contract version
// ---------------------------------------------------------------------------

export const ENGINEERING_HANDOFF_VERSION = "2a-11.handoff.v1";

/**
 * Fields deliberately NOT exposed to Phase 2A-12.
 *
 * They are named so the absence is auditable: a test can assert that no key of
 * a handoff row matches any entry here. Each is either a commercial/procurement
 * concept 2A-11 must never own, or a mutable parser-native structure a
 * downstream phase must not depend on.
 */
export const BOM_HANDOFF_NOT_EXPOSED_FIELDS = [
  "price",
  "unitPrice",
  "rate",
  "amount",
  "currency",
  "supplier",
  "supplierId",
  "quotation",
  "quotationLine",
  "quotationLineId",
  "invoice",
  "purchaseOrder",
  "purchaseOrderLine",
  "procurementRequirement",
  "rfq",
  "offer",
  "award",
  "productSelection",
  "productSelectionId",
  "catalogItemId",
  "packSize",
  "minimumOrderQuantity",
  "orderQuantity",
  "leadTime",
  "rawEntity",
  "rawRecord",
  "rawGeometry",
  "pixelGeometry",
  "parserPayload",
  "entityAttributes",
] as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One citation behind an approved engineering quantity. */
export type BomHandoffCitation = {
  claimId: string;
  /** Exact locator retained by the accepted 2A-10 evidence channel. */
  locator: string;
  humanLocator: string | null;
  sourceArtifactId: string | null;
  /** Phase 2A-9 family root, so a downstream phase never double counts. */
  derivationFamilyRootArtifactId: string | null;
};

/** One step of the origin chain of an approved quantity. */
export type BomHandoffOriginStep = {
  /** Where this number came from, as a quantity origin. */
  origin: string;
  /** What governance made of it, if anything. */
  basis: string;
  value: number | null;
  unitLiteral: string | null;
  /** The governed record this step points at. */
  referenceId: string;
};

export type BomHandoffRow = {
  rowId: string;
  rowKey: string;
  position: number;
  /** Generic engineering subject. Product-agnostic by construction. */
  engineeringSubject: string;
  requirementKind: EngineeringRequirementKind;
  requirementNature: string;
  /** The approved engineering quantity for this row. */
  approvedQuantity: number;
  unitLiteral: string;
  unitDimension: string;
  quantityOrigin: string;
  /** Material vs performed service, so 2A-12 never treats work as a product. */
  isService: boolean;
  /** Specification constraints. Manufacturer/tender model are SPECIFICATION ONLY. */
  constraints: BomRowConstraint[];
  systemContext: string | null;
  locationContext: string | null;
  readiness: EngineeringReadinessState;
  readinessReasons: string[];
  isApprovedRow: boolean;
  /** The full lineage chain for this row. */
  lineage: {
    quantityDecisionId: string;
    decisionVersion: number;
    candidateIds: string[];
    claimIds: string[];
    occurrenceLedgerEntryIds: string[];
    calculationId: string | null;
    citations: BomHandoffCitation[];
    /** The adjustment chain, base value first and allowances after. */
    adjustments: Array<{
      adjustmentId: string;
      adjustmentType: string;
      mode: string;
      factor: number;
      baseValue: number;
      adjustedValue: number | null;
    }>;
    originChain: BomHandoffOriginStep[];
  };
  limitations: string[];
};

export type EngineeringBomHandoff = {
  contractVersion: string;
  companyId: string;
  takeoffScopeId: string;
  bomVersionId: string;
  versionNumber: number;
  previousVersionId: string | null;
  engineeringScope: string;
  state: string;
  completeness: EngineeringBomCompletenessState;
  completenessReasons: string[];
  /** Accepted 2A-10 evidence state this version was built from. */
  comparisonScopeId: string | null;
  comparisonRunId: string | null;
  evidenceInputDigest: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  rowCount: number;
  approvedRowCount: number;
  rows: BomHandoffRow[];
  limitations: string[];
  /** Named so a consumer can prove what is deliberately absent. */
  notExposed: readonly string[];
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type EngineeringHandoffDeps = {
  store: EngineeringStore;
};

/**
 * Builds the stable 2A-12 read contract from durable engineering rows.
 *
 * It requires an APPROVED BOM version. A DRAFT version has no approved
 * engineering truth to publish, and handing one over would let a downstream
 * phase act on values no human adopted.
 */
export async function buildEngineeringBomHandoff(
  deps: EngineeringHandoffDeps,
  input: { companyId: string; bomVersionId: string },
): Promise<EngineeringBomHandoff> {
  const version = await deps.store.findBomVersion({ companyId: input.companyId, bomVersionId: input.bomVersionId });
  if (!version) throw new Error("the BOM version requested by Phase 2A-12 does not exist for this company");
  if (version.state !== "APPROVED") {
    throw new Error(`the BOM version ${version.bomVersionId} is ${version.state}: Phase 2A-12 reads only an APPROVED Engineering BOM version`);
  }

  const rows = await deps.store.listBomRows({ companyId: input.companyId, bomVersionId: version.bomVersionId });

  const handoffRows: BomHandoffRow[] = [];
  for (const row of [...rows].sort((left, right) => left.position - right.position)) {
    handoffRows.push(await buildHandoffRow(deps, input.companyId, row));
  }

  return {
    contractVersion: ENGINEERING_HANDOFF_VERSION,
    companyId: version.companyId,
    takeoffScopeId: version.takeoffScopeId,
    bomVersionId: version.bomVersionId,
    versionNumber: version.versionNumber,
    previousVersionId: version.previousVersionId,
    engineeringScope: version.engineeringScope,
    state: version.state,
    completeness: version.completeness,
    completenessReasons: version.completenessReasons,
    comparisonScopeId: version.comparisonScopeId,
    comparisonRunId: version.comparisonRunId,
    evidenceInputDigest: version.evidenceInputDigest,
    approvedByUserId: version.approvedByUserId,
    approvedAt: version.approvedAt,
    createdAt: version.createdAt,
    rowCount: version.rowCount,
    approvedRowCount: version.approvedRowCount,
    rows: handoffRows,
    limitations: version.limitations,
    notExposed: BOM_HANDOFF_NOT_EXPOSED_FIELDS,
  };
}

/** Convenience: the latest APPROVED version of a scope, or null when none is approved. */
export async function latestApprovedBomHandoff(
  deps: EngineeringHandoffDeps,
  input: { companyId: string; takeoffScopeId: string },
): Promise<EngineeringBomHandoff | null> {
  const versions = await deps.store.listBomVersions({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, state: "APPROVED", limit: 200 });
  const latest = versions.sort((left, right) => right.versionNumber - left.versionNumber)[0];
  if (!latest) return null;
  return buildEngineeringBomHandoff(deps, { companyId: input.companyId, bomVersionId: latest.bomVersionId });
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function buildHandoffRow(deps: EngineeringHandoffDeps, companyId: string, row: EngineeringBomRow): Promise<BomHandoffRow> {
  const decision = await deps.store.findDecision({ companyId, decisionId: row.quantityDecisionId });
  const candidateIds = decision?.sourceCandidateIds ?? [];
  const claimIds = decision?.sourceClaimIds ?? [];

  const citations: BomHandoffCitation[] = [];
  for (const candidateId of candidateIds) {
    const sources = await deps.store.listCandidateSources({ companyId, candidateId });
    for (const source of sources) {
      if (!source.claimId) continue;
      citations.push({
        claimId: source.claimId,
        locator: source.locator ?? "",
        humanLocator: source.humanLocator,
        sourceArtifactId: source.sourceArtifactId,
        derivationFamilyRootArtifactId: source.derivationFamilyRootArtifactId,
      });
    }
  }

  const adjustments = decision
    ? await deps.store.listAdjustments({ companyId, takeoffScopeId: row.companyId === companyId ? decision.takeoffScopeId : decision.takeoffScopeId, subjectMatchKey: decision.subjectMatchKey, limit: 200 })
    : [];

  const originChain: BomHandoffOriginStep[] = [];
  for (const candidateId of candidateIds) {
    const candidate = await deps.store.findCandidate({ companyId, candidateId });
    if (!candidate) continue;
    originChain.push({
      origin: candidate.origin,
      basis: candidate.basis,
      value: candidate.value,
      unitLiteral: candidate.unitLiteral,
      referenceId: candidate.candidateId,
    });
  }
  if (decision) {
    // The decision is the LAST step: it is where a candidate became approved
    // engineering truth, and its origin is always APPROVED_ENGINEERING.
    originChain.push({
      origin: decision.quantityOrigin,
      basis: decision.decisionBasis,
      value: decision.approvedValue,
      unitLiteral: decision.approvedUnitLiteral,
      referenceId: decision.decisionId,
    });
  }

  const calculationId = decision?.sourceCalculationId ?? null;

  return {
    rowId: row.rowId,
    rowKey: row.rowKey,
    position: row.position,
    engineeringSubject: row.engineeringSubject,
    requirementKind: row.requirementKind as EngineeringRequirementKind,
    requirementNature: row.requirementNature,
    approvedQuantity: row.approvedQuantity,
    unitLiteral: row.unitLiteral,
    unitDimension: row.unitDimension,
    quantityOrigin: row.quantityOrigin,
    isService: row.requirementNature === "PERFORMED_SERVICE",
    constraints: row.constraints,
    systemContext: row.systemContext,
    locationContext: row.locationContext,
    readiness: row.readiness,
    readinessReasons: row.readinessReasons,
    isApprovedRow: row.isApprovedRow,
    lineage: {
      quantityDecisionId: row.quantityDecisionId,
      decisionVersion: row.decisionVersion,
      candidateIds: [...candidateIds].sort(),
      claimIds: [...claimIds].sort(),
      occurrenceLedgerEntryIds: [...row.occurrenceLedgerEntryIds].sort(),
      calculationId,
      citations,
      adjustments: adjustments.map((adjustment) => ({
        adjustmentId: adjustment.adjustmentId,
        adjustmentType: adjustment.adjustmentType,
        mode: adjustment.mode,
        factor: adjustment.adjustmentFactor,
        baseValue: adjustment.baseValue,
        adjustedValue: adjustment.adjustedValue,
      })),
      originChain,
    },
    limitations: row.limitations,
  };
}
