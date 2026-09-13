/**
 * Phase 2A-11 — Engineering Takeoff Service.
 *
 * It orchestrates the accepted Phase 2A-10 evidence handoff into governed
 * engineering quantity CANDIDATES, and it records COUNTED quantities through
 * the durable occurrence ledger. It performs no commercial or procurement work.
 *
 * What this service refuses to do, by construction:
 *
 * - It never reads a raw document, a parser summary, or a parser-native
 *   structure. Every candidate is built from the accepted 2A-10 handoff, whose
 *   claims are already governance-filtered.
 * - It never treats a source quantity as approved. A candidate is not an
 *   approval; approval requires an explicit decision through
 *   `EngineeringDecisionService`.
 * - It never averages, ranks, or auto-picks between conflicting sources. A
 *   conflict is recorded and left for a human decision.
 * - It never counts an occurrence the counting rule did not admit, and it never
 *   infers a count from file size, drawing scale, or visual density.
 */

import {
  buildArtifactGovernanceIndex,
  buildCandidateFromCount,
  buildCandidatesFromClaims,
  buildClusterByClaimId,
  buildConflictingCandidateGroups,
  buildCountingRuleId,
  buildEngineeringGovernanceView,
  buildOccurrenceLedger,
  buildTakeoffScopeId,
  canIssueBom,
  classifyOccurrence,
  DXF_COUNTING_RULE_VERSION,
  IFC_COUNTING_RULE_VERSION,
  selectGovernedQuantityClaims,
  takeoffReadiness,
  type CountingRule,
  type CountingRuleFamily,
  type EngineeringQuantityCandidate,
  type EngineeringTakeoffScope,
  type OccurrenceLedger,
  type SourceOccurrence,
  type TakeoffScopeKind,
} from "@/src/domain/engineering-takeoff";
import { engineeringId } from "@/src/domain/engineering-takeoff";

import type {
  EngineeringClockPort,
  EngineeringStore,
  CrossDocumentHandoffReaderPort,
  OccurrenceSourcePort,
  RawOccurrenceRecord,
} from "./ports";

// ---------------------------------------------------------------------------
// Requests / results
// ---------------------------------------------------------------------------

export type OpenTakeoffScopeRequest = {
  companyId: string;
  name: string;
  description?: string;
  scopeKind: TakeoffScopeKind;
  /** References the existing project/context identity. Not a second project master. */
  projectContextKey?: string | null;
  comparisonScopeId: string;
  comparisonRunId?: string | null;
  createdByUserId: string;
};

export type DeriveCandidatesRequest = {
  companyId: string;
  takeoffScopeId: string;
};

export type DeriveCandidatesResult = {
  scope: EngineeringTakeoffScope;
  candidates: EngineeringQuantityCandidate[];
  /** Claims the governance filter withheld, with the reason each was withheld. */
  withheldClaims: Array<{ claimId: string; reason: string }>;
  limitations: string[];
};

export type CountOccurrencesRequest = {
  companyId: string;
  takeoffScopeId: string;
  family: CountingRuleFamily;
  artifactIds: readonly string[];
};

export type CountOccurrencesResult = {
  ledger: OccurrenceLedger;
  /** A COUNTED candidate per subject the ledger actually counted. */
  candidates: EngineeringQuantityCandidate[];
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type EngineeringTakeoffDeps = {
  store: EngineeringStore;
  handoffReader: CrossDocumentHandoffReaderPort;
  occurrenceSource: OccurrenceSourcePort;
  clock: EngineeringClockPort;
};

export class EngineeringTakeoffService {
  constructor(private readonly deps: EngineeringTakeoffDeps) {}

  /**
   * Opens an engineering takeoff scope bound to an accepted 2A-10 comparison
   * scope.
   *
   * The scope is an ANALYSIS ROOT, not a competing project master: it holds a
   * reference to the existing project/context identity and never owns project
   * data. It records the accepted evidence state it read so the takeoff is
   * always traceable back to the evidence that produced it.
   */
  async openTakeoffScope(request: OpenTakeoffScopeRequest): Promise<EngineeringTakeoffScope> {
    const now = this.deps.clock.now();
    const handoff = await this.deps.handoffReader.loadHandoff({
      companyId: request.companyId,
      comparisonScopeId: request.comparisonScopeId,
      comparisonRunId: request.comparisonRunId ?? null,
    });

    const governance = handoff
      ? buildEngineeringGovernanceView(handoff)
      : null;

    // Readiness is computed from what the accepted evidence actually says. A
    // scope with no handoff, no run, or blocking claims is honestly not ready.
    const blockReasons: string[] = [];
    if (!handoff) blockReasons.push("the accepted Phase 2A-10 comparison scope could not be read, so no engineering takeoff can rest on it");
    if (handoff && !handoff.latestRun) blockReasons.push("the comparison scope has no completed comparison run, so there is no accepted evidence state to take off from");
    if (governance) blockReasons.push(...governance.blockReasons);
    if (handoff) blockReasons.push(...handoff.blockReasons);

    const acceptedClaimCount = handoff
      ? selectGovernedQuantityClaims({ handoff, governance: governance ?? emptyGovernance(request.companyId, request.comparisonScopeId) }).accepted.length
      : 0;
    const withheldClaimCount = handoff ? handoff.quantityClaims.length - acceptedClaimCount : 0;

    const readiness = takeoffReadiness({
      acceptedClaimCount,
      hasComparisonRun: Boolean(handoff?.latestRun),
      identitiesWithoutDecision: governance?.identitiesWithoutDecision.length ?? 0,
      incompatibleActiveRevisions: (governance?.blockReasons ?? []).some((reason) => reason.includes("REVISION")),
      anySourcePartial: handoff?.coverage.some((entry) => entry.coverage === "PARTIAL") ?? false,
      anySourceUnavailable: false,
      unresolvedQuantityCount: 0,
      conflictingSubjectCount: 0,
    });

    const scopeId = buildTakeoffScopeId({
      companyId: request.companyId,
      comparisonScopeId: request.comparisonScopeId,
      scopeKind: request.scopeKind,
      name: request.name,
    });

    const scope: EngineeringTakeoffScope = {
      takeoffScopeId: scopeId,
      companyId: request.companyId,
      projectContextKey: request.projectContextKey ?? null,
      name: request.name,
      description: request.description ?? "",
      scopeKind: request.scopeKind,
      state: "OPEN",
      comparisonScopeId: request.comparisonScopeId,
      comparisonRunId: handoff?.latestRun?.comparisonRunId ?? null,
      evidenceInputDigest: handoff?.latestRun?.inputDigest ?? null,
      acceptedClaimCount,
      withheldClaimCount,
      revisionPolicy: governance?.revisionPolicy ?? handoff?.scope.revisionPolicy ?? "ACTIVE_ONLY",
      readiness: readiness.readiness,
      readinessReasons: readiness.reasons,
      completeness: null,
      blockReasons,
      limitations: handoff ? [...new Set([...handoff.limitations, ...(governance?.limitations ?? [])])] : [],
      scopeVersion: 1,
      supersedesScopeId: null,
      createdByUserId: request.createdByUserId,
      takeoffContractVersion: "2a-11.takeoff.v1",
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.store.saveScope(scope);
  }

  /**
   * Derives governed engineering quantity CANDIDATES from the accepted evidence.
   *
   * A candidate carries the 2A-10 origin through honestly (STATED or
   * DECLARED_MODEL) and is NEVER upgraded to an approved quantity. Claims the
   * governance filter withheld are recorded with their reason rather than
   * silently dropped, so a reviewer sees the whole funnel.
   */
  async deriveCandidates(request: DeriveCandidatesRequest): Promise<DeriveCandidatesResult> {
    const scope = await this.requireScope(request.companyId, request.takeoffScopeId);
    const now = this.deps.clock.now();

    const handoff = await this.deps.handoffReader.loadHandoff({
      companyId: request.companyId,
      comparisonScopeId: scope.comparisonScopeId,
      comparisonRunId: scope.comparisonRunId,
    });
    if (!handoff) throw new Error("the accepted Phase 2A-10 evidence handoff is unavailable, so no engineering candidates can be derived");

    const governance = await this.deps.handoffReader.loadGovernanceView({
      companyId: request.companyId,
      comparisonScopeId: scope.comparisonScopeId,
      comparisonRunId: scope.comparisonRunId,
    }) ?? buildEngineeringGovernanceView(handoff);

    const selection = selectGovernedQuantityClaims({ handoff, governance });
    const clusterByClaimId = buildClusterByClaimId(handoff.subjectClusters);

    const candidates = buildCandidatesFromClaims({
      companyId: request.companyId,
      takeoffScopeId: scope.takeoffScopeId,
      claims: selection.accepted,
      clusterByClaimId,
      createdAt: now,
    });

    for (const candidate of candidates) {
      await this.deps.store.saveCandidate(candidate);
      await this.deps.store.saveCandidateSources({
        companyId: request.companyId,
        candidateId: candidate.candidateId,
        sources: candidate.sourceReferences.map((reference, index) => ({
          id: `${candidate.candidateId}:src:${index}`,
          companyId: request.companyId,
          candidateId: candidate.candidateId,
          basis: reference.basis,
          claimId: reference.claimId,
          sourceArtifactId: reference.sourceArtifactId,
          derivationFamilyRootArtifactId: reference.derivationFamilyRootArtifactId,
          locator: reference.locator,
          humanLocator: reference.humanLocator,
          citationId: reference.citationId,
          ledgerEntryId: reference.ledgerEntryId,
          calculationId: reference.calculationId,
          adjustmentId: reference.adjustmentId,
        })),
      });
    }

    // Conflicting sources are recorded as disputes. No winner is chosen here:
    // every pair of distinct-source candidates becomes a recorded dispute that
    // names an explicit decision as its only resolution.
    const groups = buildConflictingCandidateGroups(candidates);
    for (const group of groups) {
      if (group.candidateIds.length < 2) continue;
      const [leftCandidateId, rightCandidateId] = [...group.candidateIds].sort();
      await this.deps.store.saveConflict({
        companyId: request.companyId,
        takeoffScopeId: scope.takeoffScopeId,
        conflict: {
          conflictId: engineeringId("ecf", "candidate-conflict", [scope.takeoffScopeId, group.subjectKeyNamespace, group.subjectMatchKey, leftCandidateId, rightCandidateId]),
          companyId: request.companyId,
          takeoffScopeId: scope.takeoffScopeId,
          subjectMatchKey: group.subjectMatchKey,
          leftCandidateId,
          rightCandidateId,
          conflictState: group.conflictState,
          reason: group.conflictReason ?? "the sources disagree about this engineering quantity and no source is authoritative over another",
          requiresExplicitDecision: true,
          resolvedByDecisionId: null,
          createdAt: now,
        },
      });
    }

    const updated = await this.refreshScopeDerivedState(scope, handoff, governance, selection.accepted.length, selection.rejected.length);

    return {
      scope: updated,
      candidates,
      withheldClaims: selection.rejected,
      limitations: handoff.limitations,
    };
  }

  /**
   * Counts eligible occurrences into the durable ledger and produces COUNTED
   * candidates.
   *
   * The counting rule — never the caller, never a parser total — decides
   * eligibility. Every occurrence the ledger considered is retained with its
   * exact locator, classification, reason, and rule version, so the counted
   * total is reproducible by re-reading the ledger rather than by re-running
   * the counter and trusting the result.
   */
  async countOccurrences(request: CountOccurrencesRequest): Promise<CountOccurrencesResult> {
    const scope = await this.requireScope(request.companyId, request.takeoffScopeId);
    const now = this.deps.clock.now();

    const rule = this.buildCountingRule(request.companyId, scope.takeoffScopeId, request.family, now);
    await this.deps.store.saveCountingRule({ ...rule, companyId: request.companyId, takeoffScopeId: scope.takeoffScopeId, createdAt: now });

    const rawOccurrences = await this.deps.occurrenceSource.listOccurrences({
      companyId: request.companyId,
      takeoffScopeId: scope.takeoffScopeId,
      artifactIds: request.artifactIds,
      family: request.family,
    });

    const occurrences: SourceOccurrence[] = rawOccurrences.map((raw) => toSourceOccurrence(raw, request.family));

    const ledger = buildOccurrenceLedger({
      companyId: request.companyId,
      takeoffScopeId: scope.takeoffScopeId,
      rule,
      occurrences,
      createdAt: now,
    });

    await this.deps.store.saveOccurrences(ledger.entries);

    // One COUNTED candidate per subject the ledger actually counted. A subject
    // that produced zero eligible occurrences gets no candidate at all, which is
    // the honest answer rather than a zero that looks like a finding.
    const bySubject = new Map<string, { entries: typeof ledger.entries; namespace: string }>();
    for (const entry of ledger.entries) {
      if (!entry.included || !entry.subjectMatchKey) continue;
      const existing = bySubject.get(entry.subjectMatchKey);
      if (existing) existing.entries.push(entry);
      else bySubject.set(entry.subjectMatchKey, { entries: [entry], namespace: entry.subjectKeyNamespace ?? "ARTIFACT_LOCATOR" });
    }

    const candidates: EngineeringQuantityCandidate[] = [];
    for (const [subjectMatchKey, group] of [...bySubject.entries()].sort((left, right) => (left[0] < right[0] ? -1 : 1))) {
      const candidate = buildCandidateFromCount({
        companyId: request.companyId,
        takeoffScopeId: scope.takeoffScopeId,
        subjectMatchKey,
        subjectKeyNamespace: group.namespace,
        subjectLabel: null,
        countedValue: group.entries.length,
        unitLiteral: "ea",
        unitDimension: "COUNT",
        ledgerEntryIds: group.entries.map((entry) => entry.entryId),
        countingRuleId: rule.ruleId,
        countingRuleVersion: rule.ruleVersion,
        contributingDerivationFamilyRoots: [...new Set(group.entries.map((entry) => entry.derivationFamilyRootArtifactId))].sort(),
        conflictState: "UNDISPUTED",
        createdAt: now,
      });
      await this.deps.store.saveCandidate(candidate);
      await this.deps.store.saveCandidateSources({
        companyId: request.companyId,
        candidateId: candidate.candidateId,
        sources: group.entries.map((entry, index) => ({
          id: `${candidate.candidateId}:ledger:${index}`,
          companyId: request.companyId,
          candidateId: candidate.candidateId,
          basis: "OCCURRENCE_COUNT",
          claimId: entry.evidenceClaimId,
          sourceArtifactId: entry.artifactId,
          derivationFamilyRootArtifactId: entry.derivationFamilyRootArtifactId,
          locator: entry.locator,
          humanLocator: null,
          citationId: null,
          ledgerEntryId: entry.entryId,
          calculationId: null,
          adjustmentId: null,
        })),
      });
      candidates.push(candidate);
    }

    return { ledger, candidates };
  }

  /** The persisted counting rules, so a reviewer can see what was admitted. */
  async listCountingRules(input: { companyId: string; takeoffScopeId: string }) {
    return this.deps.store.listCountingRules(input);
  }

  /** The full occurrence ledger for a scope, included and excluded. */
  async listOccurrences(input: { companyId: string; takeoffScopeId: string; included?: boolean; limit?: number }) {
    return this.deps.store.listOccurrences({ ...input, limit: input.limit ?? 2000 });
  }

  async findScope(input: { companyId: string; takeoffScopeId: string }): Promise<EngineeringTakeoffScope | null> {
    return this.deps.store.findScope(input);
  }

  /** Whether the scope is settled enough to issue an Engineering BOM at all. */
  async canIssueBom(input: { companyId: string; takeoffScopeId: string }): Promise<{ ok: boolean; problem: string | null }> {
    const scope = await this.requireScope(input.companyId, input.takeoffScopeId);
    const versions = await this.deps.store.listBomVersions({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, limit: 500 });
    const latest = versions.sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null;
    const rows = latest
      ? await this.deps.store.listBomRows({ companyId: input.companyId, bomVersionId: latest.bomVersionId })
      : [];
    return canIssueBom(scope, { total: rows.length, approved: rows.filter((row) => row.isApprovedRow).length });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Builds the versioned counting rule for a family.
   *
   * The two families are deliberately asymmetric, because their sources are:
   *
   * - DXF — a drawing is overwhelmingly drawing furniture, so the rule uses a
   *   CLOSED allow-list of explicit model-space geometry entity types. An entity
   *   type the rule does not admit is not countable, which is the safe default
   *   for a format where most entities are not the thing being counted;
   * - IFC — a BIM element vocabulary is open-ended (a manufacturer's extension
   *   may add element types this build has never heard of), so the rule uses a
   *   CLOSED EXCLUDE set instead. The excluded set is the model's scaffolding —
   *   type objects, property sets, quantity sets, materials, classifications,
   *   systems, spatial containers, and relationships — all of which are
   *   recognized structurally by the occurrence classifier regardless of the
   *   element vocabulary, so an unlisted real element stays countable rather
   *   than silently vanishing.
   *
   * `admittedEntityTypes` is therefore left EMPTY for IFC on purpose: it means
   * "admit everything the classifier did not exclude", which is exactly the
   * `IfcType + 5 instances = 5` guarantee.
   */
  private buildCountingRule(companyId: string, takeoffScopeId: string, family: CountingRuleFamily, createdAt: string): CountingRule {
    const ruleVersion = family === "DXF" ? DXF_COUNTING_RULE_VERSION : IFC_COUNTING_RULE_VERSION;
    const admittedEntityTypes = family === "DXF"
      ? ["INSERT", "LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "ELLIPSE", "SPLINE", "SOLID", "3DFACE", "MESH"]
      : [];
    const description = family === "DXF"
      ? "counts explicit model-space drawing occurrences only; title blocks, legends, paper-space entities, annotation symbols, dimensions, text labels, block definitions, XREF metadata, layers, and styles are excluded"
      : "counts eligible occurrence instances of any element type; type objects, property sets, quantity sets, materials, classifications, systems, storeys, spaces, sites, buildings, relationship objects, and document references are excluded by the occurrence classifier";
    return {
      ruleId: buildCountingRuleId({ companyId, family, ruleVersion, description }),
      family,
      ruleVersion,
      description,
      admittedEntityTypes,
      modelSpaceOnly: true,
      requiresSubjectIdentity: true,
      createdAt,
    };
  }

  private async requireScope(companyId: string, takeoffScopeId: string): Promise<EngineeringTakeoffScope> {
    const scope = await this.deps.store.findScope({ companyId, takeoffScopeId });
    if (!scope) throw new Error(`the engineering takeoff scope ${takeoffScopeId} does not exist for this company`);
    return scope;
  }

  private async refreshScopeDerivedState(
    scope: EngineeringTakeoffScope,
    handoff: NonNullable<Awaited<ReturnType<CrossDocumentHandoffReaderPort["loadHandoff"]>>>,
    governance: ReturnType<typeof buildEngineeringGovernanceView>,
    acceptedClaimCount: number,
    withheldClaimCount: number,
  ): Promise<EngineeringTakeoffScope> {
    const readiness = takeoffReadiness({
      acceptedClaimCount,
      hasComparisonRun: Boolean(handoff.latestRun),
      identitiesWithoutDecision: governance.identitiesWithoutDecision.length,
      incompatibleActiveRevisions: governance.blockReasons.some((reason) => reason.includes("REVISION")),
      anySourcePartial: handoff.coverage.some((entry) => entry.coverage === "PARTIAL"),
      anySourceUnavailable: false,
      unresolvedQuantityCount: 0,
      conflictingSubjectCount: 0,
    });
    const updated = await this.deps.store.updateScopeDerivedState({
      companyId: scope.companyId,
      takeoffScopeId: scope.takeoffScopeId,
      state: acceptedClaimCount > 0 ? "DECIDING" : scope.state,
      readiness: readiness.readiness,
      readinessReasons: readiness.reasons,
      completeness: scope.completeness,
      blockReasons: [...new Set([...scope.blockReasons, ...governance.blockReasons, ...handoff.blockReasons])],
      acceptedClaimCount,
      withheldClaimCount,
      updatedAt: this.deps.clock.now(),
    });
    return updated ?? scope;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Converts a raw occurrence into the domain shape.
 *
 * The raw record carries its structural flags separately from its entity type
 * precisely so `classifyOccurrence` can apply the structural exclusions BEFORE
 * asking whether the entity is a countable class. A line entity that sits inside
 * a title block is therefore excluded as a title block, not counted as a line.
 */
function toSourceOccurrence(raw: RawOccurrenceRecord, family: CountingRuleFamily): SourceOccurrence {
  return {
    occurrenceId: engineeringId("ocr", "source-occurrence", [raw.artifactId, raw.locator, raw.entityType ?? "", String(raw.structural.definitionGroupKey ?? "")]),
    artifactId: raw.artifactId,
    derivationFamilyRootArtifactId: raw.derivationFamilyRootArtifactId,
    family,
    sourceType: raw.sourceType,
    // The class is DERIVED by the classifier, never supplied by the caller: a
    // caller must not be able to declare its own occurrence countable.
    occurrenceClass: classifyOccurrence({
      occurrenceId: "classification-probe",
      artifactId: raw.artifactId,
      derivationFamilyRootArtifactId: raw.derivationFamilyRootArtifactId,
      family,
      sourceType: raw.sourceType,
      occurrenceClass: "MODEL_SPACE_INSTANCE",
      modelSpace: raw.structural.modelSpace,
      insideTitleBlock: raw.structural.insideTitleBlock,
      insideLegend: raw.structural.insideLegend,
      annotation: raw.structural.annotation,
      blockDefinition: raw.structural.blockDefinition,
      xrefMetadata: raw.structural.xrefMetadata,
      locator: raw.locator,
      evidenceClaimId: raw.evidenceClaimId ?? null,
      subjectMatchKey: raw.subjectMatchKey ?? null,
      subjectKeyNamespace: raw.subjectKeyNamespace ?? null,
      sourceCoverage: raw.sourceCoverage ?? "COMPLETE",
      definitionGroupKey: raw.structural.definitionGroupKey ?? null,
    }),
    modelSpace: raw.structural.modelSpace,
    insideTitleBlock: raw.structural.insideTitleBlock,
    insideLegend: raw.structural.insideLegend,
    annotation: raw.structural.annotation,
    blockDefinition: raw.structural.blockDefinition,
    xrefMetadata: raw.structural.xrefMetadata,
    locator: raw.locator,
    evidenceClaimId: raw.evidenceClaimId ?? null,
    subjectMatchKey: raw.subjectMatchKey ?? null,
    subjectKeyNamespace: raw.subjectKeyNamespace ?? null,
    sourceCoverage: raw.sourceCoverage ?? "COMPLETE",
    definitionGroupKey: raw.structural.definitionGroupKey ?? null,
  };
}

function emptyGovernance(companyId: string, comparisonScopeId: string) {
  return {
    companyId,
    comparisonScopeId,
    comparisonRunId: null,
    ungovernedClaimIds: new Set<string>(),
    blockedClaimIds: new Set<string>(),
    supersededClaimIds: new Set<string>(),
    partialCoverageClaimIds: new Set<string>(),
    identitiesWithoutDecision: [] as string[],
    revisionPolicy: "ACTIVE_ONLY",
    blockReasons: [] as string[],
    limitations: [] as string[],
  };
}

export { buildArtifactGovernanceIndex };
