/**
 * Phase 2A-10: image-vision and drawing-vision materializers.
 *
 * They consume the ACCEPTED 2A-3 / 2A-4 / 2A-5 observation shapes and preserve:
 *
 * - the vision provider identity (carried as a source qualifier and a
 *   limitation, never dropped);
 * - the observation type, page number, and region/geometry box where relevant;
 * - the channel, so a drawing reading never merges with a native or OCR text
 *   reading;
 * - the provider's confidence when it supplied one, and its reliability;
 * - every provider limitation.
 *
 * Hard rules:
 * - drawing geometry is NOT an engineering quantity, and a printed scale is
 *   never applied;
 * - a symbol candidate is a candidate, never an equipment count;
 * - a dimension association stays observation/context evidence;
 * - no takeoff happens here, and no vision observation can become a
 *   `STATED_QUANTITY` claim.
 */

import {
  MATERIALIZER_VERSIONS,
  CROSS_DOCUMENT_BOUNDS,
  canonicalSubjectKey,
  compactSubjectKey,
  type ClaimPredicate,
  type ClaimReliability,
  type NormalizedEvidenceClaim,
  type ReadingChannel,
} from "@/src/domain/cross-document";
import type { ObservedFact, ObservationReliability } from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { buildClaim, declaredUnit, materializationSummary, sortClaims, type ClaimDraftInput } from "./ClaimBuilder";

export const IMAGE_VISION_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.IMAGE_VISION;
export const DRAWING_VISION_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.DRAWING_VISION;
export const DRAWING_STRUCTURED_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.DRAWING_STRUCTURED;

export type VisionMaterializationInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  createdAt: string;
  /** Visual observations only: a text observation must go through the PDF adapter. */
  observations: readonly ObservedFact[];
  providerIds: readonly string[];
  channel: Extract<ReadingChannel, "IMAGE_VISION" | "DRAWING_VISION" | "DRAWING_STRUCTURED">;
  limitations: readonly string[];
  truncated: boolean;
  /** 2A-5 geometry summary, carried as context only and never as a quantity. */
  geometrySummary: { regionCount: number; providerIds: string[] } | null;
  unavailable?: boolean;
};

const VISION_BASELINE_LIMITATIONS: readonly string[] = [
  "a visual reading is a bounded literal description from a vision provider; it is not transcribed text and not approved engineering data",
  "drawing geometry was not measured, no printed scale was applied, and no symbol candidate was counted as equipment",
];

const DRAWING_OBSERVATION_TYPES = new Set([
  "DRAWING_TITLE",
  "DRAWING_NUMBER",
  "SHEET_NUMBER",
  "REVISION",
  "DISCIPLINE",
  "PRINTED_SCALE",
  "DRAWING_TYPE",
  "PROJECT_NAME",
  "TITLE_BLOCK_PARTY",
  "LEGEND_ENTRY",
  "NOTE",
  "EQUIPMENT_REFERENCE",
  "ROOM_OR_ZONE",
  "DETAIL_REFERENCE",
  "SECTION_REFERENCE",
  "ELEVATION_REFERENCE",
  "SYMBOL_CANDIDATE",
]);

/** Mapping from an accepted visual/drawing observation type to a comparison predicate. */
export function predicateForVisualObservation(type: string): { predicate: ClaimPredicate; namespace: ClaimDraftInput["subjectKeyNamespace"] } {
  switch (type) {
    case "VISIBLE_BRAND":
      return { predicate: "BRAND", namespace: "TEXT_LABEL" };
    case "VISIBLE_MODEL_REFERENCE":
      return { predicate: "MODEL_REFERENCE", namespace: "TEXT_LABEL" };
    case "VISIBLE_PRODUCT":
    case "VISIBLE_OBJECT":
      return { predicate: "TYPE_NAME", namespace: "TEXT_LABEL" };
    case "EQUIPMENT_REFERENCE":
      return { predicate: "EQUIPMENT_TAG", namespace: "EQUIPMENT_TAG" };
    case "DRAWING_NUMBER":
    case "SHEET_NUMBER":
    case "DRAWING_TITLE":
    case "PROJECT_NAME":
      return { predicate: "DOCUMENT_IDENTITY", namespace: "DRAWING_SHEET" };
    case "REVISION":
      return { predicate: "REVISION_LABEL", namespace: "DOCUMENT_IDENTITY" };
    case "DISCIPLINE":
      return { predicate: "PROPERTY_VALUE", namespace: "DOCUMENT_IDENTITY" };
    case "NOTE":
      return { predicate: "DESCRIPTION_TEXT", namespace: "TEXT_LABEL" };
    default:
      // PRINTED_SCALE, DRAWING_TYPE, LEGEND_ENTRY, SYMBOL_CANDIDATE, geometry
      // regions, ROOM_OR_ZONE: context only, prohibited as a quantity.
      return { predicate: "PROPERTY_VALUE", namespace: "TEXT_LABEL" };
  }
}

/** Observation types whose evidence is explicitly prohibited as a quantity. */
export const DRAWING_QUANTITY_PROHIBITED_TYPES: readonly string[] = ["SYMBOL_CANDIDATE", "PRINTED_SCALE", "LEGEND_ENTRY", "DETAIL_REFERENCE", "SECTION_REFERENCE", "ELEVATION_REFERENCE"];

function reliabilityOf(value: ObservationReliability): ClaimReliability {
  return value;
}

export function materializeVisionClaims(input: VisionMaterializationInput): MaterializedArtifact {
  const limitations: string[] = [...VISION_BASELINE_LIMITATIONS, ...input.limitations];
  const truncationReasons: string[] = [];
  const byId = new Map<string, NormalizedEvidenceClaim>();
  let dropped = 0;

  const readingChannel = input.channel;
  const materializerVersion = readingChannel === "IMAGE_VISION"
    ? IMAGE_VISION_MATERIALIZER_VERSION
    : readingChannel === "DRAWING_VISION" ? DRAWING_VISION_MATERIALIZER_VERSION : DRAWING_STRUCTURED_MATERIALIZER_VERSION;

  if (!input.providerIds.length) {
    limitations.push("no vision provider identity was recorded, so the readings say only that a provider produced them");
  } else {
    limitations.push(`readings came from vision provider(s) ${input.providerIds.join(", ")}`);
  }
  if (input.truncated) {
    truncationReasons.push("the accepted visual inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted");
  }
  if (input.geometrySummary) {
    limitations.push(`${input.geometrySummary.regionCount} reported region box(es) were carried as visual context; no geometry was measured and no scale was applied`);
  }

  for (const observation of input.observations) {
    if (byId.size >= CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact) {
      dropped += 1;
      continue;
    }
    const mapping = predicateForVisualObservation(observation.type);
    const isDrawingType = DRAWING_OBSERVATION_TYPES.has(observation.type);
    const prohibitedAsQuantity = DRAWING_QUANTITY_PROHIBITED_TYPES.includes(observation.type);
    const keyValue = observation.value;
    const matchKey = mapping.namespace === "EQUIPMENT_TAG" ? compactSubjectKey(keyValue) : canonicalSubjectKey(keyValue);
    const claim = buildClaim({
      artifact: input.artifact,
      lineage: input.lineage,
      materializationId: input.materializationId,
      runId: input.runId,
      readingChannel,
      materializerVersion,
      coverage: input.truncated ? "PARTIAL" : "COMPLETE",
      createdAt: input.createdAt,
      subjectKeyNamespace: mapping.namespace,
      subjectKeyValue: keyValue,
      subjectMatchKey: matchKey,
      subjectKeyBasis: mapping.namespace === "EQUIPMENT_TAG" ? "SOURCE_IDENTIFIER" : "SOURCE_LABEL",
      subjectLabel: observation.value,
      predicate: mapping.predicate,
      valueLiteral: observation.value,
      unit: declaredUnit(null),
      quantityOrigin: null,
      locationKind: observation.visualOrigin ? "IMAGE_REGION" : null,
      locationValue: observation.evidence.locator,
      systemValue: null,
      sectionValue: null,
      qualifiers: [],
      sourceQualifiers: [
        "VISION_OBSERVATION",
        observation.type,
        ...(prohibitedAsQuantity ? ["PROHIBITED_AS_QUANTITY"] : []),
        ...(isDrawingType ? ["DRAWING_READING"] : ["IMAGE_READING"]),
      ],
      locator: observation.evidence.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: observation.type,
      rawRecordId: `${input.artifact.artifactId}:${observation.evidence.locator}:${observation.value}`.slice(0, 200),
      pageNumber: observation.pageNumber,
      reliability: reliabilityOf(observation.reliability),
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: observation.type === "REVISION" ? observation.value : null,
      revisionContext: observation.type === "REVISION" ? ("OBSERVED" as const) : undefined,
      limitations: [
        ...observation.limitations,
        ...(prohibitedAsQuantity ? ["this reading is prohibited as a quantity: it is a candidate or a printed scale, never a count, a measurement, or a takeoff"] : []),
        ...(observation.type === "PRINTED_SCALE" ? ["a printed scale was recorded as text and was never applied to any measured value"] : []),
        ...(observation.type === "SYMBOL_CANDIDATE" ? ["a symbol candidate is a candidate only; it was never counted as equipment"] : []),
      ],
    });
    byId.set(claim.claimId, claim);
  }

  if (dropped > 0) {
    truncationReasons.push(`only ${CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact} visual evidence records were materialized; the remainder exceeded the materialization bound`);
  }

  const claims = sortClaims([...byId.values()]);
  const summary = materializationSummary({ claims, truncated: input.truncated || dropped > 0, truncationReasons, warnings: [], limitations });
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId,
    materializerVersion,
    readingChannels: [readingChannel],
    coverage: input.unavailable ? "PARTIAL" : summary.coverage,
    claims,
    truncated: summary.truncated,
    truncationReasons: summary.truncationReasons,
    warnings: summary.warnings,
    limitations: summary.limitations,
    unavailable: input.unavailable ?? false,
  };
}
