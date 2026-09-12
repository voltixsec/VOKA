/**
 * Phase 2A-10: IFC / BIM materializer, bound to the ACCEPTED 2A-8 contract.
 *
 * It consumes the real accepted types — `IfcElementEvidence`,
 * `IfcPropertyEvidence`, `IfcQuantityEvidence`, `IfcUnitEvidence`,
 * `IfcSystemEvidence`, `IfcMaterialEvidence`, `IfcClassificationEvidence`,
 * `IfcDocumentReferenceEvidence`, spatial evidence, and header/schema context —
 * and decides explicitly:
 *
 * - an IFC quantity (`IfcQuantityEvidence`) is DECLARED MODEL EVIDENCE: it maps
 *   to `STATED_QUANTITY` with `quantityOrigin = DECLARED_MODEL`, keeps
 *   `rawValue` verbatim, and persists `value` because the accepted model
 *   supplied a numeric value;
 * - an IFC property maps through the small bounded alias table; anything not in
 *   the table stays `PROPERTY_VALUE` context, and no LLM or fuzzy promotion
 *   exists;
 * - a unit is resolved ONLY through the record's explicit `unitLocator` joined
 *   to `IfcUnitEvidence`. The project unit assignment is never silently
 *   inherited, and a record with no provable unit relationship stays
 *   `unit = null`, `unitDeclared = false`, with the limitation disclosed;
 * - element instances are NEVER counted: `entityCount`,
 *   `entityRecordsRetained`, `entityTypeCounts`, `corroborationCount`, and
 *   element list lengths produce ZERO quantity claims;
 * - placement coordinates and representation items are never turned into
 *   geometry or quantities;
 * - `pageNumber` is always null: a STEP model has no pages;
 * - when the accepted inspection was truncated, the materialization is PARTIAL
 *   and the limitation says absence cannot be asserted;
 * - external document references are recorded by name and never followed.
 */

import {
  MATERIALIZER_VERSIONS,
  CROSS_DOCUMENT_BOUNDS,
  canonicalSubjectKey,
  compactSubjectKey,
  resolvePropertyPredicate,
  type ClaimPredicate,
  type ClaimReliability,
  type ClaimSubject,
  type NormalizedEvidenceClaim,
  type QuantityOrigin,
  type SubjectKeyBasis,
  type SubjectKeyNamespace,
} from "@/src/domain/cross-document";
import {
  IFC_BASELINE_LIMITATION,
  IFC_EXTERNAL_REFERENCE_LIMITATION,
  IFC_NO_COUNT_LIMITATION,
  IFC_PAGE_NUMBER,
  type ObservationReliability,
  IFC_QUANTITY_LIMITATION,
  IFC_SEMANTIC_BASELINE_LIMITATION,
  type IfcAnalysis,
  type IfcElementEvidence,
  type IfcPropertyEvidence,
  type IfcQuantityEvidence,
  type IfcUnitEvidence,
} from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { buildClaim, declaredUnit, materializationSummary, sortClaims, type ClaimDraftInput } from "./ClaimBuilder";

export const IFC_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.IFC_MODEL;

export type IfcMaterializationInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  createdAt: string;
  analysis: IfcAnalysis;
  unavailable?: boolean;
};

const IFC_LIMITATIONS: readonly string[] = [
  IFC_BASELINE_LIMITATION,
  IFC_QUANTITY_LIMITATION,
  IFC_NO_COUNT_LIMITATION,
  IFC_SEMANTIC_BASELINE_LIMITATION,
  "an IFC quantity is declared model evidence: it was never verified, calculated, or approved by VOKA",
];

/** Accepted IFC counters that are explicitly refused as evidence. */
export const IFC_REFUSED_COUNTERS: readonly string[] = [
  "entityCount",
  "entityRecordsRetained",
  "entityTypeCounts",
  "corroborationCount",
  "elements.length",
  "spaces.length",
  "storeys.length",
];

function reliabilityOf(value: ObservationReliability): ClaimReliability {
  return value;
}

/**
 * Resolves the unit of an IFC property or quantity record.
 *
 * The join is explicit and provable: the record's own `unitLocator` must match
 * a unit in the accepted unit list. No project-level inheritance, no
 * prefix arithmetic, and no silent dimension assignment happens here.
 */
export function resolveIfcRecordUnit(input: {
  unitLocator: string | null;
  unitLabel: string | null;
  units: readonly IfcUnitEvidence[];
}): { unitLiteral: string | null; unitDeclared: boolean; dimension: ReturnType<typeof declaredUnit>["unitDimension"]; limitation: string | null } {
  if (!input.unitLocator) {
    return {
      unitLiteral: null,
      unitDeclared: false,
      dimension: null,
      limitation: "no explicit unit relationship was recorded for this IFC record, so its unit stays unknown; the project unit assignment was not inherited",
    };
  }
  const match = input.units.find((unit) => unit.locator === input.unitLocator);
  if (!match) {
    return {
      unitLiteral: null,
      unitDeclared: false,
      dimension: null,
      limitation: "the IFC record names a unit that was not retained in the accepted unit evidence, so no unit was asserted",
    };
  }
  const literal = match.label ?? match.siName ?? input.unitLabel ?? match.entityType;
  const resolved = declaredUnit(literal);
  return {
    unitLiteral: resolved.unitLiteral,
    unitDeclared: resolved.unitDeclared,
    dimension: resolved.unitDimension,
    limitation: match.declared
      ? null
      : "the IFC unit this record points at was not declared in a governed unit assignment",
  };
}

type ElementSubject = {
  namespace: SubjectKeyNamespace;
  keyValue: string;
  matchKey: string;
  subjectKeyBasis: SubjectKeyBasis;
  label: string | null;
  identityClaims: Array<{ namespace: SubjectKeyNamespace; keyValue: string; matchKey: string; basis: SubjectKeyBasis; predicate: ClaimPredicate; label: string | null }>;
};

/**
 * Identity of one IFC element.
 *
 * The primary identity prefers what a DOCUMENT would also state — an explicit
 * manufacturer + model, then a tag, then the element name — because that is
 * what makes a model comparable with a BOQ or a schedule. The GlobalId remains
 * available as its own identity claim, so an exact GlobalId match (T0) is still
 * possible when the meaning is unambiguous.
 */
export function elementSubject(element: IfcElementEvidence, properties: readonly IfcPropertyEvidence[]): ElementSubject {
  const identityClaims: ElementSubject["identityClaims"] = [];
  const manufacturer = properties.find((property) => resolvePropertyPredicate(property.name) === "MANUFACTURER");
  const modelReference = properties.find((property) => resolvePropertyPredicate(property.name) === "MODEL_REFERENCE");
  const makerValue = manufacturer?.rawValue?.trim() ?? null;
  const modelValue = modelReference?.rawValue?.trim() ?? null;

  if (element.tag?.trim()) {
    identityClaims.push({
      namespace: "EQUIPMENT_TAG",
      keyValue: element.tag.trim(),
      matchKey: compactSubjectKey(element.tag),
      basis: "SOURCE_IDENTIFIER",
      predicate: "EQUIPMENT_TAG",
      label: element.name ?? element.tag,
    });
  }
  if (element.globalId?.trim()) {
    identityClaims.push({
      namespace: "GLOBAL_ID",
      keyValue: element.globalId.trim(),
      matchKey: compactSubjectKey(element.globalId),
      basis: "SOURCE_IDENTIFIER",
      predicate: "IDENTITY_TAG",
      label: element.name ?? element.globalId,
    });
  }
  if (makerValue && modelValue) {
    identityClaims.push({
      namespace: "MANUFACTURER_MODEL",
      keyValue: `${makerValue} ${modelValue}`,
      matchKey: `${compactSubjectKey(makerValue)}|${compactSubjectKey(modelValue)}`,
      basis: "SOURCE_PROPERTY",
      predicate: "MODEL_REFERENCE",
      label: element.name ?? `${makerValue} ${modelValue}`,
    });
  }
  if (element.name?.trim()) {
    identityClaims.push({
      namespace: "TEXT_LABEL",
      keyValue: element.name.trim(),
      matchKey: canonicalSubjectKey(element.name),
      basis: "ENGINE_DERIVED_TEXT_KEY",
      predicate: "PROPERTY_VALUE",
      label: element.name,
    });
  }

  const primary =
    (makerValue && modelValue
      ? { namespace: "MANUFACTURER_MODEL" as const, keyValue: `${makerValue} ${modelValue}`, matchKey: `${compactSubjectKey(makerValue)}|${compactSubjectKey(modelValue)}`, basis: "SOURCE_PROPERTY" as const }
      : null)
    ?? (element.tag?.trim()
      ? { namespace: "EQUIPMENT_TAG" as const, keyValue: element.tag.trim(), matchKey: compactSubjectKey(element.tag), basis: "SOURCE_IDENTIFIER" as const }
      : null)
    ?? (element.name?.trim()
      ? { namespace: "TEXT_LABEL" as const, keyValue: element.name.trim(), matchKey: canonicalSubjectKey(element.name), basis: "ENGINE_DERIVED_TEXT_KEY" as const }
      : null)
    ?? (element.globalId?.trim()
      ? { namespace: "GLOBAL_ID" as const, keyValue: element.globalId.trim(), matchKey: compactSubjectKey(element.globalId), basis: "SOURCE_IDENTIFIER" as const }
      : null)
    ?? { namespace: "ARTIFACT_LOCATOR" as const, keyValue: element.locator, matchKey: canonicalSubjectKey(element.locator), basis: "SOURCE_IDENTIFIER" as const };

  return {
    namespace: primary.namespace,
    keyValue: primary.keyValue,
    matchKey: primary.matchKey,
    subjectKeyBasis: primary.basis,
    label: element.name ?? null,
    identityClaims,
  };
}

export function materializeIfcClaims(input: IfcMaterializationInput): MaterializedArtifact {
  const inspection = input.analysis.inspection;
  const limitations: string[] = [...IFC_LIMITATIONS, ...input.analysis.limitations, ...inspection.limitations];
  const truncationReasons: string[] = [];
  const byId = new Map<string, NormalizedEvidenceClaim>();
  let dropped = 0;

  if (input.analysis.truncated || inspection.truncated) {
    truncationReasons.push("the accepted IFC inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted");
    limitations.push("the accepted IFC parser has bounded retention: an element or quantity beyond the retention cap is not evidence of absence");
  }
  if (inspection.documentReferences.length > 0) {
    limitations.push(`${inspection.documentReferences.length} IFC document reference(s) were recorded by name only; no external reference was opened or fetched`);
    limitations.push(IFC_EXTERNAL_REFERENCE_LIMITATION);
  }

  const propertiesByObject = new Map<string, IfcPropertyEvidence[]>();
  for (const property of inspection.properties) {
    for (const locator of property.definedObjectLocators) {
      const list = propertiesByObject.get(locator) ?? [];
      list.push(property);
      propertiesByObject.set(locator, list);
    }
  }
  const quantitiesByObject = new Map<string, IfcQuantityEvidence[]>();
  for (const quantity of inspection.quantities) {
    for (const locator of quantity.definedObjectLocators) {
      const list = quantitiesByObject.get(locator) ?? [];
      list.push(quantity);
      quantitiesByObject.set(locator, list);
    }
  }

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
      readingChannel: "IFC_MODEL",
      materializerVersion: IFC_MATERIALIZER_VERSION,
      coverage: input.analysis.truncated || inspection.truncated ? "PARTIAL" : "COMPLETE",
      createdAt: input.createdAt,
      pageNumber: IFC_PAGE_NUMBER,
    });
    byId.set(claim.claimId, claim);
  };

  for (const element of inspection.elements) {
    const properties = propertiesByObject.get(element.locator) ?? [];
    const quantities = quantitiesByObject.get(element.locator) ?? [];
    const subject = elementSubject(element, properties);
    const systemLocators = element.systemLocators;
    const containerLocator = element.containerLocator;
    const locationValue = containerLocator ? spatialNameFor(inspection, containerLocator) ?? containerLocator : null;

    const base = {
      subjectKeyNamespace: subject.namespace,
      subjectKeyValue: subject.keyValue,
      subjectMatchKey: subject.matchKey,
      subjectKeyBasis: subject.subjectKeyBasis,
      subjectLabel: subject.label,
      locationKind: containerLocator ? "IFC_CONTAINER" : null,
      locationValue,
      systemValue: systemLocators.length ? systemLocators.join(", ") : null,
      sectionValue: null,
      qualifiers: [...element.propertySetLocators, ...element.quantitySetLocators],
      sourceQualifiers: [] as string[],
      locator: element.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: element.entityType,
      rawRecordId: String(element.stepId),
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
      reliability: reliabilityOf(element.reliability),
      limitations: element.limitations,
    };

    // Identity markers: exact tags, GlobalIds, and manufacturer+model keys are
    // published so a stronger identifier can veto a weaker candidate match.
    for (const identity of subject.identityClaims) {
      push({
        ...base,
        subjectKeyNamespace: identity.namespace,
        subjectKeyValue: identity.keyValue,
        subjectMatchKey: identity.matchKey,
        subjectKeyBasis: identity.basis,
        subjectLabel: identity.label,
        predicate: identity.predicate,
        valueLiteral: identity.keyValue,
        unit: null,
        quantityOrigin: null,
        reliability: reliabilityOf(element.reliability),
        sourceQualifiers: ["IFC_IDENTITY_MARKER"],
      });
    }

    if (element.predefinedType) {
      push({ ...base, predicate: "TYPE_NAME", valueLiteral: element.predefinedType, unit: null, quantityOrigin: null, reliability: reliabilityOf(element.reliability) });
    }
    if (element.typeName) {
      push({ ...base, predicate: "TYPE_NAME", valueLiteral: element.typeName, unit: null, quantityOrigin: null, reliability: reliabilityOf(element.reliability) });
    }
    for (const classificationLocator of element.classificationLocators) {
      const classification = inspection.classifications.find((item) => item.locator === classificationLocator);
      if (!classification?.identification) continue;
      push({
        ...base,
        predicate: "CLASSIFICATION_CODE",
        valueLiteral: classification.identification,
        unit: null,
        quantityOrigin: null,
        qualifiers: classification.sourceName ? [classification.sourceName] : [],
        reliability: reliabilityOf(classification.reliability),
        limitations: [
          ...classification.limitations,
          ...(classification.sourceName ? [`the code belongs to the classification scheme '${classification.sourceName}' and only compares inside that scheme`] : []),
        ],
      });
    }
    for (const materialLocator of element.materialLocators) {
      const material = inspection.materials.find((item) => item.locator === materialLocator);
      if (!material?.name) continue;
      push({
        ...base,
        predicate: "MATERIAL",
        valueLiteral: material.name,
        unit: null,
        quantityOrigin: null,
        reliability: reliabilityOf(material.reliability),
        limitations: material.limitations,
      });
    }
    if (systemLocators.length) {
      for (const systemLocator of systemLocators) {
        const system = inspection.systems.find((item) => item.locator === systemLocator);
        const value = system?.name ?? system?.longName ?? systemLocator;
        push({
          ...base,
          predicate: "SYSTEM_ASSIGNMENT",
          valueLiteral: value,
          unit: null,
          quantityOrigin: null,
          reliability: reliabilityOf(system?.reliability ?? element.reliability),
          limitations: system?.limitations ?? [],
        });
      }
    }
    if (containerLocator) {
      const containerName = spatialNameFor(inspection, containerLocator) ?? containerLocator;
      push({
        ...base,
        predicate: "LOCATION",
        valueLiteral: containerName,
        unit: null,
        quantityOrigin: null,
        reliability: reliabilityOf(element.reliability),
        limitations: [...element.limitations, "the container is the element's IFC spatial parent, taken from the accepted relationship evidence"],
      });
    }

    for (const property of properties) {
      const resolved = resolvePropertyPredicate(property.name);
      const unit = resolveIfcRecordUnit({ unitLocator: property.unitLocator, unitLabel: property.unitLabel, units: inspection.units });
      const predicate: ClaimPredicate = resolved === "AMBIGUOUS" ? "PROPERTY_VALUE" : resolved;
      const rawValue = property.rawValue ?? "";
      if (!rawValue.trim()) continue;
      // A property is published under the element's identity, so a BOQ
      // manufacturer column and an IFC Manufacturer property meet in one
      // cluster. A name outside the bounded alias table stays PROPERTY_VALUE
      // context and is never promoted by wording similarity.
      push({
        ...base,
        predicate,
        valueLiteral: rawValue,
        unit: declaredUnit(unit.unitLiteral),
        quantityOrigin: null,
        qualifiers: [...base.qualifiers, property.propertySetName ?? "", property.name],
        reliability: reliabilityOf(property.reliability),
        limitations: [
          ...property.limitations,
          ...(unit.limitation ? [unit.limitation] : []),
          ...(resolved === "AMBIGUOUS" ? [`the property name '${property.name}' is ambiguous in the alias table and was kept as context only`] : []),
          ...(resolved === "PROPERTY_VALUE" ? [`the property name '${property.name}' is outside the bounded alias table and was kept as context only`] : []),
        ],
      });
    }

    for (const quantity of quantities) {
      const unit = resolveIfcRecordUnit({ unitLocator: quantity.unitLocator, unitLabel: quantity.unitLabel, units: inspection.units });
      const literal = quantity.rawValue ?? (quantity.value !== null ? String(quantity.value) : "");
      if (!literal.trim()) continue;
      push({
        ...base,
        predicate: "STATED_QUANTITY",
        valueLiteral: literal,
        // The accepted IFC model supplied a numeric value: this is the only
        // reason a persisted numeric view is allowed here.
        sourceSuppliedNumber: quantity.value,
        unit: declaredUnit(unit.unitLiteral),
        quantityOrigin: "DECLARED_MODEL" satisfies QuantityOrigin,
        qualifiers: [...base.qualifiers, quantity.quantitySetName ?? "", quantity.name],
        reliability: reliabilityOf(quantity.reliability),
        limitations: [
          ...quantity.limitations,
          ...(unit.limitation ? [unit.limitation] : []),
          "the quantity is what the model declares; it was not measured from geometry and not verified",
        ],
      });
    }
  }

  if (dropped > 0) {
    truncationReasons.push(`only ${CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact} IFC evidence records were materialized; the remainder exceeded the materialization bound`);
  }

  const claims = sortClaims([...byId.values()]);
  const summary = materializationSummary({
    claims,
    truncated: input.analysis.truncated || inspection.truncated || dropped > 0,
    truncationReasons,
    warnings: [],
    limitations,
  });
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId,
    materializerVersion: IFC_MATERIALIZER_VERSION,
    readingChannels: ["IFC_MODEL"],
    coverage: input.unavailable ? "PARTIAL" : summary.coverage,
    claims,
    truncated: summary.truncated,
    truncationReasons: summary.truncationReasons,
    warnings: summary.warnings,
    limitations: summary.limitations,
    unavailable: input.unavailable ?? false,
  };
}

function spatialNameFor(inspection: IfcAnalysis["inspection"], locator: string): string | null {
  const candidates = [inspection.project, ...inspection.sites, ...inspection.buildings, ...inspection.storeys, ...inspection.spaces];
  const match = candidates.find((item) => item?.locator === locator);
  if (!match) return null;
  return match.name ?? match.longName ?? null;
}

/** Subject for a standalone IFC record outside an element (context only). */
export function ifcContextSubject(locator: string): ClaimSubject {
  return {
    subjectKeyNamespace: "ARTIFACT_LOCATOR",
    subjectKeyValue: locator,
    subjectMatchKey: canonicalSubjectKey(locator),
    subjectKeyBasis: "SOURCE_IDENTIFIER",
    subjectLabel: null,
  };
}
