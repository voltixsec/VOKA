/**
 * Phase 2A-10: shared claim-construction helpers for the source-channel
 * materializers.
 *
 * The helpers exist so every adapter makes the SAME four decisions the phase
 * requires and none of them can drift:
 *
 * 1. bounds and truncation are applied here, centrally;
 * 2. a verbatim source literal is never rewritten, and a numeric view is only
 *    persisted when the accepted source model supplied one;
 * 3. locators come from the accepted source grammar and are never re-invented;
 * 4. limitations from the source channel are propagated, never merged into
 *    another channel's wording.
 */

import {
  CLAIM_STATUS,
  CLAIM_PURPOSE,
  CLAIM_COMPARISON_SCOPE,
  buildClaimId,
  type ClaimAssertion,
  type ClaimPredicate,
  type ClaimReliability,
  type EvidenceCoverage,
  type LineageRole,
  type NormalizedEvidenceClaim,
  type QuantityOrigin,
  type ReadingChannel,
  type RevisionContext,
  type SubjectKeyBasis,
  type SubjectKeyNamespace,
  type UnitDimension,
} from "@/src/domain/cross-document";
import {
  CROSS_DOCUMENT_BOUNDS,
  CROSS_DOCUMENT_ENGINE_VERSION,
  PREDICATE_COMPARISON_POLICY,
  resolveUnit,
} from "@/src/domain/cross-document";
import type { ArtifactLineageContext, SourceArtifactRef } from "../ports";

/** Bounded verbatim text: a source literal is clipped only when it exceeds the cap, and the clip is disclosed. */
export function boundText(value: string, max = CROSS_DOCUMENT_BOUNDS.maxClaimTextCharacters): { text: string; clipped: boolean } {
  const trimmed = value.trim();
  if (trimmed.length <= max) return { text: trimmed, clipped: false };
  return { text: `${trimmed.slice(0, max)}…`, clipped: true };
}

/** Bounded, de-duplicated, order-preserving limitation list. */
export function boundList(values: readonly string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

/** Unit evidence derived ONLY from an explicit unit declaration plus the closed synonym table. */
export type DeclaredUnit = {
  unitLiteral: string | null;
  unitDeclared: boolean;
  unitDimension: UnitDimension | null;
};

/**
 * Resolves a declared unit through the closed synonym table.
 *
 * A unit outside the table keeps `unitDeclared: true` (the source DID declare a
 * unit) with `unitDimension: null` (VOKA cannot say what dimension it is). No
 * conversion, no inference, and no document-level fallback ever happens here.
 */
export function declaredUnit(unitLiteral: string | null | undefined): DeclaredUnit {
  const trimmed = unitLiteral?.trim() ?? "";
  if (!trimmed) return { unitLiteral: null, unitDeclared: false, unitDimension: null };
  const resolved = resolveUnit(trimmed);
  return {
    unitLiteral: trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed,
    unitDeclared: true,
    unitDimension: resolved?.dimension ?? null,
  };
}

export type ClaimDraftInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  readingChannel: ReadingChannel;
  materializerVersion: string;
  coverage: EvidenceCoverage;
  createdAt: string;
  predicate: ClaimPredicate;
  subjectKeyNamespace: SubjectKeyNamespace;
  subjectKeyValue: string;
  subjectMatchKey: string;
  subjectKeyBasis: SubjectKeyBasis;
  subjectLabel?: string | null;
  valueLiteral: string;
  /** ONLY when the accepted source model supplied a numeric representation. */
  sourceSuppliedNumber?: number | null;
  unit?: DeclaredUnit | null;
  quantityOrigin: QuantityOrigin | null;
  locationKind?: string | null;
  locationValue?: string | null;
  systemValue?: string | null;
  sectionValue?: string | null;
  qualifiers?: readonly string[];
  sourceQualifiers?: readonly string[];
  locator: string;
  humanLocator?: string | null;
  pageNumber: number | null;
  citationId?: string | null;
  rawRecordKind?: string | null;
  rawRecordId?: string | null;
  reliability: ClaimReliability;
  confidence?: number | null;
  limitations?: readonly string[];
  evidenceDocumentFamilyKey?: string | null;
  observedRevisionLabel?: string | null;
  revisionContext?: RevisionContext;
};

/**
 * Builds one immutable claim.
 *
 * Refuses to invent a numeric view for a non-quantity predicate and refuses to
 * carry a quantity origin on a predicate that cannot bear one, so a caller
 * cannot accidentally promote a literal into source numeric truth.
 */
export function buildClaim(input: ClaimDraftInput): NormalizedEvidenceClaim {
  const value = boundText(input.valueLiteral);
  const limitations = boundList(
    [
      ...(input.limitations ?? []),
      ...(value.clipped ? [`the recorded source literal was clipped to ${CROSS_DOCUMENT_BOUNDS.maxClaimTextCharacters} characters`] : []),
      ...(input.lineage.derivation ? input.lineage.derivation.fidelityLimitations : []),
    ],
    CROSS_DOCUMENT_BOUNDS.maxClaimLimitations,
  );

  const supplied = input.sourceSuppliedNumber ?? null;
  if (supplied !== null && input.predicate !== "STATED_QUANTITY") {
    throw new Error("a numeric view may only be persisted on a STATED_QUANTITY claim");
  }
  if (supplied !== null && input.quantityOrigin === null) {
    throw new Error("a numeric view may only be persisted on a claim with a quantity origin");
  }

  const assertion: ClaimAssertion = {
    predicate: input.predicate,
    comparisonPolicy: PREDICATE_COMPARISON_POLICY[input.predicate],
    valueLiteral: value.text,
    valueNumber: supplied,
    valueNumberOrigin: supplied === null ? null : "SOURCE_SUPPLIED",
    unitLiteral: input.unit?.unitLiteral ?? null,
    unitDeclared: input.unit?.unitDeclared ?? false,
    unitDimension: input.unit?.unitDimension ?? null,
    quantityOrigin: input.quantityOrigin,
  };

  const subjectValue = boundText(input.subjectKeyValue);
  const claimId = buildClaimId({
    companyId: input.artifact.companyId,
    sourceArtifactId: input.artifact.artifactId,
    artifactSha256: input.artifact.contentSha256,
    readingChannel: input.readingChannel,
    predicate: input.predicate,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectMatchKey: input.subjectMatchKey,
    locator: input.locator,
    valueLiteral: value.text,
    valueNumber: supplied,
    materializerVersion: input.materializerVersion,
  });

  return {
    claimId,
    companyId: input.artifact.companyId,
    materializationId: input.materializationId,
    materializedByRunId: input.runId,
    sourceArtifactId: input.artifact.artifactId,
    artifactSha256: input.artifact.contentSha256,
    sourceKind: input.artifact.kind as NormalizedEvidenceClaim["sourceKind"],
    readingChannel: input.readingChannel,
    subject: {
      subjectKeyNamespace: input.subjectKeyNamespace,
      subjectKeyValue: subjectValue.text,
      subjectMatchKey: input.subjectMatchKey,
      subjectKeyBasis: input.subjectKeyBasis,
      subjectLabel: input.subjectLabel ? boundText(input.subjectLabel).text : null,
    },
    assertion,
    context: {
      locationKind: input.locationKind ?? null,
      locationValue: input.locationValue ?? null,
      systemValue: input.systemValue ?? null,
      sectionValue: input.sectionValue ?? null,
      qualifiers: boundList(input.qualifiers ?? [], CROSS_DOCUMENT_BOUNDS.maxContextQualifiers),
      sourceCoverage: input.coverage,
      sourceQualifiers: boundList(input.sourceQualifiers ?? [], CROSS_DOCUMENT_BOUNDS.maxClaimSourceQualifiers),
    },
    provenance: {
      locator: boundText(input.locator, CROSS_DOCUMENT_BOUNDS.maxLocatorCharacters).text,
      humanLocator: input.humanLocator && input.humanLocator !== input.locator ? boundText(input.humanLocator, CROSS_DOCUMENT_BOUNDS.maxLocatorCharacters).text : null,
      pageNumber: input.pageNumber,
      citationId: input.citationId ?? null,
      rawRecordKind: input.rawRecordKind ?? null,
      rawRecordId: input.rawRecordId ?? null,
      reliability: input.reliability,
      confidence: input.confidence ?? null,
      limitations,
    },
    document: {
      evidenceDocumentFamilyKey: input.evidenceDocumentFamilyKey ?? null,
      observedRevisionLabel: input.observedRevisionLabel ?? null,
      revisionContext: input.revisionContext ?? "UNDETERMINED",
    },
    derivation: {
      derivationFamilyRootArtifactId: input.lineage.derivationFamilyRootArtifactId,
      lineageRole: input.lineage.lineageRole as LineageRole,
      derivationId: input.lineage.derivation?.derivationId ?? null,
      sourceFormat: input.lineage.derivation?.sourceFormat ?? null,
      derivedFormat: input.lineage.derivation?.derivedFormat ?? null,
      derivationMethod: input.lineage.derivation?.derivationMethod ?? null,
      converterId: input.lineage.derivation?.converterId ?? null,
      converterVersion: input.lineage.derivation?.converterVersion ?? null,
      fidelityLimitations: [...(input.lineage.derivation?.fidelityLimitations ?? [])],
    },
    engine: {
      materializerVersion: input.materializerVersion,
      engineVersion: CROSS_DOCUMENT_ENGINE_VERSION,
      comparisonScope: CLAIM_COMPARISON_SCOPE,
      createdAt: input.createdAt,
    },
    status: CLAIM_STATUS,
    purpose: CLAIM_PURPOSE,
  };
}

/** Deterministic materialization identity plus its coverage record values. */
export function materializationSummary(input: {
  claims: readonly NormalizedEvidenceClaim[];
  truncated: boolean;
  truncationReasons: readonly string[];
  warnings: readonly string[];
  limitations: readonly string[];
}): { coverage: EvidenceCoverage; truncated: boolean; truncationReasons: string[]; warnings: string[]; limitations: string[] } {
  const truncated = input.truncated || input.truncationReasons.length > 0;
  return {
    coverage: truncated ? "PARTIAL" : "COMPLETE",
    truncated,
    truncationReasons: boundList([...input.truncationReasons], CROSS_DOCUMENT_BOUNDS.maxMaterializationLimitations),
    warnings: boundList([...input.warnings], 10),
    limitations: boundList([...input.limitations], CROSS_DOCUMENT_BOUNDS.maxMaterializationLimitations),
  };
}

/** Deterministic ordering so a materialization is byte-identical across runs. */
export function sortClaims(claims: readonly NormalizedEvidenceClaim[]): NormalizedEvidenceClaim[] {
  return [...claims].sort((left, right) => (left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0));
}
