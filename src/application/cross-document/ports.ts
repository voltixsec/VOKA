/**
 * Phase 2A-10: application-layer ports.
 *
 * The comparison engine, the materializers, and the governance commands depend
 * only on these interfaces. The Prisma implementations live in
 * `src/infrastructure/cross-document`, and the deterministic in-memory
 * implementation lives beside them so tests exercise the real engine rather
 * than a re-implementation of it.
 */

import type {
  ActiveRevisionDecisionRecord,
  CrossDocumentFindingRecord,
  DocumentRevisionMembership,
  DocumentRole,
  DocumentRoleSource,
  EvidenceSignature,
  FindingEngineFlags,
  FindingKind,
  FindingParticipant,
  FindingReviewEvent,
  ReviewState,
  DocumentRelationKind,
  DocumentRelationBasis,
} from "@/src/domain/cross-document";
import type { NormalizedEvidenceClaim } from "@/src/domain/cross-document";
import type { SubjectMatchBlockerList, SubjectMatchRecord, SubjectClusterRecord } from "./matching-types";
import type { MatchTier } from "@/src/domain/cross-document";

// ---------------------------------------------------------------------------
// Phase 2A-9 lineage: read-only derivation adapter
// ---------------------------------------------------------------------------

/**
 * Read-only view of one persisted `ArtifactDerivation` row.
 *
 * It exposes exactly what a comparison needs — the original (which IS the
 * derivation family root), the derived artifact, the kind/method, the two
 * formats, both hashes, converter identity and version where present, the
 * provider warnings (channel A), the VOKA fidelity limitations (channel B),
 * the status, and the timestamps.
 *
 * `originalArtifactId` is the family root. Phase 2A-10 adds no family id to
 * `ArtifactDerivation` and never mutates a 2A-9 row.
 */
export type DerivationReadModel = {
  derivationId: string;
  companyId: string;
  /** FAMILY ROOT: the original proprietary artifact. */
  originalArtifactId: string;
  derivedArtifactId: string | null;
  derivationKind: string;
  derivationMethod: string;
  sourceFormat: string;
  derivedFormat: string;
  sourceHash: string;
  derivedHash: string | null;
  converterId: string | null;
  converterVersion: string | null;
  /** Channel A: converter/provider warnings, preserved verbatim. */
  warnings: string[];
  /** Channel B: static VOKA fidelity limitations, preserved verbatim. */
  fidelityLimitations: string[];
  status: string;
  optionsFingerprint: string;
  createdAt: string;
  completedAt: string | null;
};

export interface DerivationReaderPort {
  /** Every derivation in which the artifact is the ORIGINAL (the family root). */
  listByOriginalArtifact(input: { companyId: string; originalArtifactId: string }): Promise<DerivationReadModel[]>;
  /** Every derivation in which the artifact is the DERIVED result. */
  listByDerivedArtifact(input: { companyId: string; derivedArtifactId: string }): Promise<DerivationReadModel[]>;
  /** Bounded batch read so a comparison scope is never resolved one row at a time. */
  listForArtifacts(input: { companyId: string; artifactIds: readonly string[] }): Promise<DerivationReadModel[]>;
}

// ---------------------------------------------------------------------------
// Source artifact access
// ---------------------------------------------------------------------------

export type SourceArtifactRef = {
  artifactId: string;
  companyId: string;
  originalFilename: string;
  kind: string;
  mimeType: string;
  contentSha256: string;
  context: string;
  processingState: string;
  createdAt: string;
};

/** Result of a governed re-open. A hash mismatch is a HARD STOP. */
export type VerifiedArtifactBytes =
  | { status: "OK"; bytes: Uint8Array; sha256: string }
  | { status: "UNAVAILABLE"; reason: string }
  | { status: "HASH_MISMATCH"; reason: string; expectedSha256: string; actualSha256: string };

export interface SourceArtifactReaderPort {
  /** Artifacts inside one company and scope context. Never crosses tenants. */
  listArtifacts(input: { companyId: string; artifactIds?: readonly string[]; context?: string; sourceKinds?: readonly string[]; limit: number }): Promise<SourceArtifactRef[]>;
  findArtifact(input: { companyId: string; artifactId: string }): Promise<SourceArtifactRef | null>;
  /**
   * Loads the retained bytes through the accepted storage abstraction and
   * verifies them against the recorded SHA-256. Never follows a source path and
   * never reconstructs evidence from memory.
   */
  readVerifiedBytes(input: { companyId: string; artifactId: string }): Promise<VerifiedArtifactBytes>;
}

// ---------------------------------------------------------------------------
// Materialization input
// ---------------------------------------------------------------------------

/** Phase 2A-9 lineage context attached to one materialized artifact. */
export type ArtifactLineageContext = {
  /** FAMILY ROOT: always the original proprietary artifact id. */
  derivationFamilyRootArtifactId: string;
  lineageRole: "STANDALONE" | "DERIVED_INSPECTED" | "ORIGINAL_PROPRIETARY";
  derivation: DerivationReadModel | null;
};

export type MaterializedArtifact = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  materializerVersion: string;
  readingChannels: string[];
  coverage: "COMPLETE" | "PARTIAL";
  claims: NormalizedEvidenceClaim[];
  truncated: boolean;
  truncationReasons: string[];
  /** Channel A provider warnings, preserved verbatim; never merged with limitations. */
  warnings: string[];
  limitations: string[];
  /** True when VOKA could not read this artifact and materialized no claim from it. */
  unavailable: boolean;
};

/**
 * Produces the comparison evidence for one artifact.
 *
 * The implementation lives in infrastructure because it re-runs the accepted
 * deterministic analyzers over the retained, hash-verified bytes. The port
 * exists so the engine never touches raw files itself.
 */
export interface EvidenceMaterializationPort {
  materialize(input: {
    companyId: string;
    runId: string | null;
    createdAt: string;
    artifact: SourceArtifactRef;
    lineage: ArtifactLineageContext;
  }): Promise<MaterializedArtifact>;
}

// ---------------------------------------------------------------------------
// Persistence port
// ---------------------------------------------------------------------------

export type ComparisonScopeRecord = {
  comparisonScopeId: string;
  companyId: string;
  name: string;
  context: string;
  projectKey: string | null;
  revisionPolicy: string;
  predicateFilters: string[];
  roleFilters: string[];
  lineageCollapse: true;
  policyBounds: Record<string, number>;
  comparisonScopeClass: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type ComparisonScopeArtifactRecord = {
  comparisonScopeId: string;
  companyId: string;
  artifactId: string;
  documentRole: DocumentRole;
  documentRoleSource: DocumentRoleSource;
  roleDeclaredByUserId: string | null;
  activeRevisionDecisionId: string | null;
  addedAt: string;
};

export type MaterializationRecordFixture = {
  materializationId: string;
  companyId: string;
  comparisonScopeId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  sourceKind: string;
  materializerVersion: string;
  readingChannels: string[];
  coverage: "COMPLETE" | "PARTIAL";
  claimCount: number;
  truncated: boolean;
  truncationReasons: string[];
  warnings: string[];
  limitations: string[];
  createdAt: string;
};

export type ComparisonRunRecord = {
  comparisonRunId: string;
  companyId: string;
  comparisonScopeId: string;
  engineVersion: string;
  matcherVersion: string;
  projectorVersion: string;
  materializerVersions: Record<string, string>;
  artifactStates: Array<{ artifactId: string; sha256: string; coverage: string; claimCount: number; unavailable: boolean }>;
  claimCount: number;
  matchCount: number;
  findingCount: number;
  newFindingCount: number;
  reproducedFindingCount: number;
  notReproducedFindingCount: number;
  truncated: boolean;
  limitations: string[];
  startedAt: string;
  finishedAt: string;
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  blockReasons: string[];
  actorUserId: string;
  inputDigest: string;
};

export type DocumentIdentityRecord = {
  documentIdentityId: string;
  companyId: string;
  kind: string;
  label: string;
  /** Non-unique: ambiguity must survive persistence. */
  observedFamilyKey: string;
  /** Nullable; the ONLY guarded unique key, and only for a governance-confirmed identity. */
  confirmedIdentityKey: string | null;
  identityBasis: "EVIDENCE_SUGGESTED" | "GOVERNANCE_CONFIRMED" | "UNRESOLVED";
  ambiguous: boolean;
  evidence: Array<{
    kind: string;
    value: string;
    sourceArtifactId: string;
    claimId: string | null;
    locator: string | null;
    reliability: string;
    limitations: string[];
  }>;
  limitations: string[];
  resolverVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRelationRecord = {
  documentRelationId: string;
  companyId: string;
  documentIdentityId: string;
  relatedDocumentIdentityId: string;
  relationKind: DocumentRelationKind;
  relationBasis: DocumentRelationBasis;
  /** Evidence claims supporting the relation, relationally linked. */
  evidenceClaimIds: string[];
  declaredByUserId: string | null;
  reason: string;
  limitations: string[];
  createdAt: string;
};

export type CrossDocumentStore = {
  // scope
  createScope(record: ComparisonScopeRecord): Promise<ComparisonScopeRecord>;
  findScope(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeRecord | null>;
  listScopes(input: { companyId: string; limit: number }): Promise<ComparisonScopeRecord[]>;
  updateScopeRevisionPolicy(input: { companyId: string; comparisonScopeId: string; revisionPolicy: string; updatedAt: string }): Promise<ComparisonScopeRecord | null>;
  addScopeArtifact(record: ComparisonScopeArtifactRecord): Promise<ComparisonScopeArtifactRecord>;
  listScopeArtifacts(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeArtifactRecord[]>;
  updateScopeArtifactRole(input: { companyId: string; comparisonScopeId: string; artifactId: string; documentRole: DocumentRole; documentRoleSource: DocumentRoleSource; declaredByUserId: string | null }): Promise<ComparisonScopeArtifactRecord | null>;

  // claims and materializations
  saveMaterialization(record: MaterializationRecordFixture): Promise<void>;
  listMaterializations(input: { companyId: string; comparisonScopeId: string }): Promise<MaterializationRecordFixture[]>;
  saveClaims(claims: readonly NormalizedEvidenceClaim[]): Promise<{ inserted: number; existing: number }>;
  /** Claims are immutable: this is the only mutation the store exposes, and it must refuse. */
  listClaims(input: { companyId: string; comparisonScopeId?: string; sourceArtifactId?: string; predicate?: string; subjectMatchKey?: string; documentIdentityId?: string; limit: number }): Promise<NormalizedEvidenceClaim[]>;
  findClaim(input: { companyId: string; claimId: string }): Promise<NormalizedEvidenceClaim | null>;
  countClaims(input: { companyId: string; comparisonScopeId?: string; sourceArtifactId?: string }): Promise<number>;

  // matching
  saveSubjectMatches(matches: readonly SubjectMatchRecord[]): Promise<void>;
  listSubjectMatches(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectMatchRecord[]>;
  saveSubjectClusters(clusters: readonly SubjectClusterRecord[]): Promise<void>;
  listSubjectClusters(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectClusterRecord[]>;
  findSubjectCluster(input: { companyId: string; subjectClusterId: string }): Promise<SubjectClusterRecord | null>;

  // findings
  findFindingByFingerprint(input: { companyId: string; comparisonScopeId: string; fingerprint: string }): Promise<CrossDocumentFindingRecord | null>;
  saveFinding(record: CrossDocumentFindingRecord): Promise<void>;
  updateFindingEngineFlags(input: { companyId: string; findingId: string; engineFlags: FindingEngineFlags; evidenceSignature: EvidenceSignature; comparisonRunId: string; updatedAt: string }): Promise<void>;
  markFindingReviewState(input: { companyId: string; findingId: string; reviewState: ReviewState; updatedAt: string }): Promise<void>;
  listFindings(input: { companyId: string; comparisonScopeId?: string; findingKind?: string; reviewState?: string; stale?: boolean; subjectClusterId?: string; limit: number }): Promise<CrossDocumentFindingRecord[]>;
  findFinding(input: { companyId: string; findingId: string }): Promise<CrossDocumentFindingRecord | null>;
  saveParticipants(input: { companyId: string; participants: readonly FindingParticipant[] }): Promise<void>;
  listParticipants(input: { companyId: string; findingId: string }): Promise<FindingParticipant[]>;
  appendReviewEvent(event: FindingReviewEvent): Promise<void>;
  listReviewEvents(input: { companyId: string; findingId: string; limit: number }): Promise<FindingReviewEvent[]>;

  // document governance
  upsertDocumentIdentity(record: DocumentIdentityRecord): Promise<DocumentIdentityRecord>;
  findDocumentIdentity(input: { companyId: string; documentIdentityId: string }): Promise<DocumentIdentityRecord | null>;
  listDocumentIdentities(input: { companyId: string; observedFamilyKey?: string; limit: number }): Promise<DocumentIdentityRecord[]>;
  saveRevisionMembership(membership: DocumentRevisionMembership): Promise<void>;
  listRevisionMemberships(input: { companyId: string; documentIdentityId?: string; sourceArtifactId?: string; limit: number }): Promise<DocumentRevisionMembership[]>;
  saveDocumentRelation(relation: DocumentRelationRecord): Promise<void>;
  listDocumentRelations(input: { companyId: string; documentIdentityId?: string; limit: number }): Promise<DocumentRelationRecord[]>;
  appendActiveRevisionDecision(record: ActiveRevisionDecisionRecord): Promise<void>;
  latestActiveRevisionDecision(input: { companyId: string; documentIdentityId: string }): Promise<ActiveRevisionDecisionRecord | null>;
  listActiveRevisionDecisions(input: { companyId: string; documentIdentityId: string; limit: number }): Promise<ActiveRevisionDecisionRecord[]>;

  // runs
  saveRun(record: ComparisonRunRecord): Promise<void>;
  findRun(input: { companyId: string; comparisonRunId: string }): Promise<ComparisonRunRecord | null>;
  listRuns(input: { companyId: string; comparisonScopeId?: string; limit: number }): Promise<ComparisonRunRecord[]>;
};

// ---------------------------------------------------------------------------
// Clock / ids
// ---------------------------------------------------------------------------

export interface ClockPort {
  now(): string;
}

export interface IdPort {
  next(prefix: string): string;
}

/** Small helper type re-exports so ports stay the single import for adapters. */
export type { SubjectMatchRecord, SubjectClusterRecord, MatchTier, SubjectMatchBlockerList };
export type { CrossDocumentFindingRecord };
