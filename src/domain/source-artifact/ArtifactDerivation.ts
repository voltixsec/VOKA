/**
 * Phase 2A-9: the pure domain model for governed proprietary artifact
 * derivation.
 *
 * A proprietary original (DWG drawing, Revit RVT model) is never mutated into
 * another format. Instead an explicit, recorded `ArtifactDerivation` links the
 * immutable original to a separate derived artifact (DXF or IFC) that the
 * accepted 2A-7 / 2A-8 intelligence inspects.
 *
 * Two methods exist and they must never be confused:
 *
 * - `AUTOMATED_CONVERSION`: a ConversionProvider converted the bytes inside
 *   VOKA. The converter id and version are recorded;
 * - `USER_PROVIDED_EXPORT`: the user exported the derived file themselves (for
 *   example from AutoCAD or Revit) and explicitly linked it to the original.
 *   VOKA never claims it converted anything, and no converter identity is
 *   fabricated for it.
 *
 * This module is pure: no Prisma, no HTTP, no provider libraries, no I/O.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Identity of the deterministic conversion provider used in tests. It never claims a real conversion and is never a production fallback. */
export const DETERMINISTIC_CONVERSION_PROVIDER_ID = "deterministic-conversion-test-double";

/** Identity reported when no conversion provider exists in the runtime. */
export const UNAVAILABLE_CONVERSION_PROVIDER_ID = "conversion-unavailable";

export const ARTIFACT_DERIVATION_KINDS = ["DWG_TO_DXF", "RVT_TO_IFC"] as const;
export type ArtifactDerivationKind = (typeof ARTIFACT_DERIVATION_KINDS)[number];

export const ARTIFACT_DERIVATION_METHODS = ["AUTOMATED_CONVERSION", "USER_PROVIDED_EXPORT"] as const;
export type ArtifactDerivationMethod = (typeof ARTIFACT_DERIVATION_METHODS)[number];

export const ARTIFACT_DERIVATION_STATUSES = [
  "PENDING",
  "RUNNING",
  "AWAITING_USER_EXPORT",
  "SUCCEEDED",
  "FAILED",
  "NOT_CONFIGURED",
  "REJECTED",
] as const;
export type ArtifactDerivationStatus = (typeof ARTIFACT_DERIVATION_STATUSES)[number];

/** Derivation statuses that are final and must never be retried automatically. */
export const TERMINAL_DERIVATION_STATUSES: readonly ArtifactDerivationStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "NOT_CONFIGURED",
  "REJECTED",
];

export function isTerminalDerivationStatus(status: ArtifactDerivationStatus): boolean {
  return TERMINAL_DERIVATION_STATUSES.includes(status);
}

/** The proprietary format a derivation kind starts from. */
export function sourceFormatForKind(kind: ArtifactDerivationKind): "DWG" | "RVT" {
  return kind === "DWG_TO_DXF" ? "DWG" : "RVT";
}

/** The derived format a derivation kind produces. */
export function derivedFormatForKind(kind: ArtifactDerivationKind): "DXF" | "IFC" {
  return kind === "DWG_TO_DXF" ? "DXF" : "IFC";
}

/** The derivation kind for a proprietary original kind, or null for others. */
export function derivationKindForOriginalKind(kind: "DWG" | "RVT"): ArtifactDerivationKind {
  return kind === "DWG" ? "DWG_TO_DXF" : "RVT_TO_IFC";
}

/** The valid original/derived artifact kind pair for a derivation kind. */
export function validArtifactKindPair(kind: ArtifactDerivationKind): { original: "DWG" | "RVT"; derived: "DXF" | "IFC" } {
  return { original: sourceFormatForKind(kind), derived: derivedFormatForKind(kind) };
}

/**
 * Resolves the derivation kind for an explicit original/derived artifact-kind
 * pair, or null when the pair is not one of the two governed combinations
 * (DWG→DXF, RVT→IFC). Any other pairing — DWG→IFC, RVT→DXF, PDF→anything — is
 * rejected by the caller instead of being forced into a kind.
 */
export function derivationKindForPair(originalKind: string, derivedKind: string): ArtifactDerivationKind | null {
  if (originalKind === "DWG" && derivedKind === "DXF") return "DWG_TO_DXF";
  if (originalKind === "RVT" && derivedKind === "IFC") return "RVT_TO_IFC";
  return null;
}

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

/** Bounded persisted lineage record for one derivation. */
export type ArtifactDerivationRecord = {
  id: string;
  companyId: string;
  originalArtifactId: string;
  /** Set only once a derived artifact actually exists. */
  derivedArtifactId: string | null;
  derivationKind: ArtifactDerivationKind;
  derivationMethod: ArtifactDerivationMethod;
  /** Converter identity for automated conversions; always null for user exports. */
  converterId: string | null;
  converterVersion: string | null;
  /** Deterministic canonical fingerprint of the conversion options. */
  optionsFingerprint: string;
  sourceFormat: "DWG" | "RVT";
  derivedFormat: "DXF" | "IFC";
  sourceHash: string;
  derivedHash: string | null;
  status: ArtifactDerivationStatus;
  failureReason: string | null;
  /** Provider/converter warnings — channel A. Never merged with VOKA limitations. */
  warnings: string[];
  /** VOKA-authored static fidelity limitations — channel B. Never merged with warnings. */
  fidelityLimitations: string[];
  derivationKey: string;
  createdAt: Date;
  completedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Options canonicalization and idempotency keys
// ---------------------------------------------------------------------------

/** Conversion options this phase accepts: flat, bounded, JSON-representable. */
export type DerivationOptions = Record<string, string | number | boolean | null>;

export const MAX_DERIVATION_OPTIONS = 16;

/**
 * Canonicalizes conversion options deterministically.
 *
 * Object insertion order must never change the fingerprint: keys are sorted,
 * values are rendered with JSON semantics, and null is kept distinct from
 * "absent". Arrays keep their order (an array order is itself an option).
 */
export function canonicalOptionsFingerprint(options: DerivationOptions | null | undefined): string {
  if (!options) return JSON.stringify({});
  const keys = Object.keys(options).filter((key) => options[key] !== undefined).sort();
  const canonical: Record<string, string | number | boolean | null> = {};
  for (const key of keys) canonical[key] = options[key]!;
  return JSON.stringify(canonical);
}

export type AutomatedDerivationKeyInput = {
  derivationKind: ArtifactDerivationKind;
  sourceHash: string;
  converterId: string;
  converterVersion: string;
  options?: DerivationOptions | null;
};

export type UserProvidedDerivationKeyInput = {
  derivationKind: ArtifactDerivationKind;
  sourceHash: string;
  derivedHash: string;
};

export const DERIVATION_KEY_VERSION = "v1";

/**
 * Deterministic idempotency key for an automated derivation.
 *
 * Same source bytes + same kind + same converter id/version + same canonical
 * options → same key, so the same conversion is never duplicated. A new
 * converter version or a changed option produces a new key, and historical
 * derivations are never overwritten.
 */
export function automatedDerivationKey(input: AutomatedDerivationKeyInput): string {
  const canonical = [
    `derivation:${DERIVATION_KEY_VERSION}`,
    input.derivationKind,
    "AUTOMATED_CONVERSION",
    input.sourceHash.toLowerCase(),
    input.converterId,
    input.converterVersion,
    canonicalOptionsFingerprint(input.options),
  ].join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Deterministic idempotency key for a user-provided export derivation.
 *
 * The same explicit source/derived pair is always the same derivation, so
 * re-linking is idempotent. No converter identity participates: a user export
 * has none, and fabricating one would be a lie.
 */
export function userProvidedDerivationKey(input: UserProvidedDerivationKeyInput): string {
  const canonical = [
    `derivation:${DERIVATION_KEY_VERSION}`,
    input.derivationKind,
    "USER_PROVIDED_EXPORT",
    input.sourceHash.toLowerCase(),
    input.derivedHash.toLowerCase(),
  ].join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Static VOKA fidelity limitations (channel B)
// ---------------------------------------------------------------------------

/** Bounds for the two separate evidence channels a derivation record carries. */
export const MAX_DERIVATION_WARNINGS = 10;
export const MAX_DERIVATION_FIDELITY_LIMITATIONS = 12;

/**
 * Static, conservative fidelity limitations VOKA states about every automated
 * DWG→DXF conversion, regardless of provider.
 *
 * A converter reporting success does not mean a lossless conversion. These are
 * VOKA-authored boundary statements (channel B): they are never merged with
 * provider warnings (channel A), and they never claim universal preservation.
 */
export const DWG_TO_DXF_FIDELITY_LIMITATIONS: readonly string[] = [
  "proprietary DWG object metadata may not survive conversion to DXF; the derived DXF is not certified as a complete representation of the original drawing",
  "custom objects and vertical-application enablers stored in the DWG are frequently replaced by proxy graphics or dropped entirely",
  "extended data (XDATA) attached to entities may be truncated or dropped by the conversion",
  "layout and paper-space sheet interpretation can differ from AutoCAD's own rendering of the same drawing",
  "external references (XREFs) were not opened or resolved; the conversion sees only the host file, so XREF-dependent content may be absent",
];

/**
 * Static, conservative fidelity limitations VOKA states about every automated
 * RVT→IFC conversion, regardless of provider.
 */
export const RVT_TO_IFC_FIDELITY_LIMITATIONS: readonly string[] = [
  "Revit-specific parameters have no direct IFC equivalent and may be renamed, restructured, or dropped",
  "Revit category and family/type mapping depends on the export configuration; IFC entity classes may differ from the Revit categories they came from",
  "MEP connectivity and system topology are not guaranteed to survive as IFC flow relationships",
  "views, sheets, and 2D annotation are exported only when the export configuration includes them and may be absent",
  "base quantities appear in the derived IFC only when the export explicitly produced them; their absence is not evidence they do not exist in the model",
  "stable element identity between the original model and the derived IFC depends on the source application's export behavior and is not guaranteed",
];

/** The bounded static limitations for a derivation kind. */
export function derivationFidelityLimitations(kind: ArtifactDerivationKind): readonly string[] {
  return kind === "DWG_TO_DXF" ? DWG_TO_DXF_FIDELITY_LIMITATIONS : RVT_TO_IFC_FIDELITY_LIMITATIONS;
}
