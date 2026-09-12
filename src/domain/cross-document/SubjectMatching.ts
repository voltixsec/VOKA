/**
 * Phase 2A-10: CONSERVATIVE, DETERMINISTIC subject matching.
 *
 * No embeddings. No network. No LLM. No fuzzy merging. Similar names never
 * auto-merge, description similarity never creates SAME_SUBJECT, prefix
 * matching is never sufficient, and `SD-1` is never `SD-12`.
 *
 * Tiers, strongest first:
 *
 * - T0 `EXACT_GLOBAL_ID` — the identifier literally exists on both sides;
 * - T1 `EXACT_TAG` — an exact equipment tag with safe context or scope
 *   uniqueness;
 * - T2 `EXACT_MANUFACTURER_MODEL` / `EXACT_CLASSIFICATION` / `EXACT_TYPE_NAME`;
 * - T3 `EXACT_ITEM_NUMBER` — only inside the same document/revision family;
 * - T4 `LOCATION_SYSTEM_CORROBORATION` — corroboration only, never identity;
 * - T5 `TOKEN_SIMILARITY_SUGGESTION` — a suggestion for a human, never a match.
 *
 * A stronger identifier conflict VETOES a weaker match. 1:N is ambiguous.
 * Ambiguity blocks value comparison. Every durable match stores its
 * explanation.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { createHash } from "node:crypto";
import { CROSS_DOCUMENT_BOUNDS, SUBJECT_MATCHER_VERSION } from "./ComparisonPolicy";
import type { ClaimPredicate, NormalizedEvidenceClaim, SubjectKeyNamespace } from "./EvidenceClaim";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Match classes. `SAME_SUBJECT` is the only class that permits a value
 * comparison; everything else is review information.
 */
export const SUBJECT_MATCH_CLASSES = [
  "SAME_SUBJECT",
  "AMBIGUOUS",
  "SUGGESTION_ONLY",
  "CONFLICT",
  "NO_MATCH",
] as const;
export type SubjectMatchClass = (typeof SUBJECT_MATCH_CLASSES)[number];

/** Tiers, strongest first. The token order is the precedence order. */
export const MATCH_TIERS = [
  "T0_EXACT_GLOBAL_ID",
  "T1_EXACT_TAG",
  "T2_EXACT_MANUFACTURER_MODEL",
  "T2_EXACT_CLASSIFICATION",
  "T2_EXACT_TYPE_NAME",
  "T3_EXACT_ITEM_NUMBER",
  "T4_LOCATION_SYSTEM_CORROBORATION",
  "T5_TOKEN_SIMILARITY_SUGGESTION",
] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

const MATCH_TIER_RANK: Record<MatchTier, number> = {
  T0_EXACT_GLOBAL_ID: 0,
  T1_EXACT_TAG: 1,
  T2_EXACT_MANUFACTURER_MODEL: 2,
  T2_EXACT_CLASSIFICATION: 3,
  T2_EXACT_TYPE_NAME: 4,
  T3_EXACT_ITEM_NUMBER: 5,
  T4_LOCATION_SYSTEM_CORROBORATION: 6,
  T5_TOKEN_SIMILARITY_SUGGESTION: 7,
};

export function isMatchTier(value: string): value is MatchTier {
  return (MATCH_TIERS as readonly string[]).includes(value);
}

/** Tiers strong enough to support an ordinary value comparison. */
export const COMPARABLE_MATCH_TIERS: readonly MatchTier[] = [
  "T0_EXACT_GLOBAL_ID",
  "T1_EXACT_TAG",
  "T2_EXACT_MANUFACTURER_MODEL",
  "T2_EXACT_CLASSIFICATION",
  "T2_EXACT_TYPE_NAME",
  "T3_EXACT_ITEM_NUMBER",
];

/** Why a candidate pair failed to become a same-subject match. */
export const MATCH_BLOCKERS = [
  "AMBIGUOUS_ONE_TO_MANY",
  "STRONGER_IDENTIFIER_CONFLICT",
  "CROSS_FAMILY_ITEM_NUMBER",
  "KEY_NAMESPACE_MISMATCH",
  "CLASSIFICATION_SCHEME_MISMATCH",
  "CORROBORATION_ONLY",
  "SIMILARITY_ONLY",
  "SAME_DERIVATION_FAMILY",
  "COVERAGE_PARTIAL",
] as const;
export type MatchBlocker = (typeof MATCH_BLOCKERS)[number];

/** Corroborating facts that may strengthen a match but never create one. */
export const MATCH_CORROBORATORS = [
  "LOCATION_AGREES",
  "SYSTEM_AGREES",
  "SECTION_AGREES",
  "DOCUMENT_ROLE_DIFFERS",
  "TYPE_AGREES",
  "UNIT_AGREES",
] as const;
export type MatchCorroborator = (typeof MATCH_CORROBORATORS)[number];

/** The namespaces a tier compares in. */
export const TIER_NAMESPACES: Record<MatchTier, readonly SubjectKeyNamespace[]> = {
  T0_EXACT_GLOBAL_ID: ["GLOBAL_ID"],
  T1_EXACT_TAG: ["EQUIPMENT_TAG"],
  T2_EXACT_MANUFACTURER_MODEL: ["MANUFACTURER_MODEL"],
  T2_EXACT_CLASSIFICATION: ["CLASSIFICATION_CODE"],
  T2_EXACT_TYPE_NAME: ["TYPE_NAME"],
  T3_EXACT_ITEM_NUMBER: ["ITEM_NUMBER"],
  T4_LOCATION_SYSTEM_CORROBORATION: ["ARTIFACT_LOCATOR", "TEXT_LABEL"],
  T5_TOKEN_SIMILARITY_SUGGESTION: ["TEXT_LABEL", "ARTIFACT_LOCATOR", "TYPE_NAME", "SECTION_DIVISION", "DOCUMENT_IDENTITY"],
};

// ---------------------------------------------------------------------------
// Deterministic match keys
// ---------------------------------------------------------------------------

/**
 * Canonical comparison key for a subject value.
 *
 * This is normalization, not interpretation: it case-folds, strips the tatweel,
 * and collapses separators. It never deletes significant characters, never
 * removes digits, and never truncates a value — so `SD-1` and `SD-12` stay
 * distinct keys.
 */
export function canonicalSubjectKey(raw: string): string {
  return raw
    .replace(/[\u0640]/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_]+/gu, " ")
    .replace(/\s*[-–—/]\s*/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** Deterministic key restricted to alphanumerics: punctuation may vary in the source, the identity may not. */
export function compactSubjectKey(raw: string): string {
  return canonicalSubjectKey(raw).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Splits a label into comparison tokens. Single characters are dropped; digits keep their token. */
export function subjectTokens(raw: string): string[] {
  return raw
    .replace(/[\u0640]/gu, "")
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .map((token) => token.toLocaleLowerCase());
}

/**
 * Token overlap between two labels, 0..1.
 *
 * Used ONLY for a T5 suggestion. It never produces a match and never overrides
 * an identifier conflict.
 */
export function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(subjectTokens(left));
  const rightTokens = new Set(subjectTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

/**
 * True when a text key is a PREFIX of another but not equal.
 *
 * Prefix matches are the classic false-positive source (`SD-1` vs `SD-12`), so
 * they are named explicitly and always refused.
 */
export function isPrefixOnlyKey(left: string, right: string): boolean {
  const a = canonicalSubjectKey(left);
  const b = canonicalSubjectKey(right);
  if (!a || !b || a === b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ---------------------------------------------------------------------------
// Candidate pair generation (indexed, never all-to-all)
// ---------------------------------------------------------------------------

/**
 * The comparison key a claim is indexed under, per predicate.
 *
 * Only predicates that can support identity produce a key. Anything else is
 * context and never participates in matching, which is what keeps candidate
 * generation indexed instead of quadratic.
 */
export function identityKeyForClaim(claim: NormalizedEvidenceClaim): { namespace: SubjectKeyNamespace; matchKey: string } | null {
  const namespace = claim.subject.subjectKeyNamespace;
  if (namespace === "TEXT_LABEL" || namespace === "ARTIFACT_LOCATOR") return null;
  return { namespace, matchKey: claim.subject.subjectMatchKey };
}

/** Suggested predicate buckets a claim may be compared within. */
export function comparisonBucketsForPredicate(predicate: ClaimPredicate): readonly string[] {
  switch (predicate) {
    case "STATED_QUANTITY":
      return ["QUANTITY"];
    case "MANUFACTURER":
    case "BRAND":
      return ["MANUFACTURER", "BRAND"];
    case "MODEL_REFERENCE":
      return ["MODEL_REFERENCE"];
    case "CLASSIFICATION_CODE":
      return ["CLASSIFICATION"];
    case "TYPE_NAME":
      return ["TYPE"];
    case "EQUIPMENT_TAG":
    case "IDENTITY_TAG":
      return ["IDENTITY"];
    case "RATING":
      return ["RATING"];
    case "MATERIAL":
      return ["MATERIAL"];
    case "LOCATION":
      return ["LOCATION"];
    case "SYSTEM_ASSIGNMENT":
      return ["SYSTEM"];
    case "UNIT_DECLARATION":
      return ["UNIT"];
    case "REVISION_LABEL":
      return ["REVISION"];
    case "ITEM_NUMBER":
      return ["ITEM_NUMBER"];
    default:
      return [];
  }
}

export type CandidateBucket = {
  bucketId: string;
  claimIds: string[];
  matchKeys: string[];
};

export type CandidatePair = {
  bucketId: string;
  leftClaimId: string;
  rightClaimId: string;
  namespace: SubjectKeyNamespace;
  matchKey: string;
};

/**
 * Indexed candidate generation.
 *
 * Order: company → scope (applied by the caller) → predicate/comparison class →
 * strong identifier → location/system/section corroboration → bounded residual
 * similarity suggestions. Every stage is capped, and a cap that bites is
 * reported so it can be disclosed.
 */
export function generateCandidatePairs(input: {
  claims: readonly NormalizedEvidenceClaim[];
}): { pairs: CandidatePair[]; truncated: boolean; limitations: string[] } {
  const limitations: string[] = [];
  let truncated = false;

  // Stage 1: group by predicate bucket, then by identity key. No pair is ever
  // formed without a shared identity key or key-based bucket.
  const byBucketKey = new Map<string, string[]>();
  let considered = 0;
  for (const claim of input.claims) {
    if (considered >= CROSS_DOCUMENT_BOUNDS.maxClaimsPerScope) {
      truncated = true;
      limitations.push("candidate generation stopped at the scope claim cap; later claims were not matched in this run");
      break;
    }
    considered += 1;
    const identity = identityKeyForClaim(claim);
    if (!identity) continue;
    const buckets = comparisonBucketsForPredicate(claim.assertion.predicate);
    for (const bucket of buckets) {
      const key = `${bucket}\u0000${identity.namespace}\u0000${identity.matchKey}`;
      const list = byBucketKey.get(key) ?? [];
      if (list.length >= CROSS_DOCUMENT_BOUNDS.maxCandidateClaimsPerBucket) {
        truncated = true;
        continue;
      }
      list.push(claim.claimId);
      byBucketKey.set(key, list);
    }
  }

  const pairs: CandidatePair[] = [];
  let pairsTruncated = false;
  const perBucketCount = new Map<string, number>();
  for (const [key, claimIds] of byBucketKey.entries()) {
    if (claimIds.length < 2) continue;
    const [bucketId, namespace, matchKey] = key.split("\u0000");
    const unique = [...new Set(claimIds)].sort();
    let emittedForBucket = perBucketCount.get(bucketId!) ?? 0;
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        if (emittedForBucket >= CROSS_DOCUMENT_BOUNDS.maxCandidatePairsPerBucket) {
          pairsTruncated = true;
          break;
        }
        pairs.push({
          bucketId: bucketId!,
          leftClaimId: unique[i]!,
          rightClaimId: unique[j]!,
          namespace: namespace as SubjectKeyNamespace,
          matchKey: matchKey!,
        });
        emittedForBucket += 1;
      }
      if (emittedForBucket >= CROSS_DOCUMENT_BOUNDS.maxCandidatePairsPerBucket) break;
    }
    perBucketCount.set(bucketId!, emittedForBucket);
  }

  if (pairsTruncated) {
    truncated = true;
    limitations.push("candidate pair generation hit a per-bucket cap; the affected bucket was not compared exhaustively in this run");
  }
  return { pairs, truncated, limitations };
}

// ---------------------------------------------------------------------------
// Match evaluation
// ---------------------------------------------------------------------------

export type SubjectMatchEvaluation = {
  matchId: string;
  matchClass: SubjectMatchClass;
  tier: MatchTier;
  leftClaimId: string;
  rightClaimId: string;
  leftArtifactId: string;
  rightArtifactId: string;
  comparedKeys: string[];
  corroborators: MatchCorroborator[];
  blockers: MatchBlocker[];
  reasons: string[];
  /** Deterministic similarity score, present only when a similarity was computed. */
  score: number | null;
  ambiguous: boolean;
  /** True when the pair belongs to the same Phase 2A-9 derivation family and must not be compared as two documents. */
  sameDerivationFamily: boolean;
  reliability: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
  matcherVersion: string;
};

/** Deterministic subject-match id: identity, not outcome. */
export function buildSubjectMatchId(input: { companyId: string; comparisonScopeId: string; leftClaimId: string; rightClaimId: string; tier: MatchTier }): string {
  const [left, right] = [input.leftClaimId, input.rightClaimId].sort();
  return `smt_${createHash("sha256")
    .update(["voka:2a-10:match:v1", input.companyId, input.comparisonScopeId, left, right, input.tier].join("\u0000"), "utf8")
    .digest("hex")}`;
}

/** Deterministic subject-cluster id: stable across runs for 2A-11 consumption. */
export function buildSubjectClusterId(input: { companyId: string; comparisonScopeId: string; namespace: SubjectKeyNamespace; matchKey: string }): string {
  return `scl_${createHash("sha256")
    .update(["voka:2a-10:cluster:v1", input.companyId, input.comparisonScopeId, input.namespace, input.matchKey].join("\u0000"), "utf8")
    .digest("hex")}`;
}

/** Tier implied by a namespace pair. */
export function tierForNamespaces(namespace: SubjectKeyNamespace): MatchTier | null {
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

/** Stronger identifiers, checked as vetoes against a weaker candidate match. */
const VETO_NAMESPACES: readonly SubjectKeyNamespace[] = ["GLOBAL_ID", "EQUIPMENT_TAG", "MANUFACTURER_MODEL"];

/**
 * Collects the strong identifiers one side of a comparison presents, so a
 * conflicting strong identifier can veto a weaker match.
 */
export function strongIdentifiers(claims: readonly NormalizedEvidenceClaim[]): Array<{ namespace: SubjectKeyNamespace; matchKey: string; claimId: string }> {
  return claims
    .filter((claim) => VETO_NAMESPACES.includes(claim.subject.subjectKeyNamespace))
    .map((claim) => ({ namespace: claim.subject.subjectKeyNamespace, matchKey: claim.subject.subjectMatchKey, claimId: claim.claimId }));
}

export function strongerIdentifierConflict(input: {
  leftIdentifiers: ReadonlyArray<{ namespace: SubjectKeyNamespace; matchKey: string }>;
  rightIdentifiers: ReadonlyArray<{ namespace: SubjectKeyNamespace; matchKey: string }>;
  comparedNamespace: SubjectKeyNamespace;
}): boolean {
  for (const namespace of VETO_NAMESPACES) {
    if (namespace === input.comparedNamespace) continue;
    const left = input.leftIdentifiers.filter((item) => item.namespace === namespace).map((item) => item.matchKey);
    const right = input.rightIdentifiers.filter((item) => item.namespace === namespace).map((item) => item.matchKey);
    if (!left.length || !right.length) continue;
    // The same identifier appears on both sides: no conflict.
    if (left.some((key) => right.includes(key))) continue;
    // Both sides assert a different strong identifier: this pair is not the same subject.
    return true;
  }
  return false;
}

/** Deterministic tier weight used for review ordering; never a selection score. */
export function tierRank(tier: MatchTier): number {
  return MATCH_TIER_RANK[tier];
}

export const SUBJECT_MATCHER_VERSION_VALUE = SUBJECT_MATCHER_VERSION;
