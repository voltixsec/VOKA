/**
 * Phase 2A-10: governed DOCUMENT IDENTITY, REVISION MEMBERSHIP, DOCUMENT
 * RELATIONS, and the ACTIVE REVISION DECISION.
 *
 * Three hard rules shape this module:
 *
 * 1. An evidence-suggested identity is NEVER a confirmed identity. A drawing
 *    number written on two sheets suggests a family; it does not merge two
 *    rows. Uncertainty is represented, never resolved by a unique-key
 *    collision, which is why the evidence-derived family key is explicitly
 *    non-unique and only a governance-CONFIRMED key may be guarded.
 * 2. A revision label is EVIDENCE. "Rev B" observed in a title block does not
 *    mean Rev B is active. Activation is a human governance decision with its
 *    own append-only version history.
 * 3. Two incompatible active revisions block comparison readiness for that
 *    document identity. VOKA never silently compares both as current.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { createHash } from "node:crypto";
import { CROSS_DOCUMENT_BOUNDS, DOCUMENT_IDENTITY_RESOLVER_VERSION } from "./ComparisonPolicy";
import type { ClaimReliability } from "./EvidenceClaim";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const DOCUMENT_IDENTITY_KINDS = [
  "DRAWING",
  "SPECIFICATION_SECTION",
  "BOQ_OR_SCHEDULE",
  "BIM_MODEL",
  "TENDER_PACKAGE",
  "SUBMITTAL",
  "UNRESOLVED",
] as const;
export type DocumentIdentityKind = (typeof DOCUMENT_IDENTITY_KINDS)[number];

const DOCUMENT_IDENTITY_KIND_SET = new Set<string>(DOCUMENT_IDENTITY_KINDS);
export function isDocumentIdentityKind(value: string): value is DocumentIdentityKind {
  return DOCUMENT_IDENTITY_KIND_SET.has(value);
}

/**
 * What a document IS in the comparison, for organization and navigation.
 *
 * A role never selects a winner, never makes a source authoritative, never
 * suppresses another source, and never changes a finding's severity. Reordering
 * roles over identical evidence must leave finding semantics untouched.
 */
export const DOCUMENT_ROLES = [
  "SPECIFICATION",
  "BOQ",
  "DRAWING",
  "SCHEDULE",
  "BIM_MODEL",
  "TENDER",
  "ADDENDUM",
  "SUBMITTAL",
  "UNKNOWN",
] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

const DOCUMENT_ROLE_SET = new Set<string>(DOCUMENT_ROLES);
export function isDocumentRole(value: string): value is DocumentRole {
  return DOCUMENT_ROLE_SET.has(value);
}

/** How a role was established. Never used to make a role authoritative. */
export const DOCUMENT_ROLE_SOURCES = ["USER_DECLARED", "OBSERVED_FROM_CONTENT"] as const;
export type DocumentRoleSource = (typeof DOCUMENT_ROLE_SOURCES)[number];

/** How an identity became durable. */
export const DOCUMENT_IDENTITY_BASES = [
  "EVIDENCE_SUGGESTED",
  "GOVERNANCE_CONFIRMED",
  "UNRESOLVED",
] as const;
export type DocumentIdentityBasis = (typeof DOCUMENT_IDENTITY_BASES)[number];

/** What kind of evidence supported a suggested identity. */
export const DOCUMENT_IDENTITY_EVIDENCE_KINDS = [
  "DRAWING_OR_SHEET_NUMBER",
  "DOCUMENT_TITLE",
  "SECTION_OR_DIVISION",
  "PROJECT_TITLE",
  "IFC_PROJECT_NAME",
  "WORKBOOK_TITLE",
  "DISCIPLINE",
] as const;
export type DocumentIdentityEvidenceKind = (typeof DOCUMENT_IDENTITY_EVIDENCE_KINDS)[number];

/**
 * Relations 2A-10 owns.
 *
 * `DERIVED_FROM` is deliberately absent: Phase 2A-9 `ArtifactDerivation`
 * already owns that concept, and duplicating it here would create a second,
 * competing source of truth for lineage.
 */
export const DOCUMENT_RELATION_KINDS = [
  "REVISION_OF",
  "SUPERSEDES",
  "ADDENDUM_TO",
  "REFERENCES",
  "SAME_FAMILY",
] as const;
export type DocumentRelationKind = (typeof DOCUMENT_RELATION_KINDS)[number];

const DOCUMENT_RELATION_KIND_SET = new Set<string>(DOCUMENT_RELATION_KINDS);
export function isDocumentRelationKind(value: string): value is DocumentRelationKind {
  return DOCUMENT_RELATION_KIND_SET.has(value);
}

/** How a relation was established. */
export const DOCUMENT_RELATION_BASES = ["USER_DECLARED", "OBSERVED_EVIDENCE"] as const;
export type DocumentRelationBasis = (typeof DOCUMENT_RELATION_BASES)[number];

/** Active-revision decision semantics. */
export const ACTIVE_REVISION_DECISION_STATUSES = [
  "UNDECIDED",
  "ACTIVE_REVISION_SELECTED",
  "BLOCKED_INCOMPATIBLE_ACTIVES",
] as const;
export type ActiveRevisionDecisionStatus = (typeof ACTIVE_REVISION_DECISION_STATUSES)[number];

/** Why a document identity cannot be compared safely right now. */
export const COMPARISON_BLOCK_REASONS = [
  "NO_ACTIVE_REVISION_DECISION",
  "INCOMPATIBLE_ACTIVE_REVISIONS",
  "AMBIGUOUS_DOCUMENT_IDENTITY",
  "UNRESOLVED_DOCUMENT_IDENTITY",
  "EVIDENCE_COVERAGE_PARTIAL",
  "SOURCE_BYTES_UNAVAILABLE",
] as const;
export type ComparisonBlockReason = (typeof COMPARISON_BLOCK_REASONS)[number];

/** Truthful readiness of one document identity for comparison or handoff. */
export const DOCUMENT_READINESS_STATES = [
  "READY",
  "BLOCKED_REVISION_DECISION",
  "BLOCKED_AMBIGUOUS_IDENTITY",
  "PARTIAL_EVIDENCE",
  "UNDECIDED",
] as const;
export type DocumentReadinessState = (typeof DOCUMENT_READINESS_STATES)[number];

// ---------------------------------------------------------------------------
// Identity evidence and suggestion
// ---------------------------------------------------------------------------

export type DocumentIdentityEvidence = {
  kind: DocumentIdentityEvidenceKind;
  /** Verbatim value the evidence came from. Never normalized into master data. */
  value: string;
  sourceArtifactId: string;
  claimId: string | null;
  locator: string | null;
  reliability: ClaimReliability;
  limitations: string[];
};

/**
 * A SUGGESTED document identity.
 *
 * `observedFamilyKey` is deterministic over the evidence and is indexed
 * NON-UNIQUE: two uncertain documents may legitimately produce the same
 * suggested key, and the database must preserve that ambiguity rather than
 * forcing a merge.
 */
export type SuggestedDocumentIdentity = {
  observedFamilyKey: string;
  kind: DocumentIdentityKind;
  /** Human label built from the strongest evidence, verbatim. */
  label: string;
  evidence: DocumentIdentityEvidence[];
  /** Bounded, deterministic variant index when evidence conflicts. */
  variant: number;
  /** True when more than one distinct suggested family key competes for one artifact. */
  ambiguous: boolean;
  reliability: ClaimReliability;
  limitations: string[];
};

function bounded(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > CROSS_DOCUMENT_BOUNDS.maxDocumentKeyCharacters
    ? `${trimmed.slice(0, CROSS_DOCUMENT_BOUNDS.maxDocumentKeyCharacters)}…`
    : trimmed;
}

/** Conservative normalization for a suggested key: case-fold, collapse separators. Never drops digits. */
export function normalizeIdentityToken(raw: string): string {
  return raw
    .replace(/[\u0640]/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_/.\\-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
}

/**
 * Deterministic suggested family key.
 *
 * The strongest evidence present wins, in a fixed precedence order, so the
 * same document always suggests the same key. `variant` lets a genuinely
 * different second candidate exist WITHOUT being merged into the first.
 */
export function buildObservedFamilyKey(input: {
  kind: DocumentIdentityKind;
  evidence: readonly DocumentIdentityEvidence[];
  variant?: number;
}): string {
  const precedence: DocumentIdentityEvidenceKind[] = [
    "DRAWING_OR_SHEET_NUMBER",
    "SECTION_OR_DIVISION",
    "IFC_PROJECT_NAME",
    "WORKBOOK_TITLE",
    "DOCUMENT_TITLE",
    "PROJECT_TITLE",
    "DISCIPLINE",
  ];
  const parts: string[] = [input.kind];
  for (const kind of precedence) {
    const match = input.evidence.find((item) => item.kind === kind);
    const token = match ? normalizeIdentityToken(match.value) : "";
    if (token) {
      parts.push(`${kind}=${token}`);
      // One primary token per evidence kind keeps the key stable and short.
      break;
    }
  }
  const secondary = input.evidence.find((item) => item.kind === "DISCIPLINE" || item.kind === "DOCUMENT_TITLE");
  if (secondary && !parts.some((part) => part.includes(`${secondary.kind}=`))) {
    const token = normalizeIdentityToken(secondary.value);
    if (token) parts.push(`${secondary.kind}=${token}`);
  }
  parts.push(`v${input.variant ?? 0}`);
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 40);
}

/** Deterministic key for a GOVERNANCE-CONFIRMED identity. Only this key may be guarded by uniqueness. */
export function buildConfirmedIdentityKey(input: { companyId: string; kind: DocumentIdentityKind; label: string; key: string }): string {
  return createHash("sha256")
    .update(["voka:2a-10:identity:v1", input.companyId, input.kind, normalizeIdentityToken(input.key || input.label)].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 40);
}

/**
 * Chooses the identity kind from the evidence a document actually presents.
 * Unresolved is an honest answer, never a fallback guess.
 */
export function resolveIdentityKind(input: {
  artifactKind: string;
  evidence: readonly DocumentIdentityEvidence[];
  declaredRole?: DocumentRole | null;
}): DocumentIdentityKind {
  const kinds = new Set(input.evidence.map((item) => item.kind));
  if (input.artifactKind === "IFC" || input.artifactKind === "RVT") return kinds.has("IFC_PROJECT_NAME") || input.artifactKind === "RVT" ? "BIM_MODEL" : "BIM_MODEL";
  if (input.artifactKind === "XLSX") return "BOQ_OR_SCHEDULE";
  if (input.artifactKind === "DXF" || input.artifactKind === "DWG") return kinds.has("DRAWING_OR_SHEET_NUMBER") ? "DRAWING" : "DRAWING";
  if (kinds.has("SECTION_OR_DIVISION")) return "SPECIFICATION_SECTION";
  if (kinds.has("DRAWING_OR_SHEET_NUMBER")) return "DRAWING";
  if (kinds.has("IFC_PROJECT_NAME")) return "BIM_MODEL";
  if (kinds.has("WORKBOOK_TITLE")) return "BOQ_OR_SCHEDULE";
  return "UNRESOLVED";
}

/** Bounded, deterministic identity suggestion from evidence claims. */
export function suggestDocumentIdentity(input: {
  artifactKind: string;
  evidence: readonly DocumentIdentityEvidence[];
  declaredRole?: DocumentRole | null;
}): SuggestedDocumentIdentity {
  const evidence = input.evidence.slice(0, CROSS_DOCUMENT_BOUNDS.maxIdentityEvidence);
  const kind = resolveIdentityKind({ artifactKind: input.artifactKind, evidence, declaredRole: input.declaredRole ?? null });
  const primary = evidence.find((item) => item.kind === "DRAWING_OR_SHEET_NUMBER")
    ?? evidence.find((item) => item.kind === "SECTION_OR_DIVISION")
    ?? evidence.find((item) => item.kind === "IFC_PROJECT_NAME")
    ?? evidence.find((item) => item.kind === "WORKBOOK_TITLE")
    ?? evidence.find((item) => item.kind === "DOCUMENT_TITLE")
    ?? evidence.find((item) => item.kind === "PROJECT_TITLE")
    ?? evidence[0]
    ?? null;
  const label = bounded(primary?.value ?? null) ?? "unresolved document";
  const observedFamilyKey = buildObservedFamilyKey({ kind, evidence });
  const reliability: ClaimReliability = evidence.some((item) => item.reliability === "HIGH")
    ? "HIGH"
    : evidence.some((item) => item.reliability === "MEDIUM") ? "MEDIUM" : "LOW";
  const limitations = [
    "a suggested document identity is evidence, not a confirmed database identity; confirming it is a governance action",
  ];
  if (!evidence.length) limitations.push("no document-identity evidence was observed for this artifact, so its identity stays unresolved");
  return {
    observedFamilyKey,
    kind,
    label,
    evidence,
    variant: 0,
    ambiguous: false,
    reliability: evidence.length ? reliability : "LOW",
    limitations,
  };
}

/**
 * Groups artifacts by suggested family key, keeping ambiguity visible.
 *
 * Two artifacts with the same suggested key group together as a SUGGESTION.
 * Two artifacts that each present conflicting identity evidence (for example
 * two different sheet numbers) are reported as ambiguous and stay separate.
 */
export function groupSuggestedIdentities(
  entries: ReadonlyArray<{ artifactId: string; suggestion: SuggestedDocumentIdentity }>,
): Array<{ observedFamilyKey: string; artifactIds: string[]; ambiguous: boolean }> {
  const byKey = new Map<string, string[]>();
  for (const entry of entries) {
    const list = byKey.get(entry.suggestion.observedFamilyKey) ?? [];
    list.push(entry.artifactId);
    byKey.set(entry.suggestion.observedFamilyKey, list);
  }
  return [...byKey.entries()].map(([observedFamilyKey, artifactIds]) => ({
    observedFamilyKey,
    artifactIds: [...artifactIds].sort(),
    ambiguous: artifactIds.length > 1 && entries.filter((entry) => entry.suggestion.observedFamilyKey === observedFamilyKey).some((entry) => entry.suggestion.ambiguous),
  }));
}

/**
 * Detects whether one artifact presented conflicting identity evidence.
 *
 * When it did, VOKA does not pick a winner: the artifact carries an ambiguity
 * marker and both candidates are preserved for review.
 */
export function identityEvidenceConflicts(evidence: readonly DocumentIdentityEvidence[]): boolean {
  const numbers = new Set(evidence.filter((item) => item.kind === "DRAWING_OR_SHEET_NUMBER").map((item) => normalizeIdentityToken(item.value)));
  return numbers.size > 1;
}

// ---------------------------------------------------------------------------
// Revision membership
// ---------------------------------------------------------------------------

/** What basis put an artifact into a revision membership. */
export const REVISION_MEMBERSHIP_BASES = ["IDENTITY_SUGGESTION", "GOVERNANCE_CONFIRMED"] as const;
export type RevisionMembershipBasis = (typeof REVISION_MEMBERSHIP_BASES)[number];

/**
 * Durable SourceArtifact ↔ DocumentIdentity ↔ observed revision evidence link.
 *
 * A membership never claims the revision is active and never mutates any other
 * artifact's evidence. An addendum is a member of the same identity without
 * changing the base artifact's claims.
 */
export type DocumentRevisionMembership = {
  membershipId: string;
  companyId: string;
  documentIdentityId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  /** Observed label, verbatim; null when the artifact declared none. */
  observedRevisionLabel: string | null;
  /** Claim that carried the observed label, when one did. */
  revisionClaimId: string | null;
  membershipBasis: RevisionMembershipBasis;
  documentRole: DocumentRole;
  documentRoleSource: DocumentRoleSource;
  /** Phase 2A-9 derivation family root: always the original proprietary artifact id. */
  derivationFamilyRootArtifactId: string;
  lineageRole: "STANDALONE" | "DERIVED_INSPECTED" | "ORIGINAL_PROPRIETARY";
  limitations: string[];
  createdAt: string;
};

/** Deterministic membership id: the same artifact in the same identity is one membership. */
export function buildRevisionMembershipId(input: { companyId: string; documentIdentityId: string; sourceArtifactId: string; observedRevisionLabel: string | null }): string {
  return createHash("sha256")
    .update(
      ["voka:2a-10:membership:v1", input.companyId, input.documentIdentityId, input.sourceArtifactId, input.observedRevisionLabel ?? "no-label"].join("\u0000"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 40);
}

/**
 * Finds two memberships that claim to be the SAME revision but were observed
 * with different labels — an incompatibility a governance decision must settle.
 */
export function incompatibleActiveMemberships(
  selected: ReadonlyArray<{ membershipId: string; observedRevisionLabel: string | null }>,
): { incompatible: boolean; labels: string[] } {
  const labels = [...new Set(selected.map((item) => (item.observedRevisionLabel ?? "").trim()).filter(Boolean))];
  return { incompatible: labels.length > 1, labels };
}

// ---------------------------------------------------------------------------
// Active revision decision
// ---------------------------------------------------------------------------

export type ActiveRevisionDecisionRecord = {
  decisionId: string;
  companyId: string;
  documentIdentityId: string;
  /** Monotonic, append-only decision version for the identity. */
  decisionVersion: number;
  status: ActiveRevisionDecisionStatus;
  /** Selected revision memberships. Empty for UNDECIDED and BLOCKED. */
  selectedMembershipIds: string[];
  actorUserId: string;
  reason: string;
  decidedAt: string;
  /** Exact evidence claims the decision was taken on. Never a summary. */
  evidenceClaimIds: string[];
  /** Previous decision this one supersedes; null for the first decision. */
  supersedesDecisionId: string | null;
  blockedReason: string | null;
  /** Scope the decision was taken in, when it is scope-bound. */
  comparisonScopeId: string | null;
  limitations: string[];
};

export function isActiveRevisionDecisionStatus(value: string): value is ActiveRevisionDecisionStatus {
  return (ACTIVE_REVISION_DECISION_STATUSES as readonly string[]).includes(value);
}

/**
 * Validates a decision request against the semantics the phase requires.
 *
 * A `BLOCKED_INCOMPATIBLE_ACTIVES` decision without a reason, and an
 * `ACTIVE_REVISION_SELECTED` decision without at least one selected
 * membership, are both refused rather than stored half-formed.
 */
export function validateActiveRevisionDecision(input: {
  status: ActiveRevisionDecisionStatus;
  selectedMembershipIds: readonly string[];
  blockedReason: string | null;
  reason: string;
}): { valid: boolean; problem: string | null } {
  if (!input.reason.trim()) return { valid: false, problem: "a decision must record the reviewer's reason" };
  if (input.status === "ACTIVE_REVISION_SELECTED" && input.selectedMembershipIds.length === 0) {
    return { valid: false, problem: "an ACTIVE_REVISION_SELECTED decision must name at least one selected revision membership" };
  }
  if (input.status === "BLOCKED_INCOMPATIBLE_ACTIVES" && !input.blockedReason?.trim()) {
    return { valid: false, problem: "a BLOCKED_INCOMPATIBLE_ACTIVES decision must record the incompatibility it found" };
  }
  return { valid: true, problem: null };
}

/**
 * Readiness of one document identity.
 *
 * Every issue keeps its own state: the model never compresses an ambiguous
 * identity, an unresolved revision decision, and partial coverage into a single
 * misleading boolean.
 */
export function documentReadiness(input: {
  hadAmbiguousIdentity: boolean;
  identityResolved: boolean;
  hasActiveDecision: boolean;
  activeDecisionBlocked: boolean;
  anySourcePartial: boolean;
  anySourceUnavailable: boolean;
}): { state: DocumentReadinessState; blockReasons: ComparisonBlockReason[] } {
  const blockReasons: ComparisonBlockReason[] = [];
  if (input.hadAmbiguousIdentity) blockReasons.push("AMBIGUOUS_DOCUMENT_IDENTITY");
  if (!input.identityResolved) blockReasons.push("UNRESOLVED_DOCUMENT_IDENTITY");
  if (input.activeDecisionBlocked) blockReasons.push("INCOMPATIBLE_ACTIVE_REVISIONS");
  else if (!input.hasActiveDecision) blockReasons.push("NO_ACTIVE_REVISION_DECISION");
  if (input.anySourceUnavailable) blockReasons.push("SOURCE_BYTES_UNAVAILABLE");
  else if (input.anySourcePartial) blockReasons.push("EVIDENCE_COVERAGE_PARTIAL");

  if (input.hadAmbiguousIdentity || !input.identityResolved) {
    return { state: "BLOCKED_AMBIGUOUS_IDENTITY", blockReasons };
  }
  if (input.activeDecisionBlocked || !input.hasActiveDecision) {
    return { state: "BLOCKED_REVISION_DECISION", blockReasons };
  }
  if (input.anySourceUnavailable) return { state: "UNDECIDED", blockReasons };
  if (input.anySourcePartial) return { state: "PARTIAL_EVIDENCE", blockReasons };
  return { state: "READY", blockReasons };
}

export const DOCUMENT_IDENTITY_RESOLVER_VERSION_VALUE = DOCUMENT_IDENTITY_RESOLVER_VERSION;
