/**
 * Phase 2A-10: durable subject-match and subject-cluster shapes.
 *
 * They live at the application boundary because they are the RECORD the engine
 * persists and the read contract Phase 2A-11 consumes; the matching RULES stay
 * in the domain.
 */

import type { MatchBlocker, MatchCorroborator, MatchTier, SubjectKeyNamespace, SubjectMatchClass } from "@/src/domain/cross-document";

export type SubjectMatchBlockerList = readonly MatchBlocker[];

/** One durable, explained subject match. */
export type SubjectMatchRecord = {
  subjectMatchId: string;
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string;
  leftClaimId: string;
  rightClaimId: string;
  leftArtifactId: string;
  rightArtifactId: string;
  tier: MatchTier;
  matchClass: SubjectMatchClass;
  namespace: SubjectKeyNamespace;
  comparedKeys: string[];
  corroborators: MatchCorroborator[];
  blockers: MatchBlocker[];
  reasons: string[];
  /** Deterministic similarity score, present only when one was computed. */
  score: number | null;
  ambiguous: boolean;
  /** True when both sides belong to one Phase 2A-9 derivation family. */
  sameDerivationFamily: boolean;
  reliability: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
  matcherVersion: string;
  explanationVersion: string;
  createdAt: string;
};

/**
 * A durable subject cluster.
 *
 * The cluster identity is deterministic over (company, scope, namespace, match
 * key), so it is stable across runs and can be handed to Phase 2A-11 without
 * handing over an in-memory identifier.
 */
export type SubjectClusterRecord = {
  subjectClusterId: string;
  companyId: string;
  comparisonScopeId: string;
  namespace: SubjectKeyNamespace;
  matchKey: string;
  /** Verbatim subject keys that landed in this cluster, sorted. */
  subjectKeys: string[];
  /** Stable member claim ids, sorted. */
  memberClaimIds: string[];
  /** Derivation families represented in the cluster, sorted. */
  derivationFamilyRootIds: string[];
  /** Strongest tier present, or null when only corroboration is present. */
  strongestTier: MatchTier | null;
  ambiguous: boolean;
  /** True only when every member pair is a comparable SAME_SUBJECT match. */
  comparable: boolean;
  blockers: MatchBlocker[];
  reliability: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
  matcherVersion: string;
  createdAt: string;
  updatedAt: string;
};
