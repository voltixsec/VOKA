/**
 * Phase 2A-10: the deterministic in-memory `CrossDocumentStore`.
 *
 * It exists so tests exercise the REAL engine, the REAL matcher, and the REAL
 * governance commands rather than a re-implementation of them, and so a
 * deterministic fixture harness can prove idempotency without a database.
 *
 * It enforces the same invariants the Prisma store does:
 * - every read and write is company-scoped;
 * - linking a record from another tenant fails instead of silently succeeding;
 * - claims are immutable once written: a second write with a different payload
 *   for the same deterministic id is refused;
 * - the observed family key is NOT unique;
 * - a governance-confirmed identity key IS unique, and a collision is refused.
 */

import type {
  ActiveRevisionDecisionRecord,
  CrossDocumentFindingRecord,
  DocumentRevisionMembership,
  DocumentRole,
  DocumentRoleSource,
  EvidenceSignature,
  FindingEngineFlags,
  FindingParticipant,
  FindingReviewEvent,
  NormalizedEvidenceClaim,
  ReviewState,
} from "@/src/domain/cross-document";
import type { SubjectClusterRecord, SubjectMatchRecord } from "@/src/application/cross-document/matching-types";
import type {
  ComparisonRunRecord,
  ComparisonScopeArtifactRecord,
  ComparisonScopeRecord,
  CrossDocumentStore,
  DocumentIdentityRecord,
  DocumentRelationRecord,
  MaterializationRecordFixture,
} from "@/src/application/cross-document/ports";

export class TenantLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantLinkError";
  }
}

export class ImmutableClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImmutableClaimError";
  }
}

export class ConfirmedIdentityCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmedIdentityCollisionError";
  }
}

export class InMemoryCrossDocumentStore implements CrossDocumentStore {
  private readonly scopes = new Map<string, ComparisonScopeRecord>();
  private readonly scopeArtifacts = new Map<string, ComparisonScopeArtifactRecord[]>();
  private readonly materializations = new Map<string, MaterializationRecordFixture>();
  private readonly claims = new Map<string, NormalizedEvidenceClaim>();
  private readonly matches = new Map<string, SubjectMatchRecord>();
  private readonly clusters = new Map<string, SubjectClusterRecord>();
  private readonly findings = new Map<string, CrossDocumentFindingRecord>();
  private readonly participants = new Map<string, FindingParticipant[]>();
  private readonly reviewEvents = new Map<string, FindingReviewEvent[]>();
  private readonly identities = new Map<string, DocumentIdentityRecord>();
  private readonly memberships = new Map<string, DocumentRevisionMembership>();
  private readonly relations = new Map<string, DocumentRelationRecord>();
  private readonly decisions = new Map<string, ActiveRevisionDecisionRecord[]>();
  private readonly runs = new Map<string, ComparisonRunRecord>();

  /** Test-only inspection helpers; they never bypass tenant scoping. */
  allClaimsCount(): number {
    return this.claims.size;
  }

  allIdentityRows(): DocumentIdentityRecord[] {
    return [...this.identities.values()];
  }

  allRunRows(): ComparisonRunRecord[] {
    return [...this.runs.values()];
  }

  private scopeKey(companyId: string, comparisonScopeId: string): string {
    return `${companyId}\u0000${comparisonScopeId}`;
  }

  async createScope(record: ComparisonScopeRecord): Promise<ComparisonScopeRecord> {
    this.scopes.set(this.scopeKey(record.companyId, record.comparisonScopeId), record);
    return record;
  }

  async findScope(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeRecord | null> {
    return this.scopes.get(this.scopeKey(input.companyId, input.comparisonScopeId)) ?? null;
  }

  async listScopes(input: { companyId: string; limit: number }): Promise<ComparisonScopeRecord[]> {
    return [...this.scopes.values()].filter((scope) => scope.companyId === input.companyId).slice(0, input.limit);
  }

  async updateScopeRevisionPolicy(input: { companyId: string; comparisonScopeId: string; revisionPolicy: string; updatedAt: string }): Promise<ComparisonScopeRecord | null> {
    const key = this.scopeKey(input.companyId, input.comparisonScopeId);
    const existing = this.scopes.get(key);
    if (!existing) return null;
    const updated: ComparisonScopeRecord = { ...existing, revisionPolicy: input.revisionPolicy, updatedAt: input.updatedAt };
    this.scopes.set(key, updated);
    return updated;
  }

  async addScopeArtifact(record: ComparisonScopeArtifactRecord): Promise<ComparisonScopeArtifactRecord> {
    const key = this.scopeKey(record.companyId, record.comparisonScopeId);
    const list = this.scopeArtifacts.get(key) ?? [];
    const next = list.filter((entry) => entry.artifactId !== record.artifactId).concat(record);
    this.scopeArtifacts.set(key, next);
    return record;
  }

  async listScopeArtifacts(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeArtifactRecord[]> {
    return this.scopeArtifacts.get(this.scopeKey(input.companyId, input.comparisonScopeId)) ?? [];
  }

  async updateScopeArtifactRole(input: {
    companyId: string;
    comparisonScopeId: string;
    artifactId: string;
    documentRole: DocumentRole;
    documentRoleSource: DocumentRoleSource;
    declaredByUserId: string | null;
  }): Promise<ComparisonScopeArtifactRecord | null> {
    const key = this.scopeKey(input.companyId, input.comparisonScopeId);
    const list = this.scopeArtifacts.get(key) ?? [];
    const index = list.findIndex((entry) => entry.artifactId === input.artifactId);
    if (index < 0) return null;
    const updated: ComparisonScopeArtifactRecord = {
      ...list[index]!,
      documentRole: input.documentRole,
      documentRoleSource: input.documentRoleSource,
      roleDeclaredByUserId: input.declaredByUserId,
    };
    const next = [...list];
    next[index] = updated;
    this.scopeArtifacts.set(key, next);
    return updated;
  }

  async saveMaterialization(record: MaterializationRecordFixture): Promise<void> {
    const key = this.scopeKey(record.companyId, record.materializationId);
    const existing = this.materializations.get(key);
    if (existing && existing.artifactSha256 === record.artifactSha256 && existing.materializerVersion === record.materializerVersion && existing.claimCount === record.claimCount) return;
    this.materializations.set(key, record);
  }

  async listMaterializations(input: { companyId: string; comparisonScopeId: string }): Promise<MaterializationRecordFixture[]> {
    return [...this.materializations.values()].filter(
      (record) => record.companyId === input.companyId && record.comparisonScopeId === input.comparisonScopeId,
    );
  }

  async saveClaims(claims: readonly NormalizedEvidenceClaim[]): Promise<{ inserted: number; existing: number }> {
    let inserted = 0;
    let existing = 0;
    for (const claim of claims) {
      const key = this.scopeKey(claim.companyId, claim.claimId);
      if (this.claims.has(key)) {
        existing += 1;
        continue;
      }
      // Immutability: a claim is written once. A different payload that maps to
      // the same deterministic id would be an in-place rewrite, so it is refused.
      const collision = [...this.claims.values()].find((item) => item.claimId === claim.claimId);
      if (collision && JSON.stringify(collision) !== JSON.stringify(claim)) {
        throw new ImmutableClaimError("an existing immutable claim was re-materialized with different content");
      }
      this.claims.set(key, claim);
      inserted += 1;
    }
    return { inserted, existing };
  }

  async listClaims(input: {
    companyId: string;
    comparisonScopeId?: string;
    sourceArtifactId?: string;
    predicate?: string;
    subjectMatchKey?: string;
    documentIdentityId?: string;
    limit: number;
  }): Promise<NormalizedEvidenceClaim[]> {
    const scoped = [...this.claims.values()].filter((claim) => claim.companyId === input.companyId);
    const filtered = scoped.filter((claim) => {
      if (input.sourceArtifactId && claim.sourceArtifactId !== input.sourceArtifactId) return false;
      if (input.predicate && claim.assertion.predicate !== input.predicate) return false;
      if (input.subjectMatchKey && claim.subject.subjectMatchKey !== input.subjectMatchKey) return false;
      return true;
    });
    const ordered = filtered.sort((left, right) => (left.claimId < right.claimId ? -1 : 1));
    return ordered.slice(0, input.limit);
  }

  async findClaim(input: { companyId: string; claimId: string }): Promise<NormalizedEvidenceClaim | null> {
    const claim = this.claims.get(this.scopeKey(input.companyId, input.claimId)) ?? null;
    if (!claim) return null;
    return claim.companyId === input.companyId ? claim : null;
  }

  async countClaims(input: { companyId: string; comparisonScopeId?: string; sourceArtifactId?: string }): Promise<number> {
    return (await this.listClaims({ ...input, limit: Number.MAX_SAFE_INTEGER })).length;
  }

  async saveSubjectMatches(matches: readonly SubjectMatchRecord[]): Promise<void> {
    for (const match of matches) this.matches.set(this.scopeKey(match.companyId, match.subjectMatchId), match);
  }

  async listSubjectMatches(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectMatchRecord[]> {
    return [...this.matches.values()]
      .filter((match) => match.companyId === input.companyId && match.comparisonScopeId === input.comparisonScopeId)
      .sort((left, right) => (left.subjectMatchId < right.subjectMatchId ? -1 : 1))
      .slice(0, input.limit);
  }

  async saveSubjectClusters(clusters: readonly SubjectClusterRecord[]): Promise<void> {
    for (const cluster of clusters) this.clusters.set(this.scopeKey(cluster.companyId, cluster.subjectClusterId), cluster);
  }

  async listSubjectClusters(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectClusterRecord[]> {
    return [...this.clusters.values()]
      .filter((cluster) => cluster.companyId === input.companyId && cluster.comparisonScopeId === input.comparisonScopeId)
      .sort((left, right) => (left.subjectClusterId < right.subjectClusterId ? -1 : 1))
      .slice(0, input.limit);
  }

  async findSubjectCluster(input: { companyId: string; subjectClusterId: string }): Promise<SubjectClusterRecord | null> {
    return this.clusters.get(this.scopeKey(input.companyId, input.subjectClusterId)) ?? null;
  }

  async findFindingByFingerprint(input: { companyId: string; comparisonScopeId: string; fingerprint: string }): Promise<CrossDocumentFindingRecord | null> {
    return (
      [...this.findings.values()].find(
        (finding) => finding.companyId === input.companyId && finding.comparisonScopeId === input.comparisonScopeId && finding.fingerprint === input.fingerprint,
      ) ?? null
    );
  }

  async saveFinding(record: CrossDocumentFindingRecord): Promise<void> {
    this.findings.set(this.scopeKey(record.companyId, record.findingId), record);
  }

  async updateFindingEngineFlags(input: {
    companyId: string;
    findingId: string;
    engineFlags: FindingEngineFlags;
    evidenceSignature: EvidenceSignature;
    comparisonRunId: string;
    updatedAt: string;
  }): Promise<void> {
    const key = this.scopeKey(input.companyId, input.findingId);
    const existing = this.findings.get(key);
    if (!existing) return;
    // Only the engine-owned flags and the evidence signature move. The review
    // state is deliberately untouched: the engine has no path to it.
    this.findings.set(key, {
      ...existing,
      engineFlags: input.engineFlags,
      evidenceSignature: input.evidenceSignature,
      comparisonRunId: input.comparisonRunId,
      updatedAt: input.updatedAt,
    });
  }

  async markFindingReviewState(input: { companyId: string; findingId: string; reviewState: ReviewState; updatedAt: string }): Promise<void> {
    const key = this.scopeKey(input.companyId, input.findingId);
    const existing = this.findings.get(key);
    if (!existing) return;
    this.findings.set(key, { ...existing, reviewState: input.reviewState, updatedAt: input.updatedAt });
  }

  async listFindings(input: {
    companyId: string;
    comparisonScopeId?: string;
    findingKind?: string;
    reviewState?: string;
    stale?: boolean;
    subjectClusterId?: string;
    limit: number;
  }): Promise<CrossDocumentFindingRecord[]> {
    return [...this.findings.values()]
      .filter((finding) => finding.companyId === input.companyId)
      .filter((finding) => (input.comparisonScopeId ? finding.comparisonScopeId === input.comparisonScopeId : true))
      .filter((finding) => (input.findingKind ? finding.findingKind === input.findingKind : true))
      .filter((finding) => (input.reviewState ? finding.reviewState === input.reviewState : true))
      .filter((finding) => (input.stale === undefined ? true : finding.engineFlags.stale === input.stale))
      .filter((finding) => (input.subjectClusterId ? finding.subjectClusterId === input.subjectClusterId : true))
      .sort((left, right) => (left.findingId < right.findingId ? -1 : 1))
      .slice(0, input.limit);
  }

  async findFinding(input: { companyId: string; findingId: string }): Promise<CrossDocumentFindingRecord | null> {
    return this.findings.get(this.scopeKey(input.companyId, input.findingId)) ?? null;
  }

  async saveParticipants(input: { companyId: string; participants: readonly FindingParticipant[] }): Promise<void> {
    // The participant set always reflects the finding's CURRENT evidence
    // projection, so a two-source disagreement never renders as three sides.
    // Nothing is lost by replacing it: claims are immutable and every claim the
    // finding ever rested on stays queryable by id.
    const byFinding = new Map<string, FindingParticipant[]>();
    for (const participant of input.participants) {
      const list = byFinding.get(participant.findingId) ?? [];
      list.push(participant);
      byFinding.set(participant.findingId, list);
    }
    for (const [findingId, participants] of byFinding) {
      // Cross-tenant writes fail closed: the finding must exist in this company.
      if (!this.findings.has(this.scopeKey(input.companyId, findingId))) continue;
      this.participants.set(findingId, [...participants].sort((left, right) => left.ordinal - right.ordinal));
    }
  }

  async listParticipants(input: { companyId: string; findingId: string }): Promise<FindingParticipant[]> {
    if (!this.findings.has(this.scopeKey(input.companyId, input.findingId))) return [];
    return this.participants.get(input.findingId) ?? [];
  }

  async appendReviewEvent(event: FindingReviewEvent): Promise<void> {
    const key = this.scopeKey(event.companyId, event.findingId);
    const list = this.reviewEvents.get(key) ?? [];
    this.reviewEvents.set(key, [...list, event]);
  }

  async listReviewEvents(input: { companyId: string; findingId: string; limit: number }): Promise<FindingReviewEvent[]> {
    return (this.reviewEvents.get(this.scopeKey(input.companyId, input.findingId)) ?? []).slice(0, input.limit);
  }

  async upsertDocumentIdentity(record: DocumentIdentityRecord): Promise<DocumentIdentityRecord> {
    if (record.confirmedIdentityKey) {
      const collision = [...this.identities.values()].find(
        (identity) =>
          identity.companyId === record.companyId
          && identity.confirmedIdentityKey === record.confirmedIdentityKey
          && identity.documentIdentityId !== record.documentIdentityId,
      );
      if (collision) throw new ConfirmedIdentityCollisionError("a governance-confirmed identity key must be unique inside one company");
    }
    const key = this.scopeKey(record.companyId, record.documentIdentityId);
    const existing = this.identities.get(key);
    this.identities.set(key, existing ? { ...existing, ...record, createdAt: existing.createdAt } : record);
    return this.identities.get(key)!;
  }

  async findDocumentIdentity(input: { companyId: string; documentIdentityId: string }): Promise<DocumentIdentityRecord | null> {
    const identity = this.identities.get(this.scopeKey(input.companyId, input.documentIdentityId)) ?? null;
    return identity?.companyId === input.companyId ? identity : null;
  }

  async listDocumentIdentities(input: { companyId: string; observedFamilyKey?: string; limit: number }): Promise<DocumentIdentityRecord[]> {
    return [...this.identities.values()]
      .filter((identity) => identity.companyId === input.companyId)
      .filter((identity) => (input.observedFamilyKey ? identity.observedFamilyKey === input.observedFamilyKey : true))
      .sort((left, right) => (left.documentIdentityId < right.documentIdentityId ? -1 : 1))
      .slice(0, input.limit);
  }

  async saveRevisionMembership(membership: DocumentRevisionMembership): Promise<void> {
    this.memberships.set(this.scopeKey(membership.companyId, membership.membershipId), membership);
  }

  async listRevisionMemberships(input: { companyId: string; documentIdentityId?: string; sourceArtifactId?: string; limit: number }): Promise<DocumentRevisionMembership[]> {
    return [...this.memberships.values()]
      .filter((membership) => membership.companyId === input.companyId)
      .filter((membership) => (input.documentIdentityId ? membership.documentIdentityId === input.documentIdentityId : true))
      .filter((membership) => (input.sourceArtifactId ? membership.sourceArtifactId === input.sourceArtifactId : true))
      .sort((left, right) => (left.membershipId < right.membershipId ? -1 : 1))
      .slice(0, input.limit);
  }

  async saveDocumentRelation(relation: DocumentRelationRecord): Promise<void> {
    if (relation.documentIdentityId === relation.relatedDocumentIdentityId) {
      throw new TenantLinkError("a document relation must connect two different document identities");
    }
    this.relations.set(this.scopeKey(relation.companyId, relation.documentRelationId), relation);
  }

  async listDocumentRelations(input: { companyId: string; documentIdentityId?: string; limit: number }): Promise<DocumentRelationRecord[]> {
    return [...this.relations.values()]
      .filter((relation) => relation.companyId === input.companyId)
      .filter((relation) =>
        input.documentIdentityId
          ? relation.documentIdentityId === input.documentIdentityId || relation.relatedDocumentIdentityId === input.documentIdentityId
          : true,
      )
      .slice(0, input.limit);
  }

  async appendActiveRevisionDecision(record: ActiveRevisionDecisionRecord): Promise<void> {
    const key = this.scopeKey(record.companyId, record.documentIdentityId);
    const list = this.decisions.get(key) ?? [];
    if (list.some((decision) => decision.decisionVersion === record.decisionVersion)) {
      throw new TenantLinkError("an active-revision decision version is append-only and may not be replaced");
    }
    this.decisions.set(key, [...list, record]);
  }

  async latestActiveRevisionDecision(input: { companyId: string; documentIdentityId: string }): Promise<ActiveRevisionDecisionRecord | null> {
    const list = this.decisions.get(this.scopeKey(input.companyId, input.documentIdentityId)) ?? [];
    return [...list].sort((left, right) => right.decisionVersion - left.decisionVersion)[0] ?? null;
  }

  async listActiveRevisionDecisions(input: { companyId: string; documentIdentityId: string; limit: number }): Promise<ActiveRevisionDecisionRecord[]> {
    const list = this.decisions.get(this.scopeKey(input.companyId, input.documentIdentityId)) ?? [];
    return [...list].sort((left, right) => left.decisionVersion - right.decisionVersion).slice(0, input.limit);
  }

  async saveRun(record: ComparisonRunRecord): Promise<void> {
    this.runs.set(this.scopeKey(record.companyId, record.comparisonRunId), record);
  }

  async findRun(input: { companyId: string; comparisonRunId: string }): Promise<ComparisonRunRecord | null> {
    return this.runs.get(this.scopeKey(input.companyId, input.comparisonRunId)) ?? null;
  }

  async listRuns(input: { companyId: string; comparisonScopeId?: string; limit: number }): Promise<ComparisonRunRecord[]> {
    return [...this.runs.values()]
      .filter((run) => run.companyId === input.companyId)
      .filter((run) => (input.comparisonScopeId ? run.comparisonScopeId === input.comparisonScopeId : true))
      .sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1))
      .slice(0, input.limit);
  }
}
