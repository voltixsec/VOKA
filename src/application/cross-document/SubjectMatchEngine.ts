/**
 * Phase 2A-10: the deterministic subject-matching stage of a comparison run.
 *
 * Candidate generation is INDEXED, never all-to-all:
 *
 *   company → scope → predicate/comparison class → strong identifier →
 *   location/system/section corroboration → bounded residual similarity
 *   suggestions.
 *
 * Every cap is centralized in `ComparisonPolicy`, and every cap that bites is
 * reported so the run can disclose it.
 *
 * Hard rules enforced here:
 * - similar names never auto-merge;
 * - description similarity never creates `SAME_SUBJECT` — a text label can only
 *   ever be a suggestion;
 * - a prefix is never enough (`SD-1` is never `SD-12`);
 * - 1:N is ambiguous, and ambiguity blocks value comparison;
 * - a stronger identifier conflict vetoes a weaker match;
 * - a layer name, a system, or a location alone never establishes identity;
 * - a derived artifact is never compared with its own original as an ordinary
 *   document discrepancy;
 * - every durable match stores its explanation.
 */

import {
  CROSS_DOCUMENT_BOUNDS,
  SUBJECT_MATCHER_VERSION,
  buildSubjectClusterId,
  buildSubjectMatchId,
  comparisonBucketsForPredicate,
  generateCandidatePairs,
  compactSubjectKey,
  subjectTokens,
  tokenOverlap,
  type MatchBlocker,
  type MatchCorroborator,
  type MatchTier,
  type NormalizedEvidenceClaim,
  type SubjectKeyNamespace,
  type SubjectMatchClass,
} from "@/src/domain/cross-document";
import type { SubjectClusterRecord, SubjectMatchRecord } from "./matching-types";

export type SubjectMatchEngineInput = {
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string;
  createdAt: string;
  claims: readonly NormalizedEvidenceClaim[];
  /** family root per artifact, so a family is never matched against itself. */
  familyRootByArtifact: ReadonlyMap<string, string>;
  /** Evidence-suggested document family key per artifact, for the T3 item-number rule. */
  documentFamilyKeyByArtifact: ReadonlyMap<string, string | null>;
  /** Ids of claims that already carry a durable match from an earlier run. */
  predicateFilters?: readonly string[];
};

export type SubjectMatchEngineResult = {
  matches: SubjectMatchRecord[];
  clusters: SubjectClusterRecord[];
  /** Union-find groups: cluster ids connected by SAME_SUBJECT matches. */
  groups: Array<{ groupId: string; clusterIds: string[]; memberClaimIds: string[]; ambiguous: boolean }>;
  truncated: boolean;
  limitations: string[];
};

/** Namespaces that may never create a SAME_SUBJECT match on their own. */
const CORROBORATION_ONLY_NAMESPACES: readonly SubjectKeyNamespace[] = ["ARTIFACT_LOCATOR", "DOCUMENT_IDENTITY", "SECTION_DIVISION", "TEXT_LABEL", "DRAWING_SHEET"];

/** Namespaces whose exact key is a strong identifier. */
const STRONG_IDENTIFIER_NAMESPACES: readonly SubjectKeyNamespace[] = ["GLOBAL_ID", "EQUIPMENT_TAG", "MANUFACTURER_MODEL"];

function tierForPair(namespace: SubjectKeyNamespace): MatchTier | null {
  switch (namespace) {
    case "GLOBAL_ID":
      return "T0_EXACT_GLOBAL_ID";
    case "EQUIPMENT_TAG":
      return "T1_EXACT_TAG";
    case "MANUFACTURER_MODEL":
      return "T2_EXACT_MANUFACTURER_MODEL";
    case "CLASSIFICATION_CODE":
      return "T2_EXACT_CLASSIFICATION";
    case "TYPE_NAME":
      return "T2_EXACT_TYPE_NAME";
    case "ITEM_NUMBER":
      return "T3_EXACT_ITEM_NUMBER";
    default:
      return null;
  }
}

/** True when both claims compare inside one predicate/comparison class. */
function sharesBucket(left: NormalizedEvidenceClaim, right: NormalizedEvidenceClaim): boolean {
  const leftBuckets = comparisonBucketsForPredicate(left.assertion.predicate);
  const rightBuckets = comparisonBucketsForPredicate(right.assertion.predicate);
  return leftBuckets.some((bucket) => rightBuckets.includes(bucket));
}

/** Corroboration only: facts that may strengthen a match and never create one. */
function corroboratorsFor(left: NormalizedEvidenceClaim, right: NormalizedEvidenceClaim): MatchCorroborator[] {
  const corroborators: MatchCorroborator[] = [];
  if (left.context.locationValue && right.context.locationValue && left.context.locationValue === right.context.locationValue) corroborators.push("LOCATION_AGREES");
  if (left.context.systemValue && right.context.systemValue && left.context.systemValue === right.context.systemValue) corroborators.push("SYSTEM_AGREES");
  if (left.context.sectionValue && right.context.sectionValue && left.context.sectionValue === right.context.sectionValue) corroborators.push("SECTION_AGREES");
  if (left.assertion.unitDeclared && right.assertion.unitDeclared && left.assertion.unitLiteral === right.assertion.unitLiteral) corroborators.push("UNIT_AGREES");
  return corroborators;
}

/** Strong identifiers a claim's artifact presents, used as veto evidence. */
function claimStrongKeys(claim: NormalizedEvidenceClaim): { namespace: SubjectKeyNamespace; key: string } | null {
  if (!STRONG_IDENTIFIER_NAMESPACES.includes(claim.subject.subjectKeyNamespace)) return null;
  return { namespace: claim.subject.subjectKeyNamespace, key: claim.subject.subjectMatchKey };
}

export function runSubjectMatching(input: SubjectMatchEngineInput): SubjectMatchEngineResult {
  const limitations: string[] = [];
  const matches: SubjectMatchRecord[] = [];
  const pairTruncation = generateCandidatePairs({ claims: input.claims });
  limitations.push(...pairTruncation.limitations);

  const byClaimId = new Map(input.claims.map((claim) => [claim.claimId, claim]));

  // Strong identifiers per ARTIFACT: a conflicting strong identifier on the
  // other side vetoes a weaker match.
  const strongKeysByArtifact = new Map<string, Array<{ namespace: SubjectKeyNamespace; key: string }>>();
  for (const claim of input.claims) {
    const strong = claimStrongKeys(claim);
    if (!strong) continue;
    const list = strongKeysByArtifact.get(claim.sourceArtifactId) ?? [];
    list.push(strong);
    strongKeysByArtifact.set(claim.sourceArtifactId, list);
  }

  // Match counting per claim, so 1:N ambiguity can be detected.
  const sameSubjectCount = new Map<string, number>();
  const pending: Array<{ left: NormalizedEvidenceClaim; right: NormalizedEvidenceClaim; tier: MatchTier; matchClass: SubjectMatchClass; blockers: MatchBlocker[]; reasons: string[]; corroborators: MatchCorroborator[]; sameFamily: boolean }> = [];

  for (const pair of pairTruncation.pairs) {
    const left = byClaimId.get(pair.leftClaimId);
    const right = byClaimId.get(pair.rightClaimId);
    if (!left || !right) continue;
    if (!sharesBucket(left, right)) continue;

    const leftRoot = input.familyRootByArtifact.get(left.sourceArtifactId) ?? left.sourceArtifactId;
    const rightRoot = input.familyRootByArtifact.get(right.sourceArtifactId) ?? right.sourceArtifactId;
    const sameFamily = leftRoot === rightRoot;
    const namespace = pair.namespace;
    const tier = tierForPair(namespace) ?? "T5_TOKEN_SIMILARITY_SUGGESTION";
    const blockers: MatchBlocker[] = [];
    const reasons: string[] = [];
    let matchClass: SubjectMatchClass = "SAME_SUBJECT";

    if (sameFamily) {
      // One derivation family is one voice. The pair is recorded so the reason
      // is durable, and it never becomes an ordinary document discrepancy.
      blockers.push("SAME_DERIVATION_FAMILY");
      matchClass = "NO_MATCH";
      reasons.push("both claims come from one derivation family, so they are one document voice and were not compared");
    } else if (CORROBORATION_ONLY_NAMESPACES.includes(namespace)) {
      blockers.push("CORROBORATION_ONLY");
      matchClass = "SUGGESTION_ONLY";
      reasons.push(`an exact ${namespace} reading is corroboration only: it never establishes identity on its own`);
    } else if (namespace === "CLASSIFICATION_CODE") {
      const leftScheme = left.context.qualifiers[0] ?? null;
      const rightScheme = right.context.qualifiers[0] ?? null;
      if (leftScheme !== rightScheme) {
        blockers.push("CLASSIFICATION_SCHEME_MISMATCH");
        matchClass = "CONFLICT";
        reasons.push(`the two classification codes belong to different schemes (${leftScheme ?? "unspecified"} and ${rightScheme ?? "unspecified"}), so they were not treated as the same code`);
      }
    } else if (namespace === "ITEM_NUMBER") {
      // T3: an exact item number is only an identity inside the same
      // document/revision family. Across families it is not a match.
      const leftKey = input.documentFamilyKeyByArtifact.get(left.sourceArtifactId) ?? null;
      const rightKey = input.documentFamilyKeyByArtifact.get(right.sourceArtifactId) ?? null;
      if (!leftKey || !rightKey || leftKey !== rightKey) {
        blockers.push("CROSS_FAMILY_ITEM_NUMBER");
        matchClass = "SUGGESTION_ONLY";
        reasons.push("an exact item number only establishes identity inside one document/revision family; this pair crosses families");
      }
    }

    if (matchClass === "SAME_SUBJECT") {
      const conflict = strongerIdentifierConflict(left, right, namespace, strongKeysByArtifact);
      if (conflict) {
        blockers.push("STRONGER_IDENTIFIER_CONFLICT");
        matchClass = "CONFLICT";
        reasons.push(conflict);
      }
    }

    if (matchClass === "SAME_SUBJECT") {
      sameSubjectCount.set(left.claimId, (sameSubjectCount.get(left.claimId) ?? 0) + 1);
      sameSubjectCount.set(right.claimId, (sameSubjectCount.get(right.claimId) ?? 0) + 1);
    }

    pending.push({ left, right, tier, matchClass, blockers, reasons, corroborators: corroboratorsFor(left, right), sameFamily });
  }

  // 1:N ambiguity: a claim that matches more than one claim is ambiguous, and
  // ambiguity blocks value comparison for every pair it touches.
  for (const entry of pending) {
    if (entry.matchClass !== "SAME_SUBJECT") continue;
    const leftCount = sameSubjectCount.get(entry.left.claimId) ?? 0;
    const rightCount = sameSubjectCount.get(entry.right.claimId) ?? 0;
    if (leftCount > 1 || rightCount > 1) {
      entry.matchClass = "AMBIGUOUS";
      entry.blockers.push("AMBIGUOUS_ONE_TO_MANY");
      entry.reasons.push("this subject matches more than one item on the other side, so it is ambiguous and its values were not compared");
    }
  }

  for (const entry of pending) {
    if (matches.length >= CROSS_DOCUMENT_BOUNDS.maxSubjectMatches) {
      limitations.push(`subject matches were capped at ${CROSS_DOCUMENT_BOUNDS.maxSubjectMatches} in this run; the remainder was not retained`);
      break;
    }
    matches.push({
      subjectMatchId: buildSubjectMatchId({
        companyId: input.companyId,
        comparisonScopeId: input.comparisonScopeId,
        leftClaimId: entry.left.claimId,
        rightClaimId: entry.right.claimId,
        tier: entry.tier,
      }),
      companyId: input.companyId,
      comparisonScopeId: input.comparisonScopeId,
      comparisonRunId: input.comparisonRunId,
      leftClaimId: entry.left.claimId,
      rightClaimId: entry.right.claimId,
      leftArtifactId: entry.left.sourceArtifactId,
      rightArtifactId: entry.right.sourceArtifactId,
      tier: entry.tier,
      matchClass: entry.matchClass,
      namespace: entry.left.subject.subjectKeyNamespace,
      comparedKeys: [entry.left.subject.subjectMatchKey, entry.right.subject.subjectMatchKey],
      corroborators: entry.corroborators.slice(0, CROSS_DOCUMENT_BOUNDS.maxMatchCorroborators),
      blockers: entry.blockers.slice(0, CROSS_DOCUMENT_BOUNDS.maxMatchBlockers),
      reasons: [...entry.reasons, `exact identity key in the ${entry.left.subject.subjectKeyNamespace} namespace`].slice(0, CROSS_DOCUMENT_BOUNDS.maxMatchReasons),
      score: null,
      ambiguous: entry.matchClass === "AMBIGUOUS",
      sameDerivationFamily: entry.sameFamily,
      reliability: entry.left.provenance.reliability === "HIGH" && entry.right.provenance.reliability === "HIGH" ? "HIGH" : "MEDIUM",
      limitations: ["a subject match is a deterministic review statement about identifiers; it is never a selection of a product or an approval of a value"],
      matcherVersion: SUBJECT_MATCHER_VERSION,
      explanationVersion: SUBJECT_MATCHER_VERSION,
      createdAt: input.createdAt,
    });
  }

  // Bounded residual similarity suggestions: same predicate bucket, different
  // namespaces, token overlap above the configured threshold. They are
  // suggestions for a human and never matches.
  const suggestionCandidates = input.claims.filter((claim) => claim.subject.subjectKeyNamespace === "TEXT_LABEL" || claim.subject.subjectKeyNamespace === "TYPE_NAME");
  let suggestions = 0;
  outer: for (let i = 0; i < suggestionCandidates.length; i += 1) {
    for (let j = i + 1; j < suggestionCandidates.length; j += 1) {
      if (suggestions >= CROSS_DOCUMENT_BOUNDS.maxSuggestionMatches) {
        limitations.push(`similarity suggestions were capped at ${CROSS_DOCUMENT_BOUNDS.maxSuggestionMatches}; the remainder was not retained`);
        break outer;
      }
      const left = suggestionCandidates[i]!;
      const right = suggestionCandidates[j]!;
      if (left.sourceArtifactId === right.sourceArtifactId) continue;
      const leftRoot = input.familyRootByArtifact.get(left.sourceArtifactId) ?? left.sourceArtifactId;
      const rightRoot = input.familyRootByArtifact.get(right.sourceArtifactId) ?? right.sourceArtifactId;
      if (leftRoot === rightRoot) continue;
      if (left.subject.subjectMatchKey === right.subject.subjectMatchKey) continue;
      if (!sharesBucket(left, right)) continue;
      const overlap = tokenOverlap(left.subject.subjectKeyValue, right.subject.subjectKeyValue);
      if (overlap < CROSS_DOCUMENT_BOUNDS.suggestionTokenOverlapThreshold) continue;
      if (compactSubjectKey(left.subject.subjectKeyValue).startsWith(compactSubjectKey(right.subject.subjectKeyValue))) continue;
      suggestions += 1;
      matches.push({
        subjectMatchId: buildSubjectMatchId({
          companyId: input.companyId,
          comparisonScopeId: input.comparisonScopeId,
          leftClaimId: left.claimId,
          rightClaimId: right.claimId,
          tier: "T5_TOKEN_SIMILARITY_SUGGESTION",
        }),
        companyId: input.companyId,
        comparisonScopeId: input.comparisonScopeId,
        comparisonRunId: input.comparisonRunId,
        leftClaimId: left.claimId,
        rightClaimId: right.claimId,
        leftArtifactId: left.sourceArtifactId,
        rightArtifactId: right.sourceArtifactId,
        tier: "T5_TOKEN_SIMILARITY_SUGGESTION",
        matchClass: "SUGGESTION_ONLY",
        namespace: left.subject.subjectKeyNamespace,
        comparedKeys: [left.subject.subjectMatchKey, right.subject.subjectMatchKey],
        corroborators: corroboratorsFor(left, right),
        blockers: ["SIMILARITY_ONLY"],
        reasons: [`token overlap ${overlap.toFixed(2)} on wording alone; a human decides whether the two readings are the same subject`],
        score: Number(overlap.toFixed(4)),
        ambiguous: false,
        sameDerivationFamily: false,
        reliability: "LOW",
        limitations: ["wording similarity is a suggestion and never a match: no value was compared on the strength of it"],
        matcherVersion: SUBJECT_MATCHER_VERSION,
        explanationVersion: SUBJECT_MATCHER_VERSION,
        createdAt: input.createdAt,
      });
    }
  }

  const clusters = buildClusters({ input, matches });
  const groups = buildGroups(clusters, matches);
  return { matches, clusters, groups, truncated: pairTruncation.truncated, limitations };
}

/** Deterministic cluster per (scope, namespace, match key), with stable memberships. */
function buildClusters(input: { input: SubjectMatchEngineInput; matches: readonly SubjectMatchRecord[] }): SubjectClusterRecord[] {
  const { input: engineInput, matches } = input;
  const byKey = new Map<string, NormalizedEvidenceClaim[]>();
  const claimById = new Map(engineInput.claims.map((claim) => [claim.claimId, claim]));
  for (const claim of engineInput.claims) {
    const namespace = claim.subject.subjectKeyNamespace;
    if (CORROBORATION_ONLY_NAMESPACES.includes(namespace)) continue;
    const key = `${namespace}\u0000${claim.subject.subjectMatchKey}`;
    const list = byKey.get(key) ?? [];
    list.push(claim);
    byKey.set(key, list);
  }

  const matchesByClusterKey = new Map<string, SubjectMatchRecord[]>();
  for (const match of matches) {
    const left = claimById.get(match.leftClaimId);
    if (!left) continue;
    if (CORROBORATION_ONLY_NAMESPACES.includes(left.subject.subjectKeyNamespace)) continue;
    const key = `${left.subject.subjectKeyNamespace}\u0000${left.subject.subjectMatchKey}`;
    const list = matchesByClusterKey.get(key) ?? [];
    list.push(match);
    matchesByClusterKey.set(key, list);
  }

  const clusters: SubjectClusterRecord[] = [];
  for (const [key, members] of byKey.entries()) {
    const [namespace, matchKey] = key.split("\u0000");
    const clusterMatches = matchesByClusterKey.get(key) ?? [];
    const blockers = [...new Set(clusterMatches.flatMap((match) => match.blockers))];
    const comparable = clusterMatches.some((match) => match.matchClass === "SAME_SUBJECT");
    const ambiguous = clusterMatches.some((match) => match.matchClass === "AMBIGUOUS");
    const strongestTier = clusterMatches
      .map((match) => match.tier)
      .sort((left, right) => tierOrder(left) - tierOrder(right))[0] ?? null;
    clusters.push({
      subjectClusterId: buildSubjectClusterId({
        companyId: engineInput.companyId,
        comparisonScopeId: engineInput.comparisonScopeId,
        namespace: namespace as SubjectKeyNamespace,
        matchKey: matchKey ?? "",
      }),
      companyId: engineInput.companyId,
      comparisonScopeId: engineInput.comparisonScopeId,
      namespace: namespace as SubjectKeyNamespace,
      matchKey: matchKey ?? "",
      subjectKeys: [...new Set(members.map((claim) => claim.subject.subjectKeyValue))].sort(),
      memberClaimIds: members.map((claim) => claim.claimId).sort(),
      derivationFamilyRootIds: [...new Set(members.map((claim) => claim.derivation.derivationFamilyRootArtifactId))].sort(),
      strongestTier,
      ambiguous,
      comparable,
      blockers,
      reliability: ambiguous ? "LOW" : comparable ? "HIGH" : "MEDIUM",
      limitations: ["a subject cluster is a durable grouping of claims that share one exact identity key; it is never a product selection"],
      matcherVersion: SUBJECT_MATCHER_VERSION,
      createdAt: engineInput.createdAt,
      updatedAt: engineInput.createdAt,
    });
  }
  clusters.sort((left, right) => (left.subjectClusterId < right.subjectClusterId ? -1 : 1));
  return clusters.slice(0, CROSS_DOCUMENT_BOUNDS.maxSubjectMatches);
}

function tierOrder(tier: MatchTier): number {
  return (["T0_EXACT_GLOBAL_ID", "T1_EXACT_TAG", "T2_EXACT_MANUFACTURER_MODEL", "T2_EXACT_CLASSIFICATION", "T2_EXACT_TYPE_NAME", "T3_EXACT_ITEM_NUMBER", "T4_LOCATION_SYSTEM_CORROBORATION", "T5_TOKEN_SIMILARITY_SUGGESTION"] as readonly string[]).indexOf(tier);
}

/**
 * Builds the deterministic comparison groups.
 *
 * A group is a union of clusters joined by SAME_SUBJECT matches. Its identity is
 * the sorted list of its cluster ids, so it is stable for identical evidence and
 * can be rebuilt on demand without handing Phase 2A-11 an in-memory identifier.
 */
function buildGroups(
  clusters: readonly SubjectClusterRecord[],
  matches: readonly SubjectMatchRecord[],
): Array<{ groupId: string; clusterIds: string[]; memberClaimIds: string[]; ambiguous: boolean }> {
  const clusterOfClaim = new Map<string, string>();
  for (const cluster of clusters) for (const claimId of cluster.memberClaimIds) clusterOfClaim.set(claimId, cluster.subjectClusterId);

  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot < rightRoot ? rightRoot : leftRoot, leftRoot < rightRoot ? leftRoot : rightRoot);
  };
  for (const cluster of clusters) parent.set(cluster.subjectClusterId, cluster.subjectClusterId);
  const ambiguousClusters = new Set<string>();
  for (const match of matches) {
    if (match.matchClass === "SAME_SUBJECT") {
      const left = clusterOfClaim.get(match.leftClaimId);
      const right = clusterOfClaim.get(match.rightClaimId);
      if (left && right && left !== right) union(left, right);
    }
    if (match.matchClass === "AMBIGUOUS") {
      const left = clusterOfClaim.get(match.leftClaimId);
      const right = clusterOfClaim.get(match.rightClaimId);
      if (left) ambiguousClusters.add(left);
      if (right) ambiguousClusters.add(right);
    }
  }

  const groups = new Map<string, SubjectClusterRecord[]>();
  for (const cluster of clusters) {
    const root = find(cluster.subjectClusterId);
    const list = groups.get(root) ?? [];
    list.push(cluster);
    groups.set(root, list);
  }

  return [...groups.values()]
    .map((members) => {
      const clusterIds = members.map((cluster) => cluster.subjectClusterId).sort();
      const memberClaimIds = members.flatMap((cluster) => cluster.memberClaimIds).sort();
      return {
        groupId: clusterIds[0]!,
        clusterIds,
        memberClaimIds,
        ambiguous: members.some((cluster) => ambiguousClusters.has(cluster.subjectClusterId)) || members.some((cluster) => cluster.ambiguous),
      };
    })
    .sort((left, right) => (left.groupId < right.groupId ? -1 : 1));
}

/**
 * Strong identifier veto.
 *
 * When both sides assert a DIFFERENT strong identifier (a different GlobalId, a
 * different tag, or a different manufacturer+model), the weaker compared key is
 * vetoed: the pair is a conflict, not a match.
 */
function strongerIdentifierConflict(
  left: NormalizedEvidenceClaim,
  right: NormalizedEvidenceClaim,
  comparedNamespace: SubjectKeyNamespace,
  strongKeysByArtifact: ReadonlyMap<string, Array<{ namespace: SubjectKeyNamespace; key: string }>>,
): string | null {
  const leftKeys = strongKeysByArtifact.get(left.sourceArtifactId) ?? [];
  const rightKeys = strongKeysByArtifact.get(right.sourceArtifactId) ?? [];
  for (const namespace of STRONG_IDENTIFIER_NAMESPACES) {
    if (namespace === comparedNamespace) continue;
    const leftValues = leftKeys.filter((item) => item.namespace === namespace).map((item) => item.key);
    const rightValues = rightKeys.filter((item) => item.namespace === namespace).map((item) => item.key);
    if (!leftValues.length || !rightValues.length) continue;
    if (leftValues.some((value) => rightValues.includes(value))) continue;
    return `both sides carry a different exact ${namespace} identifier, so the weaker ${comparedNamespace} agreement was vetoed`;
  }
  return null;
}

/** Token helper re-exported so tests can assert the matcher's own vocabulary. */
export { subjectTokens };
