import {
  MAX_IFC_LIMITATIONS,
  MAX_IFC_LIMITATIONS_PER_RECORD,
  MAX_IFC_RELATIONSHIPS,
  type IfcInspection,
  type IfcRelationship,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-8: bounded IFC relationships from explicit IFC relationship entities.
 *
 * Only relationships the file actually encodes are recorded. Spatial
 * containment, aggregation, type, property-set, system, material,
 * classification, and document associations come from IFCREL* records the
 * inspector already resolved onto locators. Connectivity is not inferred.
 */

export type IfcRelationshipLimits = {
  maxRelationships: number;
};

export const DEFAULT_IFC_RELATIONSHIP_LIMITS: IfcRelationshipLimits = {
  maxRelationships: MAX_IFC_RELATIONSHIPS,
};

export function analyzeIfcRelationships(
  inspection: IfcInspection,
  partialLimits: Partial<IfcRelationshipLimits> = {},
): { relationships: IfcRelationship[]; count: number; truncated: boolean; limitations: string[] } {
  const limits = { ...DEFAULT_IFC_RELATIONSHIP_LIMITS, ...partialLimits };
  const relationships: IfcRelationship[] = [];
  let total = 0;
  let truncated = false;
  const limitations: string[] = [];

  const push = (relationship: IfcRelationship) => {
    total += 1;
    if (relationships.length < limits.maxRelationships) relationships.push(relationship);
    else truncated = true;
  };

  const spatial = [
    ...(inspection.project ? [inspection.project] : []),
    ...inspection.sites,
    ...inspection.buildings,
    ...inspection.storeys,
    ...inspection.spaces,
  ];
  for (const node of spatial) {
    if (!node.parentLocator) continue;
    push({
      kind: node.kind === "SPACE" || node.kind === "BUILDING_STOREY" ? "AGGREGATES" : "AGGREGATES",
      subject: node.parentLocator,
      object: node.locator,
      reason: `'${node.name ?? node.entityType}' is aggregated under its relating spatial structure as the file declared`,
      reliability: "HIGH",
      limitations: ["aggregation is recorded only where IFCRELAGGREGATES named both sides; it was not inferred from coordinates"],
    });
  }

  for (const element of inspection.elements) {
    if (element.containerLocator) {
      push({
        kind: "SPATIALLY_CONTAINED_IN",
        subject: element.locator,
        object: element.containerLocator,
        reason: `'${element.name ?? element.entityType}' is spatially contained in the relating structure as IFCRELCONTAINEDINSPATIALSTRUCTURE declared`,
        reliability: "HIGH",
        limitations: ["spatial containment is recorded only where the IFC relationship named both sides; storey was not inferred from elevation"],
      });
    }
    if (element.typeLocator) {
      push({
        kind: "DEFINED_BY_TYPE",
        subject: element.locator,
        object: element.typeLocator,
        reason: `'${element.name ?? element.entityType}' is defined by type '${element.typeName ?? "unnamed"}' as IFCRELDEFINESBYTYPE declared`,
        reliability: "HIGH",
        limitations: ["a type assignment is BIM evidence of a type object, not an approved product selection"],
      });
    }
    for (const locator of element.propertySetLocators) {
      push({
        kind: "DEFINED_BY_PROPERTY_SET",
        subject: element.locator,
        object: locator,
        reason: `'${element.name ?? element.entityType}' is defined by a property set as IFCRELDEFINESBYPROPERTIES declared`,
        reliability: "HIGH",
        limitations: ["property values are observed BIM metadata, not approved specifications"],
      });
    }
    for (const locator of element.systemLocators) {
      push({
        kind: "ASSIGNED_TO_SYSTEM",
        subject: element.locator,
        object: locator,
        reason: `'${element.name ?? element.entityType}' is assigned to a system or group as IFCRELASSIGNSTOGROUP declared`,
        reliability: "HIGH",
        limitations: ["system membership is not the same as a connected circuit, feed, or airflow path"],
      });
    }
    for (const locator of element.materialLocators) {
      push({
        kind: "ASSOCIATED_WITH_MATERIAL",
        subject: element.locator,
        object: locator,
        reason: `'${element.name ?? element.entityType}' is associated with a material as IFCRELASSOCIATESMATERIAL declared`,
        reliability: "HIGH",
        limitations: ["a material name is observed BIM evidence, not a catalog product or purchase item"],
      });
    }
    for (const locator of element.classificationLocators) {
      push({
        kind: "ASSOCIATED_WITH_CLASSIFICATION",
        subject: element.locator,
        object: locator,
        reason: `'${element.name ?? element.entityType}' is associated with a classification reference as the file declared`,
        reliability: "HIGH",
        limitations: ["classification codes were not interpreted against an external taxonomy"],
      });
    }
    for (const locator of element.documentLocators) {
      push({
        kind: "HAS_DOCUMENT_REFERENCE",
        subject: element.locator,
        object: locator,
        reason: `'${element.name ?? element.entityType}' is associated with an external document reference as the file declared`,
        reliability: "HIGH",
        limitations: ["the referenced document was not opened, fetched, or resolved"],
      });
    }
  }

  if (truncated) limitations.push(`more than ${limits.maxRelationships} relationships were supported; the remainder were not retained`);
  return {
    relationships: relationships.map((item) => ({
      ...item,
      limitations: item.limitations.slice(0, MAX_IFC_LIMITATIONS_PER_RECORD),
    })),
    count: total,
    truncated,
    limitations: limitations.slice(0, MAX_IFC_LIMITATIONS),
  };
}
