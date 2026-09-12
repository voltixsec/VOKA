/**
 * Phase 2A-10: every bound, cap, alias table, and comparison policy in one
 * place.
 *
 * No magic number is inlined anywhere else in the phase. Every truncation this
 * phase can cause is declared here, and every configured bound is disclosed in
 * the materialization record and the run metadata so a reviewer can see what
 * was cut.
 *
 * The bounds are aligned with the accepted source-channel caps rather than
 * invented: 2A-1B observes at most 400 PDF observations, 2A-6 retains at most
 * 1,200 workbook lines, 2A-7 retains at most 1,500 DXF entities, and 2A-8
 * retains at most 1,500 IFC elements. A 2A-10 cap is never LARGER than the
 * accepted source cap when the source itself already truncates, because a
 * larger consumer cap would imply VOKA saw more than it did.
 */

import type { ClaimPredicate, UnitDimension, ReadingChannel } from "./EvidenceClaim";

// ---------------------------------------------------------------------------
// Engine and materializer versions
// ---------------------------------------------------------------------------

/** Version of the comparison engine. A change invalidates reproduced findings. */
export const CROSS_DOCUMENT_ENGINE_VERSION = "2a-10.engine.v1";
/** Version of the deterministic subject matcher. */
export const SUBJECT_MATCHER_VERSION = "2a-10.matcher.v1";
/** Version of the finding identity/signature projector. */
export const FINDING_PROJECTOR_VERSION = "2a-10.finding.v1";
/** Version of the document-identity resolver. */
export const DOCUMENT_IDENTITY_RESOLVER_VERSION = "2a-10.identity.v1";
/** Version of the active-revision governance model. */
export const ACTIVE_REVISION_GOVERNANCE_VERSION = "2a-10.revision.v1";

export const MATERIALIZER_VERSIONS = {
  PDF_NATIVE_TEXT: "2a-10.materializer.pdf-native.v1",
  PDF_OCR_TEXT: "2a-10.materializer.pdf-ocr.v1",
  IMAGE_VISION: "2a-10.materializer.image-vision.v1",
  DRAWING_VISION: "2a-10.materializer.drawing-vision.v1",
  DRAWING_STRUCTURED: "2a-10.materializer.drawing-structured.v1",
  WORKBOOK_STRUCTURED: "2a-10.materializer.workbook.v1",
  DXF_STRUCTURED: "2a-10.materializer.dxf.v1",
  IFC_MODEL: "2a-10.materializer.ifc.v1",
} as const satisfies Record<ReadingChannel, string>;

/**
 * Versions for the two coverage-only paths. They are not reading channels:
 * one records that a proprietary original is read through its governed derived
 * sibling, the other that retained bytes could not be verified at all.
 */
export const PROPRIETARY_ORIGINAL_MATERIALIZER_VERSION = "2a-10.materializer.proprietary-original.v1";
export const UNAVAILABLE_MATERIALIZER_VERSION = "2a-10.materializer.unavailable.v1";

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const CROSS_DOCUMENT_BOUNDS = {
  /** Claims retained per artifact materialization. Matches the accepted 2A-1B observation cap. */
  maxClaimsPerArtifact: 400,
  /** Claims retained per comparison scope across all artifacts. */
  maxClaimsPerScope: 20_000,
  /** Candidate claims considered per predicate bucket before pair generation. */
  maxCandidateClaimsPerBucket: 4_000,
  /** Ranked candidate pairs generated per predicate bucket. Never all-to-all. */
  maxCandidatePairsPerBucket: 8_000,
  /** Subject matches persisted per run. */
  maxSubjectMatches: 6_000,
  /** Corroborators retained on one subject match. */
  maxMatchCorroborators: 8,
  /** Blocker reasons retained on one subject match. */
  maxMatchBlockers: 8,
  /** Reasons retained on one subject match. */
  maxMatchReasons: 8,
  /** Findings persisted per run. */
  maxFindingsPerRun: 2_000,
  /** Participants retained on one finding. */
  maxParticipantsPerFinding: 8,
  /** Members retained on one subject cluster. */
  maxClusterMembers: 12,
  /** Claims linked to one governance decision. */
  maxDecisionEvidenceClaims: 64,
  /** Limitations retained on one claim. */
  maxClaimLimitations: 8,
  /** Limitations retained on one materialization. */
  maxMaterializationLimitations: 12,
  /** Source-specific qualifiers retained on one claim. */
  maxClaimSourceQualifiers: 8,
  /** Qualifiers retained on one claim context. */
  maxContextQualifiers: 6,
  /** Findings retained for one subject cluster before the rest is disclosed as truncated. */
  maxFindingsPerCluster: 8,
  /** Document identity evidence items retained. */
  maxIdentityEvidence: 12,
  /** Revision memberships retained for one document identity in a scope. */
  maxRevisionMembershipsPerIdentity: 64,
  /** Characters retained for any subject or evidence text on a claim. */
  maxClaimTextCharacters: 240,
  /** Characters retained for a locator. */
  maxLocatorCharacters: 240,
  /** Characters retained for a document family key component. */
  maxDocumentKeyCharacters: 120,
  /** Token similarity suggestions retained (T5), never promoted to a match. */
  maxSuggestionMatches: 500,
  /** Fraction of token overlap required for a T5 suggestion. Higher is stricter. */
  suggestionTokenOverlapThreshold: 0.85,
} as const;

// ---------------------------------------------------------------------------
// Comparison policies
// ---------------------------------------------------------------------------

/**
 * How a predicate may be compared. `MATCHING_ONLY` evidence never produces a
 * value finding; it only ever corroborates or vetoes a subject match.
 */
export const COMPARISON_POLICIES = [
  "STATED_VALUE_COMPARABLE",
  "MATCHING_ONLY",
  "CONTEXT_ONLY",
  "PROHIBITED_AS_QUANTITY",
  "DISCLOSURE_ONLY",
] as const;
export type ComparisonPolicy = (typeof COMPARISON_POLICIES)[number];

/**
 * Predicate → comparison policy. Explicit per predicate, never inferred.
 *
 * Commercial predicates (rate, amount, currency) are deliberately absent from
 * the predicate vocabulary entirely, so no policy can enable them.
 */
export const PREDICATE_COMPARISON_POLICY: Record<ClaimPredicate, ComparisonPolicy> = {
  STATED_QUANTITY: "STATED_VALUE_COMPARABLE",
  UNIT_DECLARATION: "DISCLOSURE_ONLY",
  MANUFACTURER: "STATED_VALUE_COMPARABLE",
  BRAND: "STATED_VALUE_COMPARABLE",
  MODEL_REFERENCE: "STATED_VALUE_COMPARABLE",
  CLASSIFICATION_CODE: "STATED_VALUE_COMPARABLE",
  TYPE_NAME: "STATED_VALUE_COMPARABLE",
  EQUIPMENT_TAG: "MATCHING_ONLY",
  IDENTITY_TAG: "MATCHING_ONLY",
  RATING: "STATED_VALUE_COMPARABLE",
  MATERIAL: "STATED_VALUE_COMPARABLE",
  LOCATION: "STATED_VALUE_COMPARABLE",
  SYSTEM_ASSIGNMENT: "STATED_VALUE_COMPARABLE",
  REVISION_LABEL: "DISCLOSURE_ONLY",
  ITEM_NUMBER: "MATCHING_ONLY",
  SECTION_OR_DIVISION: "CONTEXT_ONLY",
  DOCUMENT_IDENTITY: "CONTEXT_ONLY",
  PROPERTY_VALUE: "STATED_VALUE_COMPARABLE",
  DESCRIPTION_TEXT: "CONTEXT_ONLY",
};

/** Predicates that may carry a stated quantity and therefore a quantity origin. */
export const QUANTITY_BEARING_PREDICATES: readonly ClaimPredicate[] = ["STATED_QUANTITY"];

// ---------------------------------------------------------------------------
// Unit synonyms and dimensions. Closed, explicit, unambiguous only.
// ---------------------------------------------------------------------------

/**
 * Verbatim unit spellings recognized as the SAME unit.
 *
 * Only spellings that cannot mean anything else are grouped. Anything outside
 * this table remains "not proven equivalent" and blocks a numeric comparison
 * instead of being guessed at.
 */
export const UNIT_SYNONYM_GROUPS: ReadonlyArray<{ canonical: string; dimension: UnitDimension; aliases: readonly string[] }> = [
  { canonical: "nos", dimension: "COUNT", aliases: ["no", "no.", "nos", "nos.", "each", "ea", "ea.", "pcs", "pc", "piece", "pieces", "unit", "units", "عدد", "حبة"] },
  { canonical: "set", dimension: "COUNT", aliases: ["set", "sets", "st", "مجموعة", "طقم"] },
  { canonical: "lot", dimension: "COUNT", aliases: ["lot", "lots", "ls", "l.s", "مقطوعية"] },
  { canonical: "m", dimension: "LENGTH", aliases: ["m", "m.", "meter", "meters", "metre", "metres", "lm", "r.m", "rm", "م", "متر", "متر طولي"] },
  { canonical: "m2", dimension: "AREA", aliases: ["m2", "m²", "sqm", "sq.m", "sq m", "square meter", "square meters", "square metre", "square metres", "م2", "م²", "متر مربع"] },
  { canonical: "m3", dimension: "VOLUME", aliases: ["m3", "m³", "cum", "cu.m", "cu m", "cubic meter", "cubic meters", "cubic metre", "cubic metres", "م3", "م³", "متر مكعب"] },
  { canonical: "kg", dimension: "MASS", aliases: ["kg", "kgs", "kilogram", "kilograms", "كجم", "كيلوغرام"] },
  { canonical: "ton", dimension: "MASS", aliases: ["ton", "tons", "tonne", "tonnes", "mt", "طن"] },
  { canonical: "l", dimension: "VOLUME", aliases: ["l", "lt", "ltr", "liter", "liters", "litre", "litres", "لتر"] },
  { canonical: "kW", dimension: "POWER", aliases: ["kw", "kilowatt", "kilowatts", "كيلوواط"] },
  { canonical: "hp", dimension: "POWER", aliases: ["hp", "horsepower", "حصان"] },
  { canonical: "hr", dimension: "TIME", aliases: ["hr", "hrs", "hour", "hours", "ساعة", "ساعات"] },
  { canonical: "bar", dimension: "PRESSURE", aliases: ["bar", "bars", "بار"] },
  { canonical: "c", dimension: "TEMPERATURE", aliases: ["c", "°c", "degc", "celsius"] },
  { canonical: "lps", dimension: "FLOW", aliases: ["lps", "l/s", "litre per second", "liter per second"] },
  { canonical: "cfm", dimension: "FLOW", aliases: ["cfm"] },
  { canonical: "gpm", dimension: "FLOW", aliases: ["gpm"] },
];

/** Rolled-up lookup, built once from the closed table above. */
const UNIT_LOOKUP: ReadonlyMap<string, { canonical: string; dimension: UnitDimension }> = (() => {
  const lookup = new Map<string, { canonical: string; dimension: UnitDimension }>();
  for (const group of UNIT_SYNONYM_GROUPS) {
    for (const alias of group.aliases) {
      lookup.set(normalizeUnitToken(alias), { canonical: group.canonical, dimension: group.dimension });
    }
  }
  return lookup;
})();

/** Case-folds, strips a trailing period, and collapses internal whitespace. Never transliterates. */
export function normalizeUnitToken(raw: string): string {
  return raw
    .replace(/[\u0640]/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\.$/u, "")
    .replace(/\s+/gu, " ");
}

/**
 * Resolves a verbatim unit through the closed synonym table.
 *
 * `null` means VOKA could not prove the unit means anything known. It is never
 * quietly treated as a match for another unit, and no unit conversion exists
 * anywhere in this phase.
 */
export function resolveUnit(raw: string | null | undefined): { canonical: string; dimension: UnitDimension } | null {
  if (!raw) return null;
  return UNIT_LOOKUP.get(normalizeUnitToken(raw)) ?? null;
}

/**
 * A format-level or document-level coordinate unit is NOT a subject quantity
 * unit. DXF `$INSUNITS` and the IFC project unit assignment live here so they
 * can be carried as document context and can never be joined to a claim's
 * quantity.
 */
export const DOCUMENT_LEVEL_UNIT_SOURCES: readonly string[] = ["DXF_$INSUNITS", "IFC_PROJECT_UNIT_ASSIGNMENT"];

// ---------------------------------------------------------------------------
// Bounded property aliases
// ---------------------------------------------------------------------------

/**
 * A small, explicit, bounded alias table that publishes KNOWN property names
 * into comparison predicates.
 *
 * Requirements honored here:
 * - exact bounded aliases only; no fuzzy or semantic promotion;
 * - bilingual aliases are supported;
 * - ambiguity stays ambiguity: a name that maps to more than one predicate is
 *   refused rather than guessed;
 * - everything not listed stays `PROPERTY_VALUE` context;
 * - `Manufacturer` is never `Supplier`, and `ModelReference` is never a
 *   product selection.
 */
export const PROPERTY_ALIASES: ReadonlyArray<{ predicate: ClaimPredicate; aliases: readonly string[] }> = [
  { predicate: "MANUFACTURER", aliases: ["manufacturer", "manufacturer name", "mfr", "maker", "الصانع", "الشركة المصنعة", "المصنّع"] },
  { predicate: "BRAND", aliases: ["brand", "make", "trade name", "الماركة", "العلامة التجارية"] },
  { predicate: "MODEL_REFERENCE", aliases: ["model", "model no", "model no.", "model number", "modelreference", "model reference", "reference", "ref", "ref no", "catalogue no", "catalog no", "part no", "الطراز", "الموديل", "المرجع"] },
  { predicate: "RATING", aliases: ["rating", "rated", "power rating", "السعة", "التصنيف"] },
  { predicate: "MATERIAL", aliases: ["material", "المادة", "الخامة"] },
  { predicate: "CLASSIFICATION_CODE", aliases: ["classification", "classification code", "classificationcode", "unspsc", "uniclass", "masterformat", "التصنيف", "رمز التصنيف"] },
  { predicate: "TYPE_NAME", aliases: ["type", "type name", "typename", "objecttype", "object type", "النوع"] },
];

const PROPERTY_ALIAS_LOOKUP: ReadonlyMap<string, ClaimPredicate | "AMBIGUOUS"> = (() => {
  const lookup = new Map<string, ClaimPredicate | "AMBIGUOUS">();
  for (const entry of PROPERTY_ALIASES) {
    for (const alias of entry.aliases) {
      const key = normalizePropertyName(alias);
      const existing = lookup.get(key);
      if (existing && existing !== entry.predicate) lookup.set(key, "AMBIGUOUS");
      else lookup.set(key, entry.predicate);
    }
  }
  return lookup;
})();

/** Case-folds, strips punctuation and spaces, and removes Arabic tatweel. */
export function normalizePropertyName(raw: string): string {
  return raw
    .replace(/[\u0640]/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s._-]+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Resolves an IFC/workbook property name to a predicate.
 *
 * `PROPERTY_VALUE` is the correct, honest answer for anything not in the small
 * table; `"AMBIGUOUS"` is returned when the table itself cannot decide, and the
 * caller must keep the record as `PROPERTY_VALUE` context.
 */
export function resolvePropertyPredicate(name: string): ClaimPredicate | "AMBIGUOUS" {
  const resolved = PROPERTY_ALIAS_LOOKUP.get(normalizePropertyName(name));
  if (!resolved) return "PROPERTY_VALUE";
  return resolved;
}

// ---------------------------------------------------------------------------
// Revision policy
// ---------------------------------------------------------------------------

export const REVISION_POLICIES = ["ACTIVE_ONLY", "INCLUDE_SUPERSEDED", "SPECIFIC_REVISIONS"] as const;
export type RevisionPolicy = (typeof REVISION_POLICIES)[number];

/**
 * The default is ACTIVE_ONLY: a superseded revision must never be compared as
 * though it were current. Historical comparison stays available, but only when
 * a reviewer asks for it explicitly.
 */
export const DEFAULT_REVISION_POLICY: RevisionPolicy = "ACTIVE_ONLY";

// ---------------------------------------------------------------------------
// Finding enablement
// ---------------------------------------------------------------------------

/**
 * `DESCRIPTION_MISMATCH` is the only finding family that ships OFF.
 *
 * Similar wording is not a discrepancy until a governed policy says it is, and
 * a deterministic policy that enables it must be explicit — never implied by a
 * similarity score.
 */
export const DISABLED_FINDING_KINDS_DEFAULT: readonly string[] = ["DESCRIPTION_MISMATCH"];

// ---------------------------------------------------------------------------
// Comparison scope class
// ---------------------------------------------------------------------------

/** The scope class 2A-10 serves. Role filters never change findings, only navigation. */
export const COMPARISON_SCOPE_CLASS = "CROSS_DOCUMENT_CONSISTENCY" as const;

/** Lineage collapse is always on and is not configurable. */
export const LINEAGE_COLLAPSE_ALWAYS_ON = true as const;
