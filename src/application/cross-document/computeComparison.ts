/**
 * Phase 2A-10: the pure comparison engine.
 *
 * It takes materialized claims, collapsed lineage voices, and the governed
 * document/revision context, and produces deterministic matches, clusters, and
 * finding drafts. It performs no I/O, so the same inputs and versions always
 * produce the same logical output and a test can assert that directly.
 *
 * Absence is never asserted against an incomplete source: a family whose
 * coverage is PARTIAL receives an `EVIDENCE_COVERAGE_INCOMPLETE` finding
 * instead of any "missing" finding.
 */

import {
  CROSS_DOCUMENT_BOUNDS,
  type ClaimPredicate,
  type CrossDocumentFindingRecord,
  type DocumentRole,
  type FindingKind,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import type { ComparisonVoice } from "./LineageCollapse";
import { needsFidelityReview } from "./LineageCollapse";
import { projectFinding, type FindingDraft } from "./FindingProjection";
import { runSubjectMatching } from "./SubjectMatchEngine";
import { compareClaims } from "./ValueComparison";
import type { ComparisonScopeRecord } from "./ports";

/** Governed document context for one artifact, resolved before comparison. */
export type ArtifactDocumentContext = {
  artifactId: string;
  documentIdentityId: string | null;
  revisionMembershipId: string | null;
  documentRole: DocumentRole;
  observedRevisionLabel: string | null;
  /** True when this artifact's evidence is excluded from the active comparison. */
  excludedFromComparison: boolean;
  exclusionReason: string | null;
};

export type ComparisonArtifactState = {
  artifactId: string;
  derivationFamilyRootArtifactId: string;
  coverage: "COMPLETE" | "PARTIAL";
  unavailable: boolean;
  claimCount: number;
  truncated: boolean;
  truncationReasons: string[];
  limitations: string[];
};

export type ComputeComparisonInput = {
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string;
  createdAt: string;
  scope: Pick<ComparisonScopeRecord, "revisionPolicy" | "predicateFilters" | "roleFilters">;
  voices: readonly ComparisonVoice[];
  claims: readonly NormalizedEvidenceClaim[];
  artifactStates: readonly ComparisonArtifactState[];
  documentContext: readonly ArtifactDocumentContext[];
  /** Governed finding kinds; DESCRIPTION_MISMATCH is off unless explicitly enabled. */
  enabledFindingKinds: readonly FindingKind[];
  /** Document identities whose comparison readiness is blocked. */
  blockedDocumentIdentities: ReadonlyArray<{ documentIdentityId: string; blockReasons: string[] }>;
};

export type ComparisonComputation = {
  matches: ReturnType<typeof runSubjectMatching>["matches"];
  clusters: ReturnType<typeof runSubjectMatching>["clusters"];
  groups: ReturnType<typeof runSubjectMatching>["groups"];
  findings: Array<{
    record: Omit<CrossDocumentFindingRecord, "engineFlags" | "reviewState">;
    participants: ReturnType<typeof projectFinding>["participants"];
  }>;
  claimCount: number;
  matchCount: number;
  truncated: boolean;
  limitations: string[];
  blockReasons: string[];
  /** Predicate-level disclosures of comparisons that were not performed. */
  skippedComparisons: Array<{ reason: string; claimIds: string[] }>;
};

export function computeComparison(input: ComputeComparisonInput): ComparisonComputation {
  const limitations: string[] = [];
  const blockReasons = [...new Set(input.blockedDocumentIdentities.flatMap((entry) => entry.blockReasons))].sort();
  const enabled = new Set(input.enabledFindingKinds);
  const descriptionMismatchEnabled = enabled.has("DESCRIPTION_MISMATCH");

  const contextByArtifact = new Map(input.documentContext.map((entry) => [entry.artifactId, entry]));
  const stateByArtifact = new Map(input.artifactStates.map((entry) => [entry.artifactId, entry]));
  const familyRootByArtifact = new Map(input.artifactStates.map((entry) => [entry.artifactId, entry.derivationFamilyRootArtifactId]));
  const documentFamilyKeyByArtifact = new Map<string, string | null>(
    input.documentContext.map((entry) => [entry.artifactId, entry.documentIdentityId]),
  );

  const excludedArtifacts = new Set(input.documentContext.filter((entry) => entry.excludedFromComparison).map((entry) => entry.artifactId));
  const excludedClaims = input.claims.filter((claim) => excludedArtifacts.has(claim.sourceArtifactId));
  const includedClaims = input.claims.filter((claim) => !excludedArtifacts.has(claim.sourceArtifactId));
  if (excludedClaims.length) {
    limitations.push(
      `${excludedClaims.length} evidence claims were outside the active revision scope and were recorded but not compared; historical claims remain queryable`,
    );
  }

  const matching = runSubjectMatching({
    companyId: input.companyId,
    comparisonScopeId: input.comparisonScopeId,
    comparisonRunId: input.comparisonRunId,
    createdAt: input.createdAt,
    claims: includedClaims,
    familyRootByArtifact,
    documentFamilyKeyByArtifact,
  });
  limitations.push(...matching.limitations);

  const claimById = new Map(includedClaims.map((claim) => [claim.claimId, claim]));
  const drafts: FindingDraft[] = [];
  const skippedComparisons: Array<{ reason: string; claimIds: string[] }> = [];

  const familyStates = new Map<string, ComparisonArtifactState[]>();
  for (const state of input.artifactStates) {
    const list = familyStates.get(state.derivationFamilyRootArtifactId) ?? [];
    list.push(state);
    familyStates.set(state.derivationFamilyRootArtifactId, list);
  }

  // -------------------------------------------------------------------------
  // Group-level value comparison
  // -------------------------------------------------------------------------
  for (const group of matching.groups) {
    const groupClaims = group.memberClaimIds.map((claimId) => claimById.get(claimId)).filter((claim): claim is NormalizedEvidenceClaim => Boolean(claim));
    if (groupClaims.length < 2) continue;
    const families = [...new Set(groupClaims.map((claim) => claim.derivation.derivationFamilyRootArtifactId))];
    if (families.length < 2) continue;

    const groupMatches = matching.matches.filter((match) => group.memberClaimIds.includes(match.leftClaimId) && group.memberClaimIds.includes(match.rightClaimId));
    const ambiguousPairs = groupMatches.filter((match) => match.matchClass === "AMBIGUOUS" || match.blockers.includes("AMBIGUOUS_ONE_TO_MANY"));
    const conflictedPairs = groupMatches.filter((match) => match.matchClass === "CONFLICT");
    const comparablePairs = groupMatches.filter((match) => match.matchClass === "SAME_SUBJECT");

    if (ambiguousPairs.length) {
      drafts.push({
        findingKind: "AMBIGUOUS_SUBJECT_MATCH",
        predicate: null,
        clusterIds: group.clusterIds,
        participants: ambiguousPairs.slice(0, CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding).flatMap((match) => [claimById.get(match.leftClaimId), claimById.get(match.rightClaimId)]).filter((claim): claim is NormalizedEvidenceClaim => Boolean(claim)),
        subjectKeys: groupClaims.map((claim) => claim.subject.subjectKeyValue),
        reasons: ["a subject key matches more than one item on the other side, so no value comparison was performed for it"],
        limitations: ["ambiguity blocks value comparison: VOKA does not choose which item a source meant"],
        truncated: false,
      });
    }
    if (conflictedPairs.length) {
      drafts.push({
        findingKind: "IDENTITY_TAG_MISMATCH",
        predicate: "EQUIPMENT_TAG",
        clusterIds: group.clusterIds,
        participants: conflictedPairs.slice(0, 4).flatMap((match) => [claimById.get(match.leftClaimId), claimById.get(match.rightClaimId)]).filter((claim): claim is NormalizedEvidenceClaim => Boolean(claim)),
        subjectKeys: groupClaims.map((claim) => claim.subject.subjectKeyValue),
        reasons: ["the two sides carry conflicting strong identifiers, so the weaker agreement was vetoed"],
        limitations: ["a conflicting strong identifier vetoes a weaker match; the sources were not compared as the same subject"],
        truncated: false,
      });
    }
    if (!comparablePairs.length) continue;

    // Ambiguity blocks value comparison for the whole group.
    const comparableClaimIds = new Set(comparablePairs.flatMap((match) => [match.leftClaimId, match.rightClaimId]));
    const comparableClaims = groupClaims.filter((claim) => comparableClaimIds.has(claim.claimId));

    const predicates = [...new Set(comparableClaims.map((claim) => claim.assertion.predicate))].sort();
    for (const predicate of predicates) {
      const claimsForPredicate = comparableClaims.filter((claim) => claim.assertion.predicate === predicate);
      const byFamily = new Map<string, NormalizedEvidenceClaim[]>();
      for (const claim of claimsForPredicate) {
        const root = claim.derivation.derivationFamilyRootArtifactId;
        const list = byFamily.get(root) ?? [];
        list.push(claim);
        byFamily.set(root, list);
      }
      const familiesForPredicate = [...byFamily.keys()].sort();

      // Pairwise comparison across families only: a family never compares with itself.
      for (let i = 0; i < familiesForPredicate.length; i += 1) {
        for (let j = i + 1; j < familiesForPredicate.length; j += 1) {
          const leftClaims = byFamily.get(familiesForPredicate[i]!) ?? [];
          const rightClaims = byFamily.get(familiesForPredicate[j]!) ?? [];
          for (const left of leftClaims) {
            for (const right of rightClaims) {
              if (!comparableClaimIds.has(left.claimId) || !comparableClaimIds.has(right.claimId)) continue;
              const outcome = compareClaims({ left, right, descriptionMismatchEnabled });
              if (outcome.outcome === "NO_FINDING") {
                skippedComparisons.push({ reason: outcome.reason, claimIds: [left.claimId, right.claimId] });
                continue;
              }
              drafts.push({
                findingKind: outcome.findingKind,
                predicate: left.assertion.predicate,
                clusterIds: group.clusterIds,
                participants: [left, right],
                subjectKeys: [left.subject.subjectKeyValue, right.subject.subjectKeyValue],
                reasons: [outcome.reason],
                limitations: outcome.limitation ? [outcome.limitation] : [],
                truncated: false,
              });
            }
          }
        }
      }

      // Absence: only when EVERY family represented in the group has COMPLETE
      // coverage, and only when the predicate is present in at least one family.
      if (familiesForPredicate.length >= 1 && familiesForPredicate.length < families.length) {
        const missingFamilies = families.filter((family) => !familiesForPredicate.includes(family));
        const completeCoverage = [...families, ...missingFamilies].every((family) =>
          (familyStates.get(family) ?? []).every((state) => state.coverage === "COMPLETE" && !state.unavailable && !state.truncated),
        );
        if (!completeCoverage) {
          limitations.push("a missing-counterpart comparison was suppressed because one participating source's evidence coverage is partial");
          continue;
        }
        for (const missingFamily of missingFamilies) {
          const present = familiesForPredicate.flatMap((family) => byFamily.get(family) ?? []);
          const roleOfMissing = contextByArtifact.get((familyStates.get(missingFamily) ?? [])[0]?.artifactId ?? "")?.documentRole ?? "UNKNOWN";
          const isScheduleLike = roleOfMissing === "BOQ" || roleOfMissing === "SCHEDULE";
          const findingKind: FindingKind = predicate === "STATED_QUANTITY"
            ? (isScheduleLike ? "SCHEDULE_COUNTERPART_MISSING" : "INCLUSION_EXCLUSION_MISMATCH")
            : "PROPERTY_MISSING_IN_SOURCE";
          drafts.push({
            findingKind,
            predicate,
            clusterIds: group.clusterIds,
            participants: present.slice(0, CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding),
            subjectKeys: present.map((claim) => claim.subject.subjectKeyValue),
            reasons: [`the ${predicate} predicate is stated by ${familiesForPredicate.length} source(s) and absent from ${missingFamilies.length} source(s) whose coverage is complete`],
            limitations: ["absence was only asserted because the other source's coverage is complete for this channel"],
            truncated: false,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Suggestions: a human decides; no value is compared on a suggestion.
  // -------------------------------------------------------------------------
  for (const match of matching.matches) {
    if (match.matchClass !== "SUGGESTION_ONLY") continue;
    const left = claimById.get(match.leftClaimId);
    const right = claimById.get(match.rightClaimId);
    if (!left || !right) continue;
    drafts.push({
      findingKind: "SUBJECT_SUGGESTION_ONLY",
      predicate: left.assertion.predicate,
      clusterIds: [],
      participants: [left, right],
      subjectKeys: [left.subject.subjectKeyValue, right.subject.subjectKeyValue],
      reasons: match.reasons,
      limitations: match.limitations,
      truncated: false,
    });
  }

  // -------------------------------------------------------------------------
  // Coverage, availability, fidelity, and revision governance findings
  // -------------------------------------------------------------------------
  for (const state of input.artifactStates) {
    const familyClaims = includedClaims.filter((claim) => claim.derivation.derivationFamilyRootArtifactId === state.derivationFamilyRootArtifactId);
    if (state.unavailable) {
      drafts.push({
        findingKind: "EVIDENCE_UNAVAILABLE_FOR_COMPARISON",
        predicate: null,
        clusterIds: [],
        participants: familyClaims.slice(0, CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding),
        subjectKeys: [],
        reasons: ["this artifact could not be read as evidence, so nothing was compared from it"],
        // Same rule as the partial case: the refusal statement is first, so the
        // bound on finding limitations can never drop it.
        limitations: ["nothing was asserted about this source, because its evidence could not be read and verified", ...state.limitations],
        truncated: false,
      });
      continue;
    }
    if (state.coverage === "PARTIAL") {
      drafts.push({
        findingKind: "EVIDENCE_COVERAGE_INCOMPLETE",
        predicate: null,
        clusterIds: [],
        participants: familyClaims.slice(0, 2),
        subjectKeys: [],
        reasons: [...state.truncationReasons],
        // The absence-safety statement goes FIRST: finding limitations are
        // bounded, and the one thing a reader must never lose about a partial
        // source is that nothing was asserted as missing from it.
        limitations: ["absence is not asserted against a partial source", ...state.limitations],
        truncated: false,
      });
    }
  }
  for (const voice of input.voices) {
    if (!needsFidelityReview(voice)) continue;
    const familyClaims = includedClaims.filter((claim) => claim.derivation.derivationFamilyRootArtifactId === voice.derivationFamilyRootArtifactId);
    drafts.push({
      findingKind: "DERIVATION_FIDELITY_REVIEW",
      predicate: null,
      clusterIds: [],
      participants: familyClaims.slice(0, 2),
      subjectKeys: [],
      reasons: ["the derived artifact carries recorded fidelity limitations, so a difference between this family and another may be a conversion boundary rather than a document discrepancy"],
      limitations: voice.fidelityLimitations,
      truncated: false,
    });
  }
  for (const blocked of input.blockedDocumentIdentities) {
    const identityArtifacts = new Set(input.documentContext.filter((entry) => entry.documentIdentityId === blocked.documentIdentityId).map((entry) => entry.artifactId));
    const identityClaims = includedClaims.filter((claim) => identityArtifacts.has(claim.sourceArtifactId));
    drafts.push({
      findingKind: "REVISION_SET_BLOCKED",
      predicate: null,
      clusterIds: [],
      participants: identityClaims.slice(0, 2),
      subjectKeys: [],
      reasons: blocked.blockReasons,
      limitations: ["the comparison for this document identity is blocked until a human records an active-revision decision"],
      truncated: false,
    });
  }

  // Conflicting observed revisions inside ONE document identity: a reviewable
  // fact about the sources, not a comparison of values.
  const byIdentity = new Map<string, ArtifactDocumentContext[]>();
  for (const entry of input.documentContext) {
    if (!entry.documentIdentityId) continue;
    const list = byIdentity.get(entry.documentIdentityId) ?? [];
    list.push(entry);
    byIdentity.set(entry.documentIdentityId, list);
  }
  for (const [documentIdentityId, members] of byIdentity.entries()) {
    const labels = [...new Set(members.map((member) => member.observedRevisionLabel).filter((label): label is string => Boolean(label)))];
    if (labels.length < 2) continue;
    const memberArtifacts = new Set(members.map((member) => member.artifactId));
    const revisionClaims = includedClaims.filter((claim) => memberArtifacts.has(claim.sourceArtifactId) && claim.assertion.predicate === "REVISION_LABEL");
    if (!revisionClaims.length) continue;
    drafts.push({
      findingKind: "REVISION_MISMATCH",
      predicate: "REVISION_LABEL",
      clusterIds: [],
      participants: revisionClaims.slice(0, CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding),
      subjectKeys: [documentIdentityId],
      reasons: [`one document identity is represented in this scope by ${labels.length} different observed revision labels`],
      limitations: ["an observed revision label is evidence; it never means the revision is active"],
      truncated: false,
    });
  }

  const projected = drafts
    .filter((draft) => enabled.has(draft.findingKind))
    .slice(0, CROSS_DOCUMENT_BOUNDS.maxFindingsPerRun)
    .map((draft) =>
      projectFinding({
        companyId: input.companyId,
        comparisonScopeId: input.comparisonScopeId,
        comparisonRunId: input.comparisonRunId,
        createdAt: input.createdAt,
        draft,
      }),
    );

  if (drafts.length > projected.length) {
    limitations.push(`findings were capped at ${CROSS_DOCUMENT_BOUNDS.maxFindingsPerRun} in this run; the remainder was not retained`);
  }

  return {
    matches: matching.matches,
    clusters: matching.clusters,
    groups: matching.groups,
    findings: projected,
    claimCount: includedClaims.length,
    matchCount: matching.matches.length,
    truncated: matching.truncated || drafts.length > projected.length,
    limitations: [...new Set(limitations)].slice(0, 16),
    blockReasons,
    skippedComparisons,
  };
}

/** Predicate ordering used for deterministic drafts; exported for tests. */
export const COMPARED_PREDICATES: readonly ClaimPredicate[] = [
  "STATED_QUANTITY",
  "UNIT_DECLARATION",
  "MANUFACTURER",
  "BRAND",
  "MODEL_REFERENCE",
  "CLASSIFICATION_CODE",
  "TYPE_NAME",
  "EQUIPMENT_TAG",
  "IDENTITY_TAG",
  "RATING",
  "MATERIAL",
  "LOCATION",
  "SYSTEM_ASSIGNMENT",
  "REVISION_LABEL",
  "ITEM_NUMBER",
  "PROPERTY_VALUE",
  "DESCRIPTION_TEXT",
];

/** Document roles that describe a schedule-like source, used for absence phrasing. */
export const SCHEDULE_LIKE_ROLES: readonly DocumentRole[] = ["BOQ", "SCHEDULE"];
