/**
 * Phase 2A-10: CROSS-DOCUMENT FINDINGS, evidence signatures, staleness, and the
 * human review lifecycle.
 *
 * The model separates two things that must never be conflated:
 *
 * - FINDING IDENTITY — the logical discrepancy. It is derived from the company,
 *   scope, finding kind, predicate, stable subject cluster, and the participant
 *   document/lineage families. It deliberately EXCLUDES the current differing
 *   values, so "BOQ 24 vs IFC 22" and later "BOQ 24 vs IFC 23" are the SAME
 *   logical finding with a new evidence signature;
 * - EVIDENCE SIGNATURE — the claim ids, verbatim values, units, and locators
 *   that currently support the finding, with a content hash for change
 *   detection.
 *
 * The engine owns `reproduced`, `stale`, `staleReason`, and `evidenceChanged`.
 * The engine NEVER touches `reviewState`: only a human moves a finding through
 * its lifecycle, and every move is an appended event.
 *
 * RESOLUTION IS NOT APPROVAL. There is no field on this model for an approved
 * quantity, a winning side, a preferred value, or a correct value, and there is
 * no path from a resolved finding into a Requirement, BOM, quotation, or
 * procurement object.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { createHash } from "node:crypto";
import { CROSS_DOCUMENT_BOUNDS, DISABLED_FINDING_KINDS_DEFAULT, FINDING_PROJECTOR_VERSION } from "./ComparisonPolicy";
import type { ClaimPredicate, QuantityOrigin, UnitDimension } from "./EvidenceClaim";

// ---------------------------------------------------------------------------
// Finding categories
// ---------------------------------------------------------------------------

export const FINDING_KINDS = [
  "STATED_QUANTITY_MISMATCH",
  "MODEL_REFERENCE_MISMATCH",
  "MANUFACTURER_MISMATCH",
  "BRAND_MISMATCH",
  "RATING_MISMATCH",
  "UNIT_MISMATCH",
  "UNIT_NOT_COMPARABLE",
  "MATERIAL_MISMATCH",
  "LOCATION_MISMATCH",
  "SYSTEM_ASSIGNMENT_MISMATCH",
  "IDENTITY_TAG_MISMATCH",
  "TYPE_MISMATCH",
  "CLASSIFICATION_MISMATCH",
  "REVISION_MISMATCH",
  "REVISION_SET_BLOCKED",
  "INCLUSION_EXCLUSION_MISMATCH",
  "PROPERTY_MISSING_IN_SOURCE",
  "SCHEDULE_COUNTERPART_MISSING",
  "AMBIGUOUS_SUBJECT_MATCH",
  "SUBJECT_SUGGESTION_ONLY",
  "EVIDENCE_COVERAGE_INCOMPLETE",
  "EVIDENCE_UNAVAILABLE_FOR_COMPARISON",
  "DERIVATION_FIDELITY_REVIEW",
  "DESCRIPTION_MISMATCH",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

const FINDING_KIND_SET = new Set<string>(FINDING_KINDS);
export function isFindingKind(value: string): value is FindingKind {
  return FINDING_KIND_SET.has(value);
}

/**
 * Finding families that would require commercial normalization. They do not
 * exist in this phase: a rate, an amount, and a currency are source-native
 * commercial evidence, never 2A-10 comparison claims.
 */
export const PROHIBITED_FINDING_KINDS: readonly string[] = ["RATE_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH"];

/** Finding kinds the engine ships enabled by default. */
export function defaultEnabledFindingKinds(): FindingKind[] {
  return FINDING_KINDS.filter((kind) => !DISABLED_FINDING_KINDS_DEFAULT.includes(kind));
}

/** The predicate family a finding compares, when it compares one. */
export function predicateForFindingKind(kind: FindingKind): ClaimPredicate | null {
  switch (kind) {
    case "STATED_QUANTITY_MISMATCH":
      return "STATED_QUANTITY";
    case "MODEL_REFERENCE_MISMATCH":
      return "MODEL_REFERENCE";
    case "MANUFACTURER_MISMATCH":
      return "MANUFACTURER";
    case "BRAND_MISMATCH":
      return "BRAND";
    case "RATING_MISMATCH":
      return "RATING";
    case "MATERIAL_MISMATCH":
      return "MATERIAL";
    case "LOCATION_MISMATCH":
      return "LOCATION";
    case "SYSTEM_ASSIGNMENT_MISMATCH":
      return "SYSTEM_ASSIGNMENT";
    case "IDENTITY_TAG_MISMATCH":
      return "IDENTITY_TAG";
    case "TYPE_MISMATCH":
      return "TYPE_NAME";
    case "CLASSIFICATION_MISMATCH":
      return "CLASSIFICATION_CODE";
    case "REVISION_MISMATCH":
      return "REVISION_LABEL";
    case "DESCRIPTION_MISMATCH":
      return "DESCRIPTION_TEXT";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/**
 * One bounded evidence participant of a finding.
 *
 * No participant is a winner, a preferred source, or an approved value. The
 * ordinal exists only for stable display order, and it never changes meaning.
 */
export type FindingParticipant = {
  participantId: string;
  findingId: string;
  /** Stable display ordinal. It never implies preference or correctness. */
  ordinal: number;
  claimId: string;
  sourceArtifactId: string;
  /** Phase 2A-9 lineage root of the participant. */
  derivationFamilyRootArtifactId: string;
  documentRole: string;
  documentIdentityId: string | null;
  documentRevisionMembershipId: string | null;
  verbatimValue: string;
  /** Source numeric view, only when the source itself supplied one. */
  sourceNumericView: number | null;
  unit: string | null;
  unitDeclared: boolean;
  quantityOrigin: QuantityOrigin | null;
  locator: string;
  humanLocator: string | null;
  citationId: string | null;
  sourceKind: string;
  readingChannel: string;
  reliability: "HIGH" | "MEDIUM" | "LOW";
  confidence: number | null;
  limitations: string[];
};

export function buildParticipantId(input: { findingId: string; claimId: string }): string {
  return `fpt_${createHash("sha256").update(["voka:2a-10:participant:v1", input.findingId, input.claimId].join("\u0000"), "utf8").digest("hex").slice(0, 40)}`;
}

// ---------------------------------------------------------------------------
// Finding identity vs evidence signature
// ---------------------------------------------------------------------------

export type FindingFingerprintInput = {
  companyId: string;
  comparisonScopeId: string;
  findingKind: FindingKind;
  predicate: ClaimPredicate | null;
  /** Stable subject cluster identity. Never a transient in-memory id. */
  subjectClusterId: string | null;
  /** Participant document/lineage families, sorted. Values are deliberately excluded. */
  participantFamilyKeys: readonly string[];
  /** Subject keys, sorted: the same discrepancy about the same subject. */
  subjectKeys: readonly string[];
};

/**
 * Deterministic FINDING FINGERPRINT.
 *
 * Current differing values are deliberately excluded: a later source revision
 * that changes 22 to 23 updates the EVIDENCE SIGNATURE of the same logical
 * finding instead of creating an unrelated second finding.
 */
export function buildFindingFingerprint(input: FindingFingerprintInput): string {
  const families = [...input.participantFamilyKeys].map((value) => value.trim()).filter(Boolean).sort();
  const subjects = [...input.subjectKeys].map((value) => value.trim()).filter(Boolean).sort();
  return createHash("sha256")
    .update(
      [
        "voka:2a-10:finding:v1",
        input.companyId,
        input.comparisonScopeId,
        input.findingKind,
        input.predicate ?? "no-predicate",
        input.subjectClusterId ?? "no-cluster",
        families.join(","),
        subjects.join(","),
      ].join("\u0000"),
      "utf8",
    )
    .digest("hex");
}

export type EvidenceSignatureEntry = {
  claimId: string;
  verbatimValue: string;
  unit: string | null;
  locator: string;
  sourceArtifactId: string;
  readingChannel: string;
};

export type EvidenceSignature = {
  entries: EvidenceSignatureEntry[];
  /** Deterministic hash over the current evidence; changes when any entry changes. */
  signatureHash: string;
};

/**
 * EVIDENCE SIGNATURE.
 *
 * It includes the claim ids, the verbatim values, the units, and the locators —
 * everything a reviewer needs to see WHAT the sources currently state.
 */
export function buildEvidenceSignature(entries: readonly EvidenceSignatureEntry[]): EvidenceSignature {
  const sorted = [...entries].sort((left, right) => (left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0));
  return {
    entries: sorted,
    signatureHash: createHash("sha256")
      .update(
        ["voka:2a-10:signature:v1", ...sorted.map((entry) => [entry.claimId, entry.sourceArtifactId, entry.verbatimValue, entry.unit ?? "", entry.locator, entry.readingChannel].join("\u0001"))].join("\u0000"),
        "utf8",
      )
      .digest("hex"),
  };
}

/** True when the evidence behind a logical finding changed since the last observation. */
export function evidenceChanged(previous: EvidenceSignature | null, current: EvidenceSignature): boolean {
  if (!previous) return false;
  return previous.signatureHash !== current.signatureHash;
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

export const STALE_REASONS = [
  "NOT_REPRODUCED",
  "ARTIFACT_BYTES_CHANGED",
  "SCOPE_CHANGED",
  "ENGINE_VERSION_CHANGED",
  "CLAIMS_SUPERSEDED",
] as const;
export type StaleReason = (typeof STALE_REASONS)[number];

export type FindingEngineFlags = {
  /** True when the current run reproduced this logical finding. */
  reproduced: boolean;
  /** True when the finding no longer reflects current evidence. */
  stale: boolean;
  staleReason: StaleReason | null;
  evidenceChanged: boolean;
  lastReproducedRunId: string | null;
  lastReproducedAt: string | null;
};

/** Engine-owned flags. The engine may change ONLY these. */
export function nextEngineFlags(input: {
  reproduced: boolean;
  evidenceChanged: boolean;
  previous: FindingEngineFlags;
  runId: string;
  now: string;
  staleReasonOverride?: StaleReason | null;
}): FindingEngineFlags {
  if (input.reproduced) {
    return {
      reproduced: true,
      stale: false,
      staleReason: null,
      evidenceChanged: input.evidenceChanged,
      lastReproducedRunId: input.runId,
      lastReproducedAt: input.now,
    };
  }
  return {
    reproduced: false,
    stale: true,
    staleReason: input.staleReasonOverride ?? "NOT_REPRODUCED",
    evidenceChanged: input.evidenceChanged,
    lastReproducedRunId: input.previous.lastReproducedRunId,
    lastReproducedAt: input.previous.lastReproducedAt,
  };
}

// ---------------------------------------------------------------------------
// Human review lifecycle
// ---------------------------------------------------------------------------

export const REVIEW_STATES = ["OPEN", "ACKNOWLEDGED", "NEEDS_INFORMATION", "RESOLVED", "DISMISSED"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const REVIEW_STATE_SET = new Set<string>(REVIEW_STATES);
export function isReviewState(value: string): value is ReviewState {
  return REVIEW_STATE_SET.has(value);
}

/**
 * Allowed transitions.
 *
 * RESOLVED and DISMISSED are terminal for the automatic path and may only be
 * reopened through an EXPLICIT, audited reopen event.
 */
export const REVIEW_TRANSITIONS: Record<ReviewState, readonly ReviewState[]> = {
  OPEN: ["ACKNOWLEDGED", "NEEDS_INFORMATION", "RESOLVED", "DISMISSED"],
  ACKNOWLEDGED: ["NEEDS_INFORMATION", "RESOLVED", "DISMISSED", "OPEN"],
  NEEDS_INFORMATION: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED", "OPEN"],
  RESOLVED: ["OPEN"],
  DISMISSED: ["OPEN"],
};

export const REVIEW_EVENT_KINDS = ["TRANSITIONED", "REOPENED", "COMMENTED"] as const;
export type ReviewEventKind = (typeof REVIEW_EVENT_KINDS)[number];

export type FindingReviewEvent = {
  eventId: string;
  findingId: string;
  companyId: string;
  fromState: ReviewState | null;
  toState: ReviewState;
  kind: ReviewEventKind;
  actorUserId: string;
  reason: string;
  /** Always true: reopening is an explicit, recorded act. */
  explicit: boolean;
  createdAt: string;
};

export function buildReviewEventId(input: { findingId: string; sequence: number }): string {
  return `rev_${createHash("sha256").update(["voka:2a-10:review-event:v1", input.findingId, String(input.sequence)].join("\u0000"), "utf8").digest("hex").slice(0, 40)}`;
}

/**
 * Validates a human review transition.
 *
 * The engine has no way to reach this function with a state change of its own:
 * it is called only from the audited transition command, which records an
 * actor. An invalid transition is refused rather than coerced.
 */
export function validateReviewTransition(input: { from: ReviewState; to: ReviewState; reason: string }): { valid: boolean; problem: string | null } {
  if (input.from === input.to) return { valid: false, problem: `the finding is already ${input.from}` };
  if (!REVIEW_TRANSITIONS[input.from].includes(input.to)) {
    return { valid: false, problem: `a finding may not move from ${input.from} to ${input.to}` };
  }
  if ((input.from === "RESOLVED" || input.from === "DISMISSED") && input.to === "OPEN") {
    if (!input.reason.trim()) return { valid: false, problem: "reopening a closed finding requires an explicit reason" };
  }
  return { valid: true, problem: null };
}

/** True when a transition is an explicit reopen of a closed finding. */
export function isReopen(from: ReviewState, to: ReviewState): boolean {
  return (from === "RESOLVED" || from === "DISMISSED") && to === "OPEN";
}

/** Opening review state for a newly projected finding. */
export const INITIAL_REVIEW_STATE: ReviewState = "OPEN";

// ---------------------------------------------------------------------------
// Finding record
// ---------------------------------------------------------------------------

export type CrossDocumentFindingRecord = {
  findingId: string;
  companyId: string;
  comparisonScopeId: string;
  comparisonRunId: string;
  fingerprint: string;
  findingKind: FindingKind;
  predicate: ClaimPredicate | null;
  subjectClusterId: string | null;
  subjectKeys: string[];
  participantFamilies: string[];
  evidenceSignature: EvidenceSignature;
  /** Runtime token for the localized statement. Raw tokens are never presented. */
  statementTemplateKey: string;
  severity: FindingSeverity;
  engineFlags: FindingEngineFlags;
  reviewState: ReviewState;
  participantIds: string[];
  limitations: string[];
  truncated: boolean;
  projectorVersion: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Review ordering only.
 *
 * Severity is a fixed function of the finding kind and the matched evidence — it
 * is NEVER derived from which source a document role names, so reordering roles
 * over identical evidence leaves severity untouched.
 */
export const FINDING_SEVERITIES = ["INFO", "REVIEW", "ATTENTION"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

const FINDING_SEVERITY_BY_KIND: Partial<Record<FindingKind, FindingSeverity>> = {
  STATED_QUANTITY_MISMATCH: "ATTENTION",
  REVISION_SET_BLOCKED: "ATTENTION",
  UNIT_MISMATCH: "ATTENTION",
  EVIDENCE_UNAVAILABLE_FOR_COMPARISON: "ATTENTION",
  EVIDENCE_COVERAGE_INCOMPLETE: "REVIEW",
  DERIVATION_FIDELITY_REVIEW: "REVIEW",
  AMBIGUOUS_SUBJECT_MATCH: "REVIEW",
  SUBJECT_SUGGESTION_ONLY: "INFO",
};

/**
 * Severity for a finding kind.
 *
 * The function takes the finding kind and nothing else. There is deliberately
 * no parameter for document role, source kind, ranking, or provenance: none of
 * them may influence severity.
 */
export function severityForFindingKind(kind: FindingKind): FindingSeverity {
  return FINDING_SEVERITY_BY_KIND[kind] ?? "REVIEW";
}

/** Runtime statement template token, one per finding family. */
export function statementTemplateKeyForFindingKind(kind: FindingKind): string {
  return `finding.${kind.toLowerCase()}`;
}

export const FINDING_PROJECTOR_VERSION_VALUE = FINDING_PROJECTOR_VERSION;

/** Bounded review-event history length retained in one read model response. */
export const MAX_REVIEW_EVENTS_RETURNED = 50;

/** Bounded participants retained per finding, re-exported for one canonical source. */
export const MAX_FINDING_PARTICIPANTS = CROSS_DOCUMENT_BOUNDS.maxParticipantsPerFinding;
