/**
 * Phase 2A-10: DXF / structured CAD materializer.
 *
 * It consumes the ACCEPTED 2A-7 `DxfAnalysis` shape and explicitly decides:
 *
 * - claims come from exact DXF records: text, attribute tag/value, block
 *   inserts, and dimension declarations;
 * - a handle is preserved verbatim when present, and NO handle is invented
 *   when the record carries none;
 * - the exact DXF locator grammar is preserved and never re-invented;
 * - model space and paper space stay apart, with the accepted space
 *   attribution carried on the claim;
 * - declared drawing units (`$INSUNITS`) are DOCUMENT CONTEXT ONLY: they are
 *   published as a context claim and can never become a subject quantity unit;
 * - these are NEVER engineering quantities: `entityCount`,
 *   `entityRecordsRetained`, `entityTypeCounts`, `insertCount`,
 *   `containedEntityCount`, `observedEntityCount`, `corroborationCount`,
 *   `textCount`, `dimensionCount`, geometry primitive counts, and symbol
 *   counts produce ZERO quantity claims;
 * - a DXF dimension measurement stays a DRAWING-DECLARED dimension and is
 *   marked prohibited as a quantity: it is not a takeoff quantity.
 */

import {
  MATERIALIZER_VERSIONS,
  CROSS_DOCUMENT_BOUNDS,
  canonicalSubjectKey,
  type ClaimPredicate,
  type ClaimReliability,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import {
  DXF_BASELINE_LIMITATION,
  DXF_PAGE_NUMBER,
  type ObservationReliability,
  type DxfAnalysis,
  type DxfAttributeEvidence,
  type DxfDimensionEvidence,
  type DxfEntityEvidence,
  type DxfTextEvidence,
} from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { buildClaim, declaredUnit, materializationSummary, sortClaims, type ClaimDraftInput } from "./ClaimBuilder";

export const DXF_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.DXF_STRUCTURED;

export type DxfMaterializationInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  createdAt: string;
  analysis: DxfAnalysis;
  unavailable?: boolean;
};

const DXF_LIMITATIONS: readonly string[] = [
  DXF_BASELINE_LIMITATION,
  "drawing entity, insert, symbol, and text counts are ingestion metrics only and never became comparison claims",
  "a DXF dimension measurement is drawing-declared dimension evidence; it is never an equipment or material takeoff quantity",
];

/** Every DXF ingestion metric that is explicitly refused as evidence. */
export const DXF_REFUSED_INGESTION_METRICS: readonly string[] = [
  "entityCount",
  "entityRecordsRetained",
  "entityTypeCounts",
  "insertCount",
  "containedEntityCount",
  "observedEntityCount",
  "corroborationCount",
  "textCount",
  "dimensionCount",
  "vertexCount",
];

function reliabilityOf(value: ObservationReliability): ClaimReliability {
  return value;
}

/**
 * Subject for a drawing record.
 *
 * A drawing record identifies itself by its own locator, and — when it belongs
 * to a block insert — by that insert's block name plus handle. That is
 * deterministic: no layer name is used as identity (a layer is shared
 * infrastructure), and no system or location is used as identity either.
 */
function drawingSubject(entity: { locator: string; blockName: string | null; handle: string | null; insertionPoint?: unknown }): { keyValue: string; matchKey: string; label: string | null } {
  if (entity.blockName) {
    const keyValue = `${entity.blockName}#${entity.handle ?? "no-handle"}`;
    return { keyValue, matchKey: canonicalSubjectKey(keyValue), label: entity.blockName };
  }
  return { keyValue: entity.locator, matchKey: canonicalSubjectKey(entity.locator), label: null };
}

export function materializeDxfClaims(input: DxfMaterializationInput): MaterializedArtifact {
  const limitations: string[] = [...DXF_LIMITATIONS, ...input.analysis.limitations];
  const truncationReasons: string[] = [];
  const byId = new Map<string, NormalizedEvidenceClaim>();
  let dropped = 0;

  if (input.analysis.truncated || input.analysis.inspection.truncated) {
    truncationReasons.push("the accepted DXF inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted");
  }
  if (input.analysis.inspection.externalReferences.length > 0) {
    limitations.push(`${input.analysis.inspection.externalReferences.length} external reference(s) were recorded by name only; no XREF path was opened or followed`);
  }
  const units = input.analysis.inspection.document.units;

  const push = (draft: Omit<ClaimDraftInput, "artifact" | "lineage" | "materializationId" | "runId" | "materializerVersion" | "createdAt" | "readingChannel" | "coverage" | "pageNumber">) => {
    if (byId.size >= CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact) {
      dropped += 1;
      return;
    }
    const claim = buildClaim({
      ...draft,
      artifact: input.artifact,
      lineage: input.lineage,
      materializationId: input.materializationId,
      runId: input.runId,
      readingChannel: "DXF_STRUCTURED",
      materializerVersion: DXF_MATERIALIZER_VERSION,
      coverage: input.analysis.truncated || input.analysis.inspection.truncated ? "PARTIAL" : "COMPLETE",
      createdAt: input.createdAt,
      pageNumber: DXF_PAGE_NUMBER,
    });
    byId.set(claim.claimId, claim);
  };

  const emitText = (text: DxfTextEvidence) => {
    const subject = drawingSubject({ locator: text.locator, blockName: text.blockName, handle: text.handle });
    const predicate: ClaimPredicate = text.blockName ? "PROPERTY_VALUE" : "DESCRIPTION_TEXT";
    push({
      subjectKeyNamespace: "TEXT_LABEL",
      subjectKeyValue: subject.keyValue,
      subjectMatchKey: subject.matchKey,
      subjectKeyBasis: text.blockName ? "SOURCE_LABEL" : "ENGINE_DERIVED_TEXT_KEY",
      subjectLabel: subject.label,
      predicate,
      valueLiteral: text.raw,
      unit: null,
      quantityOrigin: null,
      locationKind: "SPACE",
      locationValue: text.space,
      systemValue: null,
      sectionValue: null,
      qualifiers: [],
      sourceQualifiers: ["DXF_TEXT", `SPACE_${text.space}`],
      locator: text.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: "DXF_TEXT",
      rawRecordId: text.id,
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
      reliability: reliabilityOf(text.reliability),
      limitations: [
        ...text.limitations,
        ...(text.normalizedChanged ? ["the recorded text had DXF formatting control codes removed; the verbatim value is preserved alongside its normalized reading"] : []),
      ],
    });
  };

  const emitAttribute = (attribute: DxfAttributeEvidence) => {
    const subject = drawingSubject({ locator: attribute.locator, blockName: attribute.blockName, handle: attribute.insertHandle ?? attribute.handle });
    const predicate: ClaimPredicate = attribute.tag.trim().toLocaleLowerCase() === "tag" ? "EQUIPMENT_TAG" : "PROPERTY_VALUE";
    push({
      subjectKeyNamespace: predicate === "EQUIPMENT_TAG" ? "EQUIPMENT_TAG" : "TEXT_LABEL",
      subjectKeyValue: predicate === "EQUIPMENT_TAG" ? attribute.value : subject.keyValue,
      subjectMatchKey: predicate === "EQUIPMENT_TAG" ? canonicalSubjectKey(attribute.value) : subject.matchKey,
      subjectKeyBasis: predicate === "EQUIPMENT_TAG" ? "SOURCE_IDENTIFIER" : "SOURCE_PROPERTY",
      subjectLabel: subject.label,
      predicate,
      valueLiteral: attribute.value,
      unit: null,
      quantityOrigin: null,
      locationKind: "SPACE",
      locationValue: attribute.space,
      systemValue: null,
      sectionValue: null,
      qualifiers: [attribute.tag],
      sourceQualifiers: ["DXF_ATTRIBUTE", `SPACE_${attribute.space}`, `TAG_${attribute.tag}`],
      locator: attribute.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: attribute.entityType,
      rawRecordId: attribute.id,
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
      reliability: reliabilityOf(attribute.reliability),
      limitations: attribute.limitations,
    });
  };

  const emitEntity = (entity: DxfEntityEvidence) => {
    // Only records that carry textual or attribute evidence become claims. A
    // pure geometry entity is retained by the accepted inspection and never
    // becomes a comparison claim, because geometry is not a quantity.
    if (entity.text) emitText(entity.text);
    if (entity.attribute) emitAttribute(entity.attribute);
    if (entity.insert) {
      const subject = drawingSubject({ locator: entity.insert.locator, blockName: entity.insert.blockName, handle: entity.insert.handle });
      push({
        subjectKeyNamespace: "TEXT_LABEL",
        subjectKeyValue: subject.keyValue,
        subjectMatchKey: subject.matchKey,
        subjectKeyBasis: "SOURCE_IDENTIFIER",
        subjectLabel: subject.label,
        predicate: "PROPERTY_VALUE",
        valueLiteral: entity.insert.blockName,
        unit: null,
        quantityOrigin: null,
        locationKind: "SPACE",
        locationValue: entity.insert.space,
        systemValue: null,
        sectionValue: null,
        qualifiers: [],
        sourceQualifiers: ["DXF_BLOCK_INSERT", `SPACE_${entity.insert.space}`, ...(entity.insert.blockMissing ? ["BLOCK_DEFINITION_MISSING"] : [])],
        locator: entity.insert.locator,
        humanLocator: null,
        citationId: null,
        rawRecordKind: "DXF_INSERT",
        rawRecordId: entity.insert.id,
        confidence: null,
        evidenceDocumentFamilyKey: null,
        observedRevisionLabel: null,
        revisionContext: undefined,
        reliability: reliabilityOf(entity.insert.reliability),
        limitations: entity.insert.limitations,
      });
    }
  };

  const emitDimension = (dimension: DxfDimensionEvidence) => {
    const subject = drawingSubject({ locator: dimension.locator, blockName: dimension.blockName, handle: dimension.handle });
    const literal = dimension.displayText ?? (dimension.measurement !== null ? String(dimension.measurement) : null);
    if (!literal) return;
    push({
      subjectKeyNamespace: "TEXT_LABEL",
      subjectKeyValue: subject.keyValue,
      subjectMatchKey: subject.matchKey,
      subjectKeyBasis: "SOURCE_LABEL",
      subjectLabel: subject.label,
      predicate: "PROPERTY_VALUE",
      valueLiteral: literal,
      // A drawing-declared dimension carries a source number, but it is NOT a
      // stated quantity: it never becomes a STATED_QUANTITY claim and never
      // carries a quantity origin.
      sourceSuppliedNumber: null,
      unit: declaredUnit(null),
      quantityOrigin: null,
      locationKind: "SPACE",
      locationValue: dimension.space,
      systemValue: null,
      sectionValue: null,
      qualifiers: [],
      sourceQualifiers: ["DXF_DIMENSION_DECLARED", "PROHIBITED_AS_QUANTITY", `SPACE_${dimension.space}`],
      locator: dimension.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: "DXF_DIMENSION",
      rawRecordId: dimension.id,
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
      reliability: reliabilityOf(dimension.reliability),
      limitations: [
        ...dimension.limitations,
        "a drawing-declared dimension is not an equipment or material quantity and was never counted or measured by VOKA",
      ],
    });
  };

  for (const entity of input.analysis.inspection.entities) emitEntity(entity);
  for (const text of input.analysis.inspection.texts) if (!input.analysis.inspection.entities.some((entity) => entity.text?.id === text.id)) emitText(text);
  for (const attribute of input.analysis.inspection.attributes) {
    if (!input.analysis.inspection.entities.some((entity) => entity.attribute?.id === attribute.id)) emitAttribute(attribute);
  }
  for (const dimension of input.analysis.inspection.dimensions) emitDimension(dimension);

  // Declared drawing units: DOCUMENT CONTEXT ONLY. Publishing them as a claim
  // lets a reviewer see them; the materializer never joins them to any
  // quantity, and the comparison engine treats the claim as context.
  if (units.declared) {
    push({
      subjectKeyNamespace: "ARTIFACT_LOCATOR",
      subjectKeyValue: units.locator,
      subjectMatchKey: canonicalSubjectKey(units.locator),
      subjectKeyBasis: "SOURCE_IDENTIFIER",
      subjectLabel: null,
      predicate: "PROPERTY_VALUE",
      valueLiteral: units.name ?? units.raw ?? "declared",
      unit: declaredUnit(null),
      quantityOrigin: null,
      locationKind: "DOCUMENT",
      locationValue: units.locator,
      systemValue: null,
      sectionValue: null,
      qualifiers: [],
      sourceQualifiers: ["DOCUMENT_LEVEL_UNIT", "DXF_$INSUNITS", "CONTEXT_ONLY"],
      locator: units.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: "DXF_HEADER_VARIABLE",
      rawRecordId: "$INSUNITS",
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
      reliability: "HIGH",
      limitations: [
        ...units.limitations,
        "the declared drawing units are document-level coordinate context only; they never became the unit of any subject quantity",
      ],
    });
  }

  if (dropped > 0) {
    truncationReasons.push(`only ${CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact} drawing evidence records were materialized; the remainder exceeded the materialization bound`);
  }

  const claims = sortClaims([...byId.values()]);
  const summary = materializationSummary({
    claims,
    truncated: input.analysis.truncated || input.analysis.inspection.truncated || dropped > 0,
    truncationReasons,
    warnings: [],
    limitations,
  });
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId,
    materializerVersion: DXF_MATERIALIZER_VERSION,
    readingChannels: ["DXF_STRUCTURED"],
    coverage: input.unavailable ? "PARTIAL" : summary.coverage,
    claims,
    truncated: summary.truncated,
    truncationReasons: summary.truncationReasons,
    warnings: summary.warnings,
    limitations: summary.limitations,
    unavailable: input.unavailable ?? false,
  };
}
