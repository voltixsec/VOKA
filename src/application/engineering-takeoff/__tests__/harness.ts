/**
 * Phase 2A-11 test harness.
 *
 * It builds REAL 2A-11 candidates, decisions, calculations, adjustments, and BOM
 * versions by running the REAL services against the in-memory engineering store.
 *
 * The 2A-10 handoff is supplied as a fixture shaped exactly like the accepted
 * `HandoffBundle`, so the derivation path under test is the production one: the
 * governance filter, the candidate builder, the conflict recorder, and the
 * decision service all run for real. Only the upstream comparison engine is
 * replaced by fixtures, because it has its own accepted test suite.
 */

import { InMemoryEngineeringStore } from "@/src/infrastructure/engineering-takeoff/InMemoryEngineeringStore";
import {
  EngineeringTakeoffService,
  EngineeringDecisionService,
  EngineeringCalculationService,
  EngineeringAdjustmentService,
  EngineeringBomService,
} from "@/src/application/engineering-takeoff";
import type {
  CrossDocumentHandoffReaderPort,
  EngineeringClockPort,
  OccurrenceSourcePort,
  RawOccurrenceRecord,
  EngineeringGovernanceView,
} from "@/src/application/engineering-takeoff";
import {
  buildEngineeringGovernanceView,
  type CrossDocumentHandoffLike,
  type HandoffQuantityClaimLike,
  type HandoffSubjectClusterLike,
  type HandoffFindingLike,
  type HandoffRevisionMembershipLike,
  type HandoffActiveRevisionDecisionLike,
  type HandoffCoverageLike,
  type HandoffLineageLike,
} from "@/src/domain/engineering-takeoff";

export const TEST_NOW = "2026-09-13T00:00:00.000Z";
export const COMPANY_A = "company-a";
export const COMPANY_B = "company-b";
export const COMPARISON_SCOPE = "cmp-scope-1";

export function fixedClock(now = TEST_NOW): EngineeringClockPort {
  let current = now;
  return {
    now: () => current,
  };
}

export function advancingClock(start = TEST_NOW): EngineeringClockPort {
  let tick = 0;
  const base = Date.parse(start);
  return {
    now: () => new Date(base + tick++ * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 2A-10 handoff fixtures
// ---------------------------------------------------------------------------

export function claimFor(input: {
  claimId: string;
  companyId?: string;
  comparisonScopeId?: string;
  sourceArtifactId?: string;
  subjectMatchKey: string;
  subjectKeyNamespace?: string;
  subjectLabel?: string | null;
  valueLiteral: string;
  sourceNumericView: number | null;
  unit?: string | null;
  unitDimension?: string | null;
  quantityOrigin?: "STATED" | "DECLARED_MODEL";
  locator?: string;
  coverage?: "COMPLETE" | "PARTIAL";
  derivationFamilyRootArtifactId?: string;
  documentIdentityId?: string | null;
  revisionMembershipId?: string | null;
  observedRevisionLabel?: string | null;
}): HandoffQuantityClaimLike {
  const sourceArtifactId = input.sourceArtifactId ?? "artifact-1";
  return {
    claimId: input.claimId,
    comparisonScopeId: input.comparisonScopeId ?? COMPARISON_SCOPE,
    sourceArtifactId,
    sourceKind: "PDF",
    readingChannel: "PDF_NATIVE_TEXT",
    artifactSha256: `sha-${sourceArtifactId}`,
    subjectClusterId: null,
    subjectKeyNamespace: input.subjectKeyNamespace ?? "EQUIPMENT_TAG",
    subjectKeyValue: input.subjectMatchKey,
    subjectMatchKey: input.subjectMatchKey,
    subjectLabel: input.subjectLabel ?? input.subjectMatchKey,
    valueLiteral: input.valueLiteral,
    sourceNumericView: input.sourceNumericView,
    unit: input.unit ?? "ea",
    unitDeclared: true,
    unitDimension: input.unitDimension ?? "COUNT",
    quantityOrigin: input.quantityOrigin ?? "STATED",
    locator: input.locator ?? `${sourceArtifactId}#p1`,
    humanLocator: null,
    citationId: `citation-${input.claimId}`,
    pageNumber: 1,
    reliability: "HIGH",
    confidence: 0.9,
    limitations: [],
    sourceQualifiers: [],
    coverage: input.coverage ?? "COMPLETE",
    derivationFamilyRootArtifactId: input.derivationFamilyRootArtifactId ?? sourceArtifactId,
    lineageRole: "STANDALONE",
    documentIdentityId: input.documentIdentityId ?? "identity-1",
    revisionMembershipId: input.revisionMembershipId ?? "membership-1",
    observedRevisionLabel: input.observedRevisionLabel ?? "Rev A",
    materializerVersion: "2a-10.materializer.v1",
    createdAt: TEST_NOW,
    status: "OBSERVED_NOT_APPROVED",
    purpose: "CROSS_DOCUMENT_COMPARISON_ONLY",
  };
}

export function clusterFor(input: { subjectClusterId: string; matchKey: string; memberClaimIds: readonly string[]; namespace?: string }): HandoffSubjectClusterLike {
  return {
    subjectClusterId: input.subjectClusterId,
    namespace: input.namespace ?? "EQUIPMENT_TAG",
    matchKey: input.matchKey,
    subjectKeys: [input.matchKey],
    memberClaimIds: [...input.memberClaimIds],
    derivationFamilyRootIds: ["artifact-1"],
    comparable: true,
    ambiguous: false,
    blockers: [],
  };
}

export function membershipFor(input: { membershipId: string; sourceArtifactId: string; documentIdentityId?: string; derivationFamilyRootArtifactId?: string }): HandoffRevisionMembershipLike {
  return {
    membershipId: input.membershipId,
    documentIdentityId: input.documentIdentityId ?? "identity-1",
    sourceArtifactId: input.sourceArtifactId,
    artifactSha256: `sha-${input.sourceArtifactId}`,
    observedRevisionLabel: "Rev A",
    revisionClaimId: null,
    membershipBasis: "DOCUMENT_STATE",
    documentRole: "TENDER_DRAWING",
    derivationFamilyRootArtifactId: input.derivationFamilyRootArtifactId ?? input.sourceArtifactId,
  };
}

export function activeDecisionFor(input: { documentIdentityId?: string; decisionId?: string; status?: string; selectedMembershipIds: readonly string[] }): HandoffActiveRevisionDecisionLike {
  return {
    documentIdentityId: input.documentIdentityId ?? "identity-1",
    decisionId: input.decisionId ?? "decision-1",
    decisionVersion: 1,
    status: input.status ?? "ACTIVE_REVISION_SELECTED",
    selectedMembershipIds: [...input.selectedMembershipIds],
    actorUserId: "user-1",
    reason: "the reviewer selected the governing revision",
    decidedAt: TEST_NOW,
    blockedReason: null,
  };
}

export function identityFor(input: { documentIdentityId?: string; label?: string }): CrossDocumentHandoffLike["documentIdentities"][number] {
  const documentIdentityId = input.documentIdentityId ?? "identity-1";
  return {
    documentIdentityId,
    kind: "TENDER_DOCUMENT",
    label: input.label ?? "Tender package",
    observedFamilyKey: `family-${documentIdentityId}`,
    identityBasis: "DOCUMENT_NUMBER",
    ambiguous: false,
    confirmedIdentityKey: `confirmed-${documentIdentityId}`,
  };
}

export function findingFor(input: { findingId: string; reviewState?: string; participantClaimIds: readonly string[] }): HandoffFindingLike {
  return {
    findingId: input.findingId,
    findingKind: "QUANTITY_MISMATCH",
    statementTemplateKey: "QUANTITY_MISMATCH",
    severity: "HIGH",
    reviewState: input.reviewState ?? "OPEN",
    fingerprint: `fp-${input.findingId}`,
    evidenceSignatureHash: `sig-${input.findingId}`,
    reproduced: false,
    stale: false,
    staleReason: null,
    evidenceChanged: false,
    participantIds: [],
    participantClaimIds: [...input.participantClaimIds],
    evidenceObservationCount: 1,
    limitations: [],
  };
}

/**
 * Builds a handoff bundle with sensible defaults.
 *
 * Every collection the governance model depends on is populated, so a test that
 * omits an override still exercises the REAL governance path rather than an
 * accidentally-empty one.
 */
export function buildHandoff(input: {
  companyId?: string;
  comparisonScopeId?: string;
  quantityClaims: readonly HandoffQuantityClaimLike[];
  subjectClusters?: readonly HandoffSubjectClusterLike[];
  findings?: readonly HandoffFindingLike[];
  documentIdentities?: CrossDocumentHandoffLike["documentIdentities"];
  revisionMemberships?: readonly HandoffRevisionMembershipLike[];
  activeRevisionDecisions?: readonly HandoffActiveRevisionDecisionLike[];
  coverage?: readonly HandoffCoverageLike[];
  lineage?: readonly HandoffLineageLike[];
  blockReasons?: readonly string[];
  limitations?: readonly string[];
}): CrossDocumentHandoffLike {
  const companyId = input.companyId ?? COMPANY_A;
  const comparisonScopeId = input.comparisonScopeId ?? COMPARISON_SCOPE;
  const revisionMemberships = input.revisionMemberships ?? [membershipFor({ membershipId: "membership-1", sourceArtifactId: "artifact-1" })];
  const activeRevisionDecisions = input.activeRevisionDecisions ?? [
    activeDecisionFor({ selectedMembershipIds: revisionMemberships.map((membership) => membership.membershipId) }),
  ];
  const provenanceArtifacts = [...new Set(input.quantityClaims.map((claim) => claim.sourceArtifactId))];
  const coverage = input.coverage ?? provenanceArtifacts.map((artifactId) => ({
    artifactId,
    sha256: `sha-${artifactId}`,
    sourceKind: "PDF",
    coverage: "COMPLETE",
    claimCount: input.quantityClaims.filter((claim) => claim.sourceArtifactId === artifactId).length,
    truncated: false,
    limitations: [],
  }));

  return {
    companyId,
    comparisonScopeId,
    scope: {
      name: "Accepted comparison scope",
      context: "ENGINEERING_TENDER",
      revisionPolicy: "ACTIVE_ONLY",
      comparisonScopeClass: "TENDER_PACKAGE",
      lineageCollapse: true,
      policyBounds: {},
    },
    latestRun: {
      comparisonRunId: "run-1",
      status: "COMPLETED",
      engineVersion: "2a-10.engine.v1",
      matcherVersion: "2a-10.matcher.v1",
      projectorVersion: "2a-10.projector.v1",
      claimCount: input.quantityClaims.length,
      matchCount: 0,
      findingCount: input.findings?.length ?? 0,
      startedAt: TEST_NOW,
      finishedAt: TEST_NOW,
      inputDigest: "digest-1",
    },
    quantityClaims: [...input.quantityClaims],
    subjectClusters: [...(input.subjectClusters ?? [])],
    findings: [...(input.findings ?? [])],
    documentIdentities: [...(input.documentIdentities ?? [identityFor({})])],
    revisionMemberships: [...revisionMemberships],
    activeRevisionDecisions: [...activeRevisionDecisions],
    lineage: [...(input.lineage ?? [])],
    coverage: [...coverage],
    staleness: { staleFindings: 0, reproducedFindings: 0, evidenceChangedFindings: 0 },
    blockReasons: [...(input.blockReasons ?? [])],
    limitations: [...(input.limitations ?? [])],
    notExposed: [],
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export function handoffReader(handoff: CrossDocumentHandoffLike | null): CrossDocumentHandoffReaderPort {
  return {
    async loadHandoff() {
      return handoff;
    },
    async loadGovernanceView(): Promise<EngineeringGovernanceView | null> {
      return handoff ? buildEngineeringGovernanceView(handoff) : null;
    },
  };
}

/** A reader that returns a DIFFERENT handoff per company, to prove isolation. */
export function perCompanyHandoffReader(byCompany: Record<string, CrossDocumentHandoffLike | null>): CrossDocumentHandoffReaderPort {
  return {
    async loadHandoff(input) {
      return byCompany[input.companyId] ?? null;
    },
    async loadGovernanceView(input) {
      const handoff = byCompany[input.companyId];
      return handoff ? buildEngineeringGovernanceView(handoff) : null;
    },
  };
}

export function occurrenceSource(records: readonly RawOccurrenceRecord[]): OccurrenceSourcePort {
  return {
    async listOccurrences(input) {
      return records.filter((record) => input.artifactIds.includes(record.artifactId) && record.family === input.family);
    },
  };
}

/** A source that returns nothing — for scopes that must not count anything. */
export function emptyOccurrenceSource(): OccurrenceSourcePort {
  return { async listOccurrences() { return []; } };
}

// ---------------------------------------------------------------------------
// Occurrence fixture builder
// ---------------------------------------------------------------------------

export function occurrence(input: {
  artifactId?: string;
  derivationFamilyRootArtifactId?: string;
  family: "DXF" | "IFC";
  sourceType: string;
  locator: string;
  modelSpace?: boolean;
  insideTitleBlock?: boolean;
  insideLegend?: boolean;
  annotation?: boolean;
  blockDefinition?: boolean;
  xrefMetadata?: boolean;
  subjectMatchKey?: string | null;
  subjectKeyNamespace?: string | null;
  sourceCoverage?: "COMPLETE" | "PARTIAL";
  definitionGroupKey?: string | null;
}): RawOccurrenceRecord {
  const artifactId = input.artifactId ?? "artifact-dxf-1";
  return {
    artifactId,
    derivationFamilyRootArtifactId: input.derivationFamilyRootArtifactId ?? artifactId,
    family: input.family,
    sourceType: input.sourceType,
    structural: {
      modelSpace: input.modelSpace ?? true,
      insideTitleBlock: input.insideTitleBlock ?? false,
      insideLegend: input.insideLegend ?? false,
      annotation: input.annotation ?? false,
      blockDefinition: input.blockDefinition ?? false,
      xrefMetadata: input.xrefMetadata ?? false,
      definitionGroupKey: input.definitionGroupKey ?? null,
    },
    entityType: input.sourceType,
    locator: input.locator,
    evidenceClaimId: null,
    subjectMatchKey: input.subjectMatchKey ?? "CCTV-CAM-01",
    subjectKeyNamespace: input.subjectKeyNamespace ?? "EQUIPMENT_TAG",
    sourceCoverage: input.sourceCoverage ?? "COMPLETE",
  };
}

// ---------------------------------------------------------------------------
// Assembled harness
// ---------------------------------------------------------------------------

export type Harness = {
  store: InMemoryEngineeringStore;
  takeoff: EngineeringTakeoffService;
  decisions: EngineeringDecisionService;
  calculations: EngineeringCalculationService;
  adjustments: EngineeringAdjustmentService;
  bom: EngineeringBomService;
  clock: EngineeringClockPort;
};

export function buildHarness(input: {
  handoff?: CrossDocumentHandoffLike | null;
  handoffReader?: CrossDocumentHandoffReaderPort;
  occurrences?: readonly RawOccurrenceRecord[];
  clock?: EngineeringClockPort;
} = {}): Harness {
  const store = new InMemoryEngineeringStore();
  const clock = input.clock ?? fixedClock();
  const reader = input.handoffReader ?? handoffReader(input.handoff ?? null);
  const source = input.occurrences ? occurrenceSource(input.occurrences) : emptyOccurrenceSource();

  return {
    store,
    clock,
    takeoff: new EngineeringTakeoffService({ store, handoffReader: reader, occurrenceSource: source, clock }),
    decisions: new EngineeringDecisionService({ store, clock }),
    calculations: new EngineeringCalculationService({ store, clock }),
    adjustments: new EngineeringAdjustmentService({ store, clock }),
    bom: new EngineeringBomService({ store, clock }),
  };
}

/**
 * Builds a SECOND harness over an EXISTING store.
 *
 * This is the process-boundary simulator the persistence requirements need: the
 * store is the durable substrate, and a new set of services over it models a
 * fresh process that has only what was persisted — not the object graph the
 * first process happened to hold. Any state a service kept only in memory would
 * be invisible to the reloaded harness.
 */
export function buildHarnessOverStore(input: {
  store: InMemoryEngineeringStore;
  handoff?: CrossDocumentHandoffLike | null;
  handoffReader?: CrossDocumentHandoffReaderPort;
  occurrences?: readonly RawOccurrenceRecord[];
  clock?: EngineeringClockPort;
}): Harness {
  const clock = input.clock ?? fixedClock();
  const reader = input.handoffReader ?? handoffReader(input.handoff ?? null);
  const source = input.occurrences ? occurrenceSource(input.occurrences) : emptyOccurrenceSource();
  return {
    store: input.store,
    clock,
    takeoff: new EngineeringTakeoffService({ store: input.store, handoffReader: reader, occurrenceSource: source, clock }),
    decisions: new EngineeringDecisionService({ store: input.store, clock }),
    calculations: new EngineeringCalculationService({ store: input.store, clock }),
    adjustments: new EngineeringAdjustmentService({ store: input.store, clock }),
    bom: new EngineeringBomService({ store: input.store, clock }),
  };
}
