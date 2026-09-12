/**
 * Phase 2A-10: the comparison run orchestrator.
 *
 * Flow, in the governed order:
 *
 *   SourceArtifact bytes (hash verified)
 *     → deterministic materialization into immutable claims
 *     → Phase 2A-9 lineage collapse (one family = one voice)
 *     → evidence-suggested document identity + revision membership
 *     → governed revision policy (a superseded revision is never "current")
 *     → indexed conservative subject matching
 *     → cross-document findings with stable identity and evidence signature
 *     → engine flags only (reproduced / stale / evidenceChanged)
 *
 * The human review state is NEVER touched here: the engine has no path to it.
 */

import { createHash } from "node:crypto";
import {
  ACTIVE_REVISION_GOVERNANCE_VERSION,
  CROSS_DOCUMENT_BOUNDS,
  CROSS_DOCUMENT_ENGINE_VERSION,
  FINDING_PROJECTOR_VERSION,
  SUBJECT_MATCHER_VERSION,
  buildFindingEvidenceObservationId,
  buildMaterializationId,
  defaultEnabledFindingKinds,
  nextEngineFlags,
  selectStaleReason,
  type CrossDocumentFindingRecord,
  type EvidenceSignature,
  type FindingEngineFlags,
  type FindingKind,
  type FindingParticipant,
  type NormalizedEvidenceClaim,
  type StaleReason,
} from "@/src/domain/cross-document";
import { computeComparison, type ArtifactDocumentContext, type ComparisonArtifactState, type ComparisonComputation } from "./computeComparison";
import { applyRevisionPolicy, buildRevisionMemberships, planDocumentIdentities, resolveDocumentIdentities, type DocumentIdentityCandidate } from "./DocumentGovernance";
import { collapseDerivationFamilies, type ComparisonVoice } from "./LineageCollapse";
import { attachParticipantDocumentContext } from "./FindingProjection";
import { applyActiveRevisionDecision, type ActiveRevisionDecisionCommand } from "./ActiveRevisionDecisionService";
import type {
  ClockPort,
  ComparisonRunRecord,
  ComparisonScopeRecord,
  CrossDocumentStore,
  DerivationReadModel,
  DerivationReaderPort,
  EvidenceMaterializationPort,
  IdPort,
  MaterializedArtifact,
  SourceArtifactReaderPort,
  SourceArtifactRef,
} from "./ports";

export type ComparisonDependencies = {
  store: CrossDocumentStore;
  artifacts: SourceArtifactReaderPort;
  derivations: DerivationReaderPort;
  materialization: EvidenceMaterializationPort;
  clock: ClockPort;
  ids: IdPort;
};

export type ComparisonRunResult = {
  comparisonRunId: string;
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  claimCount: number;
  matchCount: number;
  clusterCount: number;
  findingCount: number;
  newFindingCount: number;
  reproducedFindingCount: number;
  notReproducedFindingCount: number;
  blockReasons: string[];
  limitations: string[];
  truncated: boolean;
  voiceCount: number;
  documentIdentityIds: string[];
};

/** Deterministic digest of everything a run's logical output depends on. */
function inputDigest(input: {
  companyId: string;
  comparisonScopeId: string;
  materializerVersions: Record<string, string>;
  artifacts: ReadonlyArray<{ artifactId: string; sha256: string; materializerVersion: string }>;
  scope: Pick<ComparisonScopeRecord, "revisionPolicy" | "predicateFilters" | "roleFilters">;
  enabledFindingKinds: readonly FindingKind[];
}): string {
  const canonical = [
    "voka:2a-10:run-digest:v1",
    input.companyId,
    input.comparisonScopeId,
    CROSS_DOCUMENT_ENGINE_VERSION,
    SUBJECT_MATCHER_VERSION,
    FINDING_PROJECTOR_VERSION,
    input.scope.revisionPolicy,
    [...input.scope.predicateFilters].sort().join(","),
    [...input.scope.roleFilters].sort().join(","),
    [...input.enabledFindingKinds].sort().join(","),
    ...input.artifacts
      .map((artifact) => `${artifact.artifactId}:${artifact.sha256}:${artifact.materializerVersion}`)
      .sort(),
  ].join("\u0000");
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Runs one governed cross-document comparison.
 *
 * The function is deterministic for identical inputs and versions, and it
 * always writes a run record — including when the comparison is blocked — so a
 * reviewer can see why nothing was compared instead of seeing an empty result.
 */
export async function runCrossDocumentComparison(input: {
  companyId: string;
  comparisonScopeId: string;
  actorUserId: string;
  dependencies: ComparisonDependencies;
  /** Explicit decision commands applied before the run, so a blocked identity can be unblocked. */
  decisions?: readonly ActiveRevisionDecisionCommand[];
}): Promise<ComparisonRunResult> {
  const { store, artifacts: artifactReader, derivations: derivationReader, materialization, clock, ids } = input.dependencies;
  const startedAt = clock.now();

  const scope = await store.findScope({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
  if (!scope) throw new Error("the comparison scope was not found for the active company");
  const scopeArtifacts = await store.listScopeArtifacts({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });

  // Explicit governance commands are applied first, so a decision recorded in
  // this run is the decision the run obeys.
  for (const command of input.decisions ?? []) {
    const outcome = await applyActiveRevisionDecision({ command, store });
    if (!outcome.ok) throw new Error(`active revision decision refused: ${outcome.problem}`);
  }

  const refs = await artifactReader.listArtifacts({
    companyId: input.companyId,
    artifactIds: scopeArtifacts.map((entry) => entry.artifactId),
    limit: 64,
  });
  const refById = new Map(refs.map((ref) => [ref.artifactId, ref]));

  // Phase 2A-9 lineage: read-only, one family = one voice.
  const derivations = await derivationReader.listForArtifacts({ companyId: input.companyId, artifactIds: refs.map((ref) => ref.artifactId) });
  const collapse = collapseDerivationFamilies({ artifacts: refs, derivations });
  const voiceByArtifact = new Map<string, ComparisonVoice>();
  for (const voice of collapse.voices) for (const artifactId of voice.evidenceArtifactIds) voiceByArtifact.set(artifactId, voice);

  const runId = ids.next("run");
  const materials: MaterializedArtifact[] = [];
  for (const ref of refs) {
    const voice = voiceByArtifact.get(ref.artifactId);
    const lineageRoot = voice?.derivationFamilyRootArtifactId ?? ref.artifactId;
    const lineage = {
      derivationFamilyRootArtifactId: lineageRoot,
      lineageRole: voice?.lineageRole ?? ("STANDALONE" as const),
      derivation: voice?.derivation ?? null,
    };
    const materialized = await materialization.materialize({ companyId: input.companyId, runId, createdAt: startedAt, artifact: ref, lineage });
    materials.push(materialized);
    await store.saveMaterialization({
      materializationId: materialized.materializationId,
      companyId: input.companyId,
      comparisonScopeId: input.comparisonScopeId,
      sourceArtifactId: materialized.artifact.artifactId,
      artifactSha256: materialized.artifact.contentSha256,
      sourceKind: materialized.artifact.kind,
      materializerVersion: materialized.materializerVersion,
      readingChannels: materialized.readingChannels,
      coverage: materialized.coverage,
      claimCount: materialized.claims.length,
      truncated: materialized.truncated,
      truncationReasons: materialized.truncationReasons,
      warnings: materialized.warnings,
      limitations: materialized.limitations,
      createdAt: startedAt,
    });
  }
  await store.saveClaims(materials.flatMap((material) => material.claims));

  // Document identity and revision membership: evidence-suggested, never merged.
  const resolution = resolveDocumentIdentities({ companyId: input.companyId, materials });
  const plan = planDocumentIdentities({ resolution });
  for (const identity of plan.identities) {
    await store.upsertDocumentIdentity({
      documentIdentityId: identity.documentIdentityId,
      companyId: input.companyId,
      kind: identity.kind,
      label: identity.label,
      observedFamilyKey: identity.observedFamilyKey,
      confirmedIdentityKey: null,
      identityBasis: identity.kind === "UNRESOLVED" ? "UNRESOLVED" : "EVIDENCE_SUGGESTED",
      ambiguous: identity.ambiguous,
      evidence: identity.evidence.map((item) => ({
        kind: item.kind,
        value: item.value,
        sourceArtifactId: item.sourceArtifactId,
        claimId: item.claimId,
        locator: item.locator,
        reliability: item.reliability,
        limitations: item.limitations,
      })),
      limitations: ["an evidence-suggested identity is not a confirmed database identity; confirming it is a governance action"],
      resolverVersion: "2a-10.identity.v1",
      createdAt: startedAt,
      updatedAt: startedAt,
    });
  }

  const roleByArtifact = new Map(scopeArtifacts.map((entry) => [entry.artifactId, { documentRole: entry.documentRole, documentRoleSource: entry.documentRoleSource }]));
  const memberships = materials.flatMap((material) =>
    buildRevisionMemberships({
      companyId: input.companyId,
      createdAt: startedAt,
      material,
      candidates: resolution.candidatesByArtifact.get(material.artifact.artifactId) ?? [],
      documentRole: roleByArtifact.get(material.artifact.artifactId)?.documentRole ?? "UNKNOWN",
      documentRoleSource: roleByArtifact.get(material.artifact.artifactId)?.documentRoleSource ?? "OBSERVED_FROM_CONTENT",
    }),
  );
  for (const membership of memberships) await store.saveRevisionMembership(membership);

  const decisionsByDocumentIdentity = new Map<string, Awaited<ReturnType<CrossDocumentStore["latestActiveRevisionDecision"]>>>();
  for (const documentIdentityId of new Set(memberships.map((membership) => membership.documentIdentityId))) {
    decisionsByDocumentIdentity.set(documentIdentityId, await store.latestActiveRevisionDecision({ companyId: input.companyId, documentIdentityId }));
  }

  const ambiguousArtifactIds = new Set(
    materials.filter((material) => (resolution.candidatesByArtifact.get(material.artifact.artifactId) ?? []).some((candidate: DocumentIdentityCandidate) => candidate.ambiguous)).map((material) => material.artifact.artifactId),
  );
  const unavailableArtifactIds = new Set(materials.filter((material) => material.unavailable).map((material) => material.artifact.artifactId));

  const policy = applyRevisionPolicy({
    revisionPolicy: scope.revisionPolicy,
    memberships,
    decisionsByDocumentIdentity,
    ambiguousArtifactIds,
    unavailableArtifactIds,
  });

  const documentContext: ArtifactDocumentContext[] = materials.map((material) => {
    const membership = memberships.find((entry) => entry.sourceArtifactId === material.artifact.artifactId) ?? null;
    const candidates = resolution.candidatesByArtifact.get(material.artifact.artifactId) ?? [];
    const excluded = policy.excludedArtifactIds.get(material.artifact.artifactId) ?? null;
    return {
      artifactId: material.artifact.artifactId,
      documentIdentityId: candidates.length === 1 ? candidates[0]!.documentIdentityId : null,
      revisionMembershipId: membership?.membershipId ?? null,
      documentRole: roleByArtifact.get(material.artifact.artifactId)?.documentRole ?? "UNKNOWN",
      observedRevisionLabel: membership?.observedRevisionLabel ?? null,
      excludedFromComparison: Boolean(excluded),
      exclusionReason: excluded,
    };
  });

  const artifactStates: ComparisonArtifactState[] = materials.map((material) => ({
    artifactId: material.artifact.artifactId,
    derivationFamilyRootArtifactId: material.lineage.derivationFamilyRootArtifactId,
    coverage: material.coverage,
    unavailable: material.unavailable,
    claimCount: material.claims.length,
    truncated: material.truncated,
    truncationReasons: material.truncationReasons,
    limitations: material.limitations,
  }));

  const enabledFindingKinds = scope.predicateFilters.includes("ENABLE_DESCRIPTION_MISMATCH")
    ? defaultEnabledFindingKinds().concat("DESCRIPTION_MISMATCH")
    : defaultEnabledFindingKinds();

  const computation = computeComparison({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    comparisonRunId: runId,
    createdAt: startedAt,
    scope,
    voices: collapse.voices,
    claims: materials.flatMap((material) => material.claims),
    artifactStates,
    documentContext,
    enabledFindingKinds,
    blockedDocumentIdentities: policy.blockedDocumentIdentities,
  });

  // Persist matching and clusters, then reconcile findings.
  await store.saveSubjectMatches(computation.matches);
  await store.saveSubjectClusters(computation.clusters);

  const existingFindings = await store.listFindings({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, limit: CROSS_DOCUMENT_BOUNDS.maxFindingsPerRun });
  const existingByFingerprint = new Map(existingFindings.map((finding) => [finding.fingerprint, finding]));
  const currentClaimIds = new Set(materials.flatMap((material) => material.claims.map((claim) => claim.claimId)));
  const reproducedFingerprints = new Set<string>();

  let newFindingCount = 0;
  let reproducedFindingCount = 0;
  const documentContextMap = new Map(documentContext.map((entry) => [entry.artifactId, { documentRole: entry.documentRole, documentIdentityId: entry.documentIdentityId, membershipId: entry.revisionMembershipId }]));

  for (const projected of computation.findings) {
    const existing = existingByFingerprint.get(projected.record.fingerprint) ?? null;
    const signatureChanged = existing ? existing.evidenceSignature.signatureHash !== projected.record.evidenceSignature.signatureHash : false;
    const flags = nextEngineFlags({
      reproduced: true,
      evidenceChanged: signatureChanged,
      previous: existing?.engineFlags ?? emptyEngineFlags(),
      runId,
      now: startedAt,
    });
    reproducedFingerprints.add(projected.record.fingerprint);
    const participants = attachParticipantDocumentContext(projected.participants, documentContextMap);
    if (existing) {
      reproducedFindingCount += 1;
      await store.updateFindingEngineFlags({
        companyId: input.companyId,
        findingId: existing.findingId,
        engineFlags: flags,
        evidenceSignature: projected.record.evidenceSignature,
        comparisonRunId: runId,
        // This run's projector produced the current projection.
        projectorVersion: FINDING_PROJECTOR_VERSION,
        updatedAt: startedAt,
      });
      await store.saveParticipants({ companyId: input.companyId, participants });
      // The finding row now carries only the CURRENT projection, so the previous
      // one is preserved as a durable observation instead of being lost.
      await recordEvidenceObservation({
        store,
        companyId: input.companyId,
        findingId: existing.findingId,
        fingerprint: projected.record.fingerprint,
        comparisonRunId: runId,
        evidenceSignature: projected.record.evidenceSignature,
        participants,
        evidenceChanged: signatureChanged,
        observedAt: startedAt,
      });
      continue;
    }
    newFindingCount += 1;
    const record: CrossDocumentFindingRecord = {
      ...projected.record,
      engineFlags: flags,
      // A brand-new finding starts OPEN. The engine sets the initial state and
      // never moves it again: only a human transition does.
      reviewState: "OPEN",
    };
    await store.saveFinding(record);
    await store.saveParticipants({ companyId: input.companyId, participants });
    await recordEvidenceObservation({
      store,
      companyId: input.companyId,
      findingId: record.findingId,
      fingerprint: record.fingerprint,
      comparisonRunId: runId,
      evidenceSignature: record.evidenceSignature,
      participants,
      evidenceChanged: false,
      observedAt: startedAt,
    });
  }

  // A finding that did not reproduce is flagged — never deleted — and the flag
  // says WHY, truthfully. The artifact state of this run is compared with the
  // immutable claim the finding was projected from, so "the bytes changed", "the
  // artifact left the scope", and "the claims are no longer produced" stay
  // distinguishable instead of collapsing into one vague reason.
  const currentArtifactState = new Map(
    materials.map((material) => [
      material.artifact.artifactId,
      { sha256: material.artifact.contentSha256, claimCount: material.claims.length, hashMismatch: material.byteVerification === "HASH_MISMATCH" },
    ]),
  );

  let notReproducedFindingCount = 0;
  for (const existing of existingFindings) {
    if (reproducedFingerprints.has(existing.fingerprint)) continue;
    notReproducedFindingCount += 1;
    const observed: StaleReason[] = [];
    for (const entry of existing.evidenceSignature.entries) {
      const state = currentArtifactState.get(entry.sourceArtifactId);
      if (!state) {
        observed.push("SCOPE_CHANGED");
        continue;
      }
      // A failed byte verification is the strongest possible statement about the
      // source: VOKA refused to read it at all, so the reason says the bytes
      // changed rather than collapsing into "the claims are no longer produced".
      if (state.hashMismatch) {
        observed.push("ARTIFACT_BYTES_CHANGED");
        continue;
      }
      // Claims are immutable, so the historical claim still answers what the
      // artifact hash was when this finding was projected.
      const historical = await store.findClaim({ companyId: input.companyId, claimId: entry.claimId });
      if (historical && historical.artifactSha256 !== state.sha256) {
        observed.push("ARTIFACT_BYTES_CHANGED");
        continue;
      }
      if (!currentClaimIds.has(entry.claimId)) observed.push("CLAIMS_SUPERSEDED");
    }
    // Exactly one reason, chosen by a fixed precedence over the SET of reasons
    // this run observed. The selection is order-independent and date-free, so
    // the same evidence always produces the same stale reason.
    const staleReason: StaleReason = selectStaleReason({
      observed,
      projectorVersionChanged: existing.projectorVersion !== FINDING_PROJECTOR_VERSION,
    });
    await store.updateFindingEngineFlags({
      companyId: input.companyId,
      findingId: existing.findingId,
      // History is never deleted: the finding stays queryable and is only
      // flagged as no longer reproduced by the latest run.
      engineFlags: nextEngineFlags({ reproduced: false, evidenceChanged: false, previous: existing.engineFlags, runId, now: startedAt, staleReasonOverride: staleReason }),
      evidenceSignature: existing.evidenceSignature,
      comparisonRunId: runId,
      // Not re-projected by this run, so the historical projector is preserved:
      // rewriting it would erase the very evidence the stale reason cites.
      projectorVersion: existing.projectorVersion,
      updatedAt: startedAt,
    });
  }

  const materializerVersions: Record<string, string> = {};
  for (const material of materials) materializerVersions[material.artifact.artifactId] = material.materializerVersion;

  const digest = inputDigest({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    materializerVersions,
    artifacts: materials.map((material) => ({ artifactId: material.artifact.artifactId, sha256: material.artifact.contentSha256, materializerVersion: material.materializerVersion })),
    scope: { revisionPolicy: scope.revisionPolicy, predicateFilters: scope.predicateFilters, roleFilters: scope.roleFilters },
    enabledFindingKinds,
  });

  const finishedAt = clock.now();
  const blockReasons = [...new Set([...computation.blockReasons, ...policy.blockReasons])].sort();
  const limitations = [...new Set([...computation.limitations, ...policy.limitations, ...collapse.limitations, ...resolution.limitations])].slice(0, 16);
  const status: ComparisonRunRecord["status"] = blockReasons.length ? "BLOCKED" : "COMPLETED";

  await store.saveRun({
    comparisonRunId: runId,
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    engineVersion: CROSS_DOCUMENT_ENGINE_VERSION,
    matcherVersion: SUBJECT_MATCHER_VERSION,
    projectorVersion: FINDING_PROJECTOR_VERSION,
    materializerVersions,
    artifactStates: materials.map((material) => ({
      artifactId: material.artifact.artifactId,
      sha256: material.artifact.contentSha256,
      coverage: material.coverage,
      claimCount: material.claims.length,
      unavailable: material.unavailable,
    })),
    claimCount: computation.claimCount,
    matchCount: computation.matchCount,
    findingCount: computation.findings.length,
    newFindingCount,
    reproducedFindingCount,
    notReproducedFindingCount,
    truncated: computation.truncated,
    limitations,
    startedAt,
    finishedAt,
    status: blockReasons.length && computation.findings.length === 0 ? "BLOCKED" : status,
    blockReasons,
    actorUserId: input.actorUserId,
    inputDigest: digest,
  });

  return {
    comparisonRunId: runId,
    status: blockReasons.length && computation.findings.length === 0 ? "BLOCKED" : status,
    claimCount: computation.claimCount,
    matchCount: computation.matchCount,
    clusterCount: computation.clusters.length,
    findingCount: computation.findings.length,
    newFindingCount,
    reproducedFindingCount,
    notReproducedFindingCount,
    blockReasons,
    limitations,
    truncated: computation.truncated,
    voiceCount: collapse.voices.length,
    documentIdentityIds: plan.identities.map((identity) => identity.documentIdentityId),
  };
}

function emptyEngineFlags(): FindingEngineFlags {
  return { reproduced: false, stale: false, staleReason: null, evidenceChanged: false, lastReproducedRunId: null, lastReproducedAt: null };
}

/**
 * Appends ONE durable evidence observation of a finding by this run.
 *
 * The finding row is intentionally overwritten with the current projection so a
 * two-source disagreement never renders as three sides; this is what makes that
 * safe. Each observation links the finding and the run to the IMMUTABLE claims
 * it rested on, in a stable order, so an earlier projection — with its old claim
 * ids, exact old locators, and exact old literals — stays reconstructible after
 * a later run replaced the current participants.
 *
 * It is append-only: the observation id is deterministic over (finding, run),
 * so a re-run collides with itself instead of appending a duplicate, and no
 * earlier observation is ever updated or deleted.
 */
async function recordEvidenceObservation(input: {
  store: CrossDocumentStore;
  companyId: string;
  findingId: string;
  fingerprint: string;
  comparisonRunId: string;
  evidenceSignature: EvidenceSignature;
  participants: readonly FindingParticipant[];
  evidenceChanged: boolean;
  observedAt: string;
}): Promise<void> {
  const observationId = buildFindingEvidenceObservationId({ findingId: input.findingId, comparisonRunId: input.comparisonRunId });
  const entries = input.participants.slice(0, CROSS_DOCUMENT_BOUNDS.maxEvidenceObservationEntries);
  await input.store.saveFindingEvidenceObservation({
    record: {
      observationId,
      companyId: input.companyId,
      findingId: input.findingId,
      comparisonRunId: input.comparisonRunId,
      fingerprint: input.fingerprint,
      evidenceSignatureHash: input.evidenceSignature.signatureHash,
      evidenceChanged: input.evidenceChanged,
      entryCount: entries.length,
      observedAt: input.observedAt,
    },
    entries: entries.map((participant, index) => ({
      observationId,
      companyId: input.companyId,
      findingId: input.findingId,
      comparisonRunId: input.comparisonRunId,
      claimId: participant.claimId,
      ordinal: participant.ordinal || index + 1,
    })),
  });
}

export const RUN_VERSIONS = {
  engine: CROSS_DOCUMENT_ENGINE_VERSION,
  matcher: SUBJECT_MATCHER_VERSION,
  projector: FINDING_PROJECTOR_VERSION,
  activeRevisionGovernance: ACTIVE_REVISION_GOVERNANCE_VERSION,
} as const;

/** Re-exported for tests that need the computation shape without a store. */
export type { ComparisonComputation, MaterializedArtifact, SourceArtifactRef, DerivationReadModel };
