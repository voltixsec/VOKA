/**
 * Phase 2A-10: the immutable, persisted NORMALIZED EVIDENCE CLAIM.
 *
 * A claim is what ONE source artifact STATE about ONE subject through ONE
 * reading channel. It is not an optimization and it is not a cache: Phase
 * 2A-11 needs stable claim identifiers and a stable read contract, and it must
 * never be forced to reconstruct evidence from raw files.
 *
 * Hard rules enforced by construction in this module:
 *
 * - a claim is NEVER approved, correct, winning, selected, resolved, or
 *   preferred. There is no field for any of those concepts, so no consumer can
 *   read one out of a claim;
 * - `valueNumber` is populated ONLY when the accepted source model itself
 *   already supplied a numeric representation (an XLSX `quantityNumber`, an
 *   IFC `IfcQuantityEvidence.value`). A PDF/OCR reading of the literal "24"
 *   keeps the literal and nothing else; the engine may parse a simple literal
 *   ephemerally inside the comparator, but that parsed number is never
 *   persisted as though the source had stated a number;
 * - the claim identifier is deterministic over the source-independent
 *   identity inputs (company, artifact, artifact hash, locator, predicate,
 *   subject identity, source literal, materializer version), so re-running the
 *   materializer over unchanged bytes reproduces the same identifier instead
 *   of creating a second claim;
 * - nothing 2A-10 materializes is a quantity decision: `quantityOrigin` is
 *   either `STATED` (the source stated a quantity) or `DECLARED_MODEL` (a BIM
 *   model declared a quantity). `APPROVED` is deliberately not a value.
 *
 * This module is pure: no Prisma, no HTTP, no I/O, no provider libraries.
 */

import { createHash } from "node:crypto";
import type { SourceArtifactKind } from "@/src/domain/source-artifact";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Every claim is observed and not approved. There is no other value. */
export const CLAIM_STATUS = "OBSERVED_NOT_APPROVED" as const;
export type ClaimStatus = typeof CLAIM_STATUS;

/** The only purpose a 2A-10 claim may serve. */
export const CLAIM_PURPOSE = "CROSS_DOCUMENT_COMPARISON_ONLY" as const;
export type ClaimPurpose = typeof CLAIM_PURPOSE;

/**
 * Which reading an evidence record came from. Channels are deliberately
 * separate: a native PDF reading and an OCR reading of the same page are two
 * claims, never one silently merged claim.
 */
export const READING_CHANNELS = [
  "PDF_NATIVE_TEXT",
  "PDF_OCR_TEXT",
  "IMAGE_VISION",
  "DRAWING_VISION",
  "DRAWING_STRUCTURED",
  "WORKBOOK_STRUCTURED",
  "DXF_STRUCTURED",
  "IFC_MODEL",
] as const;
export type ReadingChannel = (typeof READING_CHANNELS)[number];

const READING_CHANNEL_SET = new Set<string>(READING_CHANNELS);
export function isReadingChannel(value: string): value is ReadingChannel {
  return READING_CHANNEL_SET.has(value);
}

/**
 * The comparison predicates 2A-10 publishes.
 *
 * `DESCRIPTION_TEXT` is present because a description is real evidence a human
 * reviews; it is never a matching predicate and never a quantity predicate.
 */
export const CLAIM_PREDICATES = [
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
  "SECTION_OR_DIVISION",
  "DOCUMENT_IDENTITY",
  "PROPERTY_VALUE",
  "DESCRIPTION_TEXT",
] as const;
export type ClaimPredicate = (typeof CLAIM_PREDICATES)[number];

const CLAIM_PREDICATE_SET = new Set<string>(CLAIM_PREDICATES);
export function isClaimPredicate(value: string): value is ClaimPredicate {
  return CLAIM_PREDICATE_SET.has(value);
}

/**
 * Exactly two quantity origins exist in Phase 2A-10.
 *
 * `STATED` — a document stated the quantity in its own words;
 * `DECLARED_MODEL` — a BIM model declared the quantity as model evidence.
 *
 * `APPROVED` is deliberately absent: approval is 2A-11's decision to make, and
 * a governed Requirement quantity, takeoff line, or BOM quantity is never read
 * back into an evidence claim.
 */
export const QUANTITY_ORIGINS = ["STATED", "DECLARED_MODEL"] as const;
export type QuantityOrigin = (typeof QUANTITY_ORIGINS)[number];

/**
 * The namespace a subject key lives in. Two keys only ever compare inside the
 * SAME namespace, so a tag never silently becomes a model reference.
 */
export const SUBJECT_KEY_NAMESPACES = [
  "GLOBAL_ID",
  "EQUIPMENT_TAG",
  "MANUFACTURER_MODEL",
  "CLASSIFICATION_CODE",
  "TYPE_NAME",
  "ITEM_NUMBER",
  "DRAWING_SHEET",
  "SECTION_DIVISION",
  "DOCUMENT_IDENTITY",
  "TEXT_LABEL",
  "ARTIFACT_LOCATOR",
] as const;
export type SubjectKeyNamespace = (typeof SUBJECT_KEY_NAMESPACES)[number];

const SUBJECT_KEY_NAMESPACE_SET = new Set<string>(SUBJECT_KEY_NAMESPACES);
export function isSubjectKeyNamespace(value: string): value is SubjectKeyNamespace {
  return SUBJECT_KEY_NAMESPACE_SET.has(value);
}

/**
 * Where a subject key came from. `SOURCE_IDENTIFIER` and `SOURCE_LABEL` are
 * evidence; `ENGINE_DERIVED_TEXT_KEY` records that the engine normalized a
 * source label into a comparison key without changing the verbatim value.
 */
export const SUBJECT_KEY_BASES = [
  "SOURCE_IDENTIFIER",
  "SOURCE_LABEL",
  "SOURCE_PROPERTY",
  "ENGINE_DERIVED_TEXT_KEY",
] as const;
export type SubjectKeyBasis = (typeof SUBJECT_KEY_BASES)[number];

/** Ordinal reliability, reusing the accepted observation vocabulary. */
export type ClaimReliability = "HIGH" | "MEDIUM" | "LOW";

/**
 * Unit dimensions recognized ONLY from an explicit closed mapping. A unit that
 * is not in the mapping has `unitDimension: null` and stays unknown.
 */
export const UNIT_DIMENSIONS = [
  "COUNT",
  "LENGTH",
  "AREA",
  "VOLUME",
  "MASS",
  "TIME",
  "POWER",
  "TEMPERATURE",
  "PRESSURE",
  "FLOW",
  "OTHER",
] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

/** How complete the accepted inspection of a source artifact was. */
export const EVIDENCE_COVERAGE = ["COMPLETE", "PARTIAL"] as const;
export type EvidenceCoverage = (typeof EVIDENCE_COVERAGE)[number];

/**
 * Lineage role of the artifact a claim came from.
 *
 * The `ORIGINAL_PROPRIETARY` role exists so a proprietary original can be
 * represented — with its lineage root, filename, hash, method, warnings and
 * fidelity limitations — WITHOUT ever fabricating a claim from bytes VOKA
 * cannot parse.
 */
export const LINEAGE_ROLES = ["STANDALONE", "DERIVED_INSPECTED", "ORIGINAL_PROPRIETARY"] as const;
export type LineageRole = (typeof LINEAGE_ROLES)[number];

/**
 * Revision context an artifact declared about itself. `OBSERVED` never means
 * "active": activation is a governance decision and is never inferred from a
 * label printed in a drawing.
 */
export const REVISION_CONTEXTS = ["UNDETERMINED", "OBSERVED", "SUPERSEDED", "ADDENDUM"] as const;
export type RevisionContext = (typeof REVISION_CONTEXTS)[number];

/** The comparison scope class every 2A-10 claim belongs to. */
export const CLAIM_COMPARISON_SCOPE = "CROSS_DOCUMENT_COMPARISON" as const;

/** Version of the materializer contract itself, independent of per-adapter versions. */
export const CLAIM_MATERIALIZER_CONTRACT_VERSION = "2a-10.claim.v1";

// ---------------------------------------------------------------------------
// Claim record
// ---------------------------------------------------------------------------

/** Subject identity of a claim: which thing the source is talking about. */
export type ClaimSubject = {
  subjectKeyNamespace: SubjectKeyNamespace;
  /** Verbatim key value exactly as the source wrote it. Never normalized. */
  subjectKeyValue: string;
  /** Deterministic normalized key used for matching; never displayed instead of the verbatim value. */
  subjectMatchKey: string;
  subjectKeyBasis: SubjectKeyBasis;
  /** Human-readable subject label (a description or type name), or null. */
  subjectLabel: string | null;
};

/** What the source asserted, and how it may be compared. */
export type ClaimAssertion = {
  predicate: ClaimPredicate;
  /** Comparison policy token owned by ComparisonPolicy.ts. */
  comparisonPolicy: string;
  /** Verbatim source value. Never rewritten, never translated. */
  valueLiteral: string;
  /**
   * Numeric view, populated ONLY when the accepted source model already
   * supplied a numeric representation. Null means the source stated a literal
   * and VOKA did not invent a number for it.
   */
  valueNumber: number | null;
  /** Why `valueNumber` is populated; null whenever `valueNumber` is null. */
  valueNumberOrigin: "SOURCE_SUPPLIED" | null;
  unitLiteral: string | null;
  unitDeclared: boolean;
  unitDimension: UnitDimension | null;
  /** STATED for a document statement, DECLARED_MODEL for BIM model evidence, null for non-quantity predicates. */
  quantityOrigin: QuantityOrigin | null;
};

/** Where the assertion sits in the document, and what surrounds it. */
export type ClaimContext = {
  locationKind: string | null;
  locationValue: string | null;
  systemValue: string | null;
  sectionValue: string | null;
  /** Property/quantity-set qualifiers, e.g. an IFC property set name. */
  qualifiers: string[];
  /** Coverage of the source channel that produced this claim. */
  sourceCoverage: EvidenceCoverage;
  /** Source-specific qualifiers (hidden row, formula-backed, paper space, ...). */
  sourceQualifiers: string[];
};

/** Exact provenance of the claim, so a reviewer can go and look. */
export type ClaimProvenance = {
  /** Exact locator grammar of the accepted source channel. Never re-invented. */
  locator: string;
  /** Human-readable locator, only when it differs from `locator`. */
  humanLocator: string | null;
  pageNumber: number | null;
  citationId: string | null;
  rawRecordKind: string | null;
  rawRecordId: string | null;
  reliability: ClaimReliability;
  /** Only when the source channel itself provided a confidence number. */
  confidence: number | null;
  limitations: string[];
};

/** Evidence-derived document/revision context. Governance lives in membership rows. */
export type ClaimDocumentContext = {
  /** Evidence-suggested document family key; never an unconditional database identity. */
  evidenceDocumentFamilyKey: string | null;
  observedRevisionLabel: string | null;
  revisionContext: RevisionContext;
};

/** Phase 2A-9 lineage, read-only, with the family root rule applied. */
export type ClaimDerivation = {
  /** FAMILY ROOT: always the original proprietary artifact id. */
  derivationFamilyRootArtifactId: string;
  lineageRole: LineageRole;
  derivationId: string | null;
  sourceFormat: string | null;
  derivedFormat: string | null;
  derivationMethod: string | null;
  converterId: string | null;
  converterVersion: string | null;
  /** Channel B: 2A-9 VOKA-authored fidelity limitations, preserved verbatim. */
  fidelityLimitations: string[];
};

export type ClaimEngine = {
  materializerVersion: string;
  engineVersion: string;
  comparisonScope: typeof CLAIM_COMPARISON_SCOPE;
  createdAt: string;
};

/** The complete immutable comparison snapshot for one source assertion. */
export type NormalizedEvidenceClaim = {
  // identity
  claimId: string;
  companyId: string;
  materializationId: string;
  materializedByRunId: string | null;
  sourceArtifactId: string;
  artifactSha256: string;
  sourceKind: SourceArtifactKind;
  readingChannel: ReadingChannel;
  // sections
  subject: ClaimSubject;
  assertion: ClaimAssertion;
  context: ClaimContext;
  provenance: ClaimProvenance;
  document: ClaimDocumentContext;
  derivation: ClaimDerivation;
  engine: ClaimEngine;
  status: ClaimStatus;
  purpose: ClaimPurpose;
};

// ---------------------------------------------------------------------------
// Deterministic claim identity
// ---------------------------------------------------------------------------

/** A field of the claim identity that is deliberately excluded. */
export const CLAIM_ID_EXCLUDED_FIELDS: readonly string[] = [
  "documentIdentityId",
  "documentRevisionMembershipId",
  "revisionContext",
  "activeRevisionDecisionId",
];

export type ClaimIdentityInput = {
  companyId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  readingChannel: ReadingChannel;
  predicate: ClaimPredicate;
  subjectKeyNamespace: SubjectKeyNamespace;
  subjectMatchKey: string;
  locator: string;
  valueLiteral: string;
  valueNumber: number | null;
  materializerVersion: string;
};

/**
 * Deterministic claim identifier.
 *
 * Identical inputs always produce the identical identifier, so the same claim
 * is never persisted twice. Governance state (document identity, revision
 * membership, active revision decision) is deliberately NOT an input: a later
 * governance decision must not fork the evidence, and an evidence change must
 * not silently rewrite a governance record.
 */
export function buildClaimId(input: ClaimIdentityInput): string {
  const canonical = [
    "voka:2a-10:claim:v1",
    input.companyId,
    input.sourceArtifactId,
    input.artifactSha256.toLowerCase(),
    input.readingChannel,
    input.predicate,
    input.subjectKeyNamespace,
    input.subjectMatchKey,
    input.locator,
    input.valueLiteral,
    input.valueNumber === null ? "no-number" : `n:${input.valueNumber}`,
    input.materializerVersion,
  ].join("\u0000");
  return `clm_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** Deterministic materialization identifier: one coverage record per artifact+hash+materializer. */
export function buildMaterializationId(input: {
  companyId: string;
  sourceArtifactId: string;
  artifactSha256: string;
  materializerVersion: string;
}): string {
  const canonical = [
    "voka:2a-10:materialization:v1",
    input.companyId,
    input.sourceArtifactId,
    input.artifactSha256.toLowerCase(),
    input.materializerVersion,
  ].join("\u0000");
  return `mat_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** A dedicated id for a standalone materialization that has not been attached to a run yet. */
export function buildStandaloneRunId(companyId: string, comparisonScopeId: string): string {
  const canonical = ["voka:2a-10:run:v1", companyId, comparisonScopeId].join("\u0000");
  return `run_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Numeric-view policy
// ---------------------------------------------------------------------------

/**
 * An ephemeral, engine-parsed numeric reading of a source literal.
 *
 * It exists ONLY inside the comparator. It is never persisted, never becomes
 * `valueNumber`, and never lowers the source's own reliability: source
 * reliability and parsing provenance stay separate.
 */
export type EngineParsedLiteral = {
  value: number;
  basis: "ENGINE_PARSED_LITERAL";
  /** The verbatim literal it was parsed from; it never replaces that literal. */
  literal: string;
};

/**
 * Parses a simple numeric literal for comparison only.
 *
 * Only plain decimal/grouped integers and decimals are recognized. Anything
 * else — units attached to the number, arithmetic, ranges, fractions in words
 * — stays unparsed, because guessing would put a number in the source's mouth.
 */
export function parseNumericLiteralEphemeral(literal: string): EngineParsedLiteral | null {
  const trimmed = literal.trim();
  if (!trimmed) return null;
  const match = /^([+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|[+-]?\d+(?:\.\d+)?)$/u.exec(trimmed);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(/,/gu, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return { value, basis: "ENGINE_PARSED_LITERAL", literal: trimmed };
}

/**
 * Numeric view for comparison.
 *
 * The source-supplied numeric view always wins when it exists. Otherwise the
 * literal is parsed ephemerally and explicitly marked as engine-parsed.
 */
export type ComparableNumericView =
  | { value: number; basis: "SOURCE_SUPPLIED" }
  | { value: number; basis: "ENGINE_PARSED_LITERAL" }
  | { value: null; basis: "NONE" };

export function comparableNumericView(claim: NormalizedEvidenceClaim): ComparableNumericView {
  if (claim.assertion.valueNumber !== null && claim.assertion.valueNumberOrigin === "SOURCE_SUPPLIED") {
    return { value: claim.assertion.valueNumber, basis: "SOURCE_SUPPLIED" };
  }
  const parsed = parseNumericLiteralEphemeral(claim.assertion.valueLiteral);
  if (parsed) return { value: parsed.value, basis: "ENGINE_PARSED_LITERAL" };
  return { value: null, basis: "NONE" };
}

/** True when a claim carries a numeric view the SOURCE itself supplied. */
export function hasSourceSuppliedNumericView(claim: NormalizedEvidenceClaim): boolean {
  return claim.assertion.valueNumber !== null && claim.assertion.valueNumberOrigin === "SOURCE_SUPPLIED";
}

// ---------------------------------------------------------------------------
// Immutability helpers
// ---------------------------------------------------------------------------

/** Fields that must never change between two generations of the same claim id. */
export function claimsAreIdentical(left: NormalizedEvidenceClaim, right: NormalizedEvidenceClaim): boolean {
  return JSON.stringify(canonicalClaimSnapshot(left)) === JSON.stringify(canonicalClaimSnapshot(right));
}

function canonicalClaimSnapshot(claim: NormalizedEvidenceClaim): unknown {
  return {
    claimId: claim.claimId,
    sourceArtifactId: claim.sourceArtifactId,
    artifactSha256: claim.artifactSha256,
    readingChannel: claim.readingChannel,
    subject: claim.subject,
    assertion: claim.assertion,
    context: claim.context,
    provenance: claim.provenance,
    document: claim.document,
    engine: claim.engine,
    status: claim.status,
    purpose: claim.purpose,
  };
}

/**
 * Detects an attempt to change an existing claim in place.
 *
 * History is never rewritten: a changed source byte creates a new artifact
 * hash, a changed materializer creates a new generation, and both remain
 * queryable side by side.
 */
export function detectClaimMutation(existing: NormalizedEvidenceClaim, incoming: NormalizedEvidenceClaim): { mutated: boolean; reason: string | null } {
  if (existing.claimId !== incoming.claimId) return { mutated: false, reason: null };
  if (claimFreezeHash(existing) === claimFreezeHash(incoming)) return { mutated: false, reason: null };
  return { mutated: true, reason: "an existing immutable claim was re-materialized with different content" };
}

/**
 * Content freeze hash.
 *
 * It exists so the mutation detector can compare content without attaching
 * behavior to a plain data record: a claim stays a snapshot, never an object
 * with mutating methods.
 */
export function claimFreezeHash(claim: NormalizedEvidenceClaim): string {
  return createHash("sha256")
    .update(
      [
        claim.assertion.valueLiteral,
        claim.assertion.valueNumber === null ? "" : String(claim.assertion.valueNumber),
        claim.assertion.unitLiteral ?? "",
        claim.provenance.locator,
        claim.subject.subjectMatchKey,
      ].join("\u0000"),
      "utf8",
    )
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Numeric-view guardrails
// ---------------------------------------------------------------------------

/**
 * Builds an assertion, refusing to persist a numeric view the source did not
 * supply.
 *
 * A caller that wants "24" recorded as a number is redirected to the literal:
 * the literal is what the source stated, and the engine parses it later,
 * ephemerally, if a comparison needs it.
 */
export function buildClaimAssertion(input: {
  predicate: ClaimPredicate;
  comparisonPolicy: string;
  valueLiteral: string;
  sourceSuppliedNumber?: number | null;
  unitLiteral?: string | null;
  unitDeclaration?: { declared: boolean; dimension: UnitDimension | null };
  quantityOrigin: QuantityOrigin | null;
}): ClaimAssertion {
  const supplied = input.sourceSuppliedNumber ?? null;
  if (input.quantityOrigin === null && supplied !== null) {
    throw new Error("a numeric view may only be persisted for a quantity claim whose origin is STATED or DECLARED_MODEL");
  }
  if (input.predicate !== "STATED_QUANTITY" && supplied !== null) {
    throw new Error("a numeric view may only be persisted on a STATED_QUANTITY claim");
  }
  return {
    predicate: input.predicate,
    comparisonPolicy: input.comparisonPolicy,
    valueLiteral: input.valueLiteral,
    valueNumber: supplied,
    valueNumberOrigin: supplied === null ? null : "SOURCE_SUPPLIED",
    unitLiteral: input.unitLiteral ?? null,
    unitDeclared: input.unitDeclaration?.declared ?? false,
    unitDimension: input.unitDeclaration?.dimension ?? null,
    quantityOrigin: input.quantityOrigin,
  };
}
