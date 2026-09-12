import {
  IFC_BASELINE_LIMITATION,
  IFC_EXTERNAL_REFERENCE_LIMITATION,
  IFC_NO_COUNT_LIMITATION,
  IFC_QUANTITY_LIMITATION,
  MAX_CLASSIFICATIONS,
  MAX_DOCUMENT_REFERENCES,
  MAX_ELEMENTS,
  MAX_IFC_BYTES,
  MAX_IFC_LIMITATIONS,
  MAX_IFC_LIMITATIONS_PER_RECORD,
  MAX_MATERIALS,
  MAX_PLACEMENTS,
  MAX_PROPERTIES,
  MAX_PROPERTY_SETS,
  MAX_QUANTITIES,
  MAX_REFERENCES_PER_ENTITY,
  MAX_REPRESENTATIONS,
  MAX_RETAINED_ELEMENTS,
  MAX_RETAINED_SPATIAL,
  MAX_SPACES,
  MAX_STEP_ENTITIES,
  MAX_STOREYS,
  MAX_SYSTEMS,
  MAX_TYPE_OBJECTS,
  MAX_UNITS,
  clipIfcText,
  formatIfcLocator,
  ifcSchemaFromDeclared,
  ifcUnitLabel,
  isGenericIfcElementType,
  isIfcMaterialType,
  isIfcPlacementType,
  isIfcPropertyType,
  isIfcQuantityType,
  isIfcRepresentationType,
  isIfcSystemType,
  isIfcTypeObjectType,
  propertyFormForIfcType,
  quantityKindForIfcType,
  spatialKindForIfcType,
  type IfcClassificationEvidence,
  type IfcDocumentFacts,
  type IfcDocumentReferenceEvidence,
  type IfcElementEvidence,
  type IfcIdentity,
  type IfcInspection,
  type IfcMaterialEvidence,
  type IfcPlacementEvidence,
  type IfcPropertyEvidence,
  type IfcPropertySetEvidence,
  type IfcQuantityEvidence,
  type IfcRepresentationEvidence,
  type IfcSpatialEvidence,
  type IfcSystemEvidence,
  type IfcTypeEvidence,
  type IfcUnitEvidence,
} from "@/src/domain/source-artifact";
import { IfcInspectionError, detectIfcFormat, type IfcFormatDecision } from "./IfcFormat";
import {
  IfcStepReadError,
  readIfcStep,
  stepAsEnum,
  stepAsList,
  stepAsNumber,
  stepAsRef,
  stepAsRefList,
  stepAsString,
  stepLiteral,
  type StepEntity,
  type StepReadResult,
  type StepValue,
} from "./IfcStepReader";

/**
 * Phase 2A-8: bounded IFC document inspector.
 *
 * This is the only place in VOKA where IFC bytes are read. It owns the STEP
 * walk and produces the domain evidence model; nothing outside this folder
 * ever sees a STEP value or a parser object.
 */

export type IfcInspectionLimits = {
  maxBytes: number;
  maxEntities: number;
  maxElements: number;
  maxSpaces: number;
  maxStoreys: number;
  maxSystems: number;
  maxMaterials: number;
  maxProperties: number;
  maxPropertySets: number;
  maxQuantities: number;
  maxTypeObjects: number;
  maxPlacements: number;
  maxRepresentations: number;
  maxUnits: number;
  maxClassifications: number;
  maxDocumentReferences: number;
  maxRetainedElements: number;
  maxRetainedSpatial: number;
  maxReferencesPerEntity: number;
};

export const DEFAULT_IFC_LIMITS: IfcInspectionLimits = {
  maxBytes: MAX_IFC_BYTES,
  maxEntities: MAX_STEP_ENTITIES,
  maxElements: MAX_ELEMENTS,
  maxSpaces: MAX_SPACES,
  maxStoreys: MAX_STOREYS,
  maxSystems: MAX_SYSTEMS,
  maxMaterials: MAX_MATERIALS,
  maxProperties: MAX_PROPERTIES,
  maxPropertySets: MAX_PROPERTY_SETS,
  maxQuantities: MAX_QUANTITIES,
  maxTypeObjects: MAX_TYPE_OBJECTS,
  maxPlacements: MAX_PLACEMENTS,
  maxRepresentations: MAX_REPRESENTATIONS,
  maxUnits: MAX_UNITS,
  maxClassifications: MAX_CLASSIFICATIONS,
  maxDocumentReferences: MAX_DOCUMENT_REFERENCES,
  maxRetainedElements: MAX_RETAINED_ELEMENTS,
  maxRetainedSpatial: MAX_RETAINED_SPATIAL,
  maxReferencesPerEntity: MAX_REFERENCES_PER_ENTITY,
};

function decodeIfcText(bytes: Uint8Array): { text: string; usedFallback: boolean } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), usedFallback: false };
  } catch {
    return { text: new TextDecoder("latin1").decode(bytes), usedFallback: true };
  }
}

function identityFrom(entity: StepEntity): IfcIdentity {
  const globalId = clipIfcText(stepAsString(entity.args[0]), 64);
  const name = clipIfcText(stepAsString(entity.args[2]));
  const description = clipIfcText(stepAsString(entity.args[3]));
  const objectType = clipIfcText(stepAsString(entity.args[4]));
  const tag = clipIfcText(stepAsString(entity.args[7]));
  const predefinedType = lastEnum(entity.args);
  const longName = clipIfcText(stepAsString(entity.args[8]) ?? stepAsString(entity.args[5]));
  return {
    stepId: entity.stepId,
    entityType: entity.entityType,
    globalId,
    name,
    description,
    objectType,
    tag,
    predefinedType,
    longName,
    locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, globalId, name, tag }),
  };
}

function lastEnum(args: StepValue[]): string | null {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = stepAsEnum(args[index]);
    if (value) return value;
  }
  return null;
}

function firstNumber(args: StepValue[]): number | null {
  for (const arg of args) {
    const value = stepAsNumber(arg);
    if (value !== null) return value;
  }
  return null;
}

function looksRemote(location: string | null): boolean {
  if (!location) return false;
  return /^[a-z]+:\/\//iu.test(location) || location.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(location);
}

function limitList(values: string[], max: number): string[] {
  return values.slice(0, max);
}

type InspectorBags = {
  limits: IfcInspectionLimits;
  project: IfcSpatialEvidence | null;
  sites: IfcSpatialEvidence[];
  buildings: IfcSpatialEvidence[];
  storeys: IfcSpatialEvidence[];
  spaces: IfcSpatialEvidence[];
  elements: IfcElementEvidence[];
  types: IfcTypeEvidence[];
  propertySets: IfcPropertySetEvidence[];
  properties: IfcPropertyEvidence[];
  quantities: IfcQuantityEvidence[];
  units: IfcUnitEvidence[];
  materials: IfcMaterialEvidence[];
  systems: IfcSystemEvidence[];
  classifications: IfcClassificationEvidence[];
  documentReferences: IfcDocumentReferenceEvidence[];
  placements: IfcPlacementEvidence[];
  representations: IfcRepresentationEvidence[];
  entityTypeCounts: Record<string, number>;
  limitations: string[];
  counters: {
    elementsTruncated: boolean;
    spacesTruncated: boolean;
    storeysTruncated: boolean;
    systemsTruncated: boolean;
    materialsTruncated: boolean;
    propertiesTruncated: boolean;
    propertySetsTruncated: boolean;
    quantitiesTruncated: boolean;
    typesTruncated: boolean;
    placementsTruncated: boolean;
    representationsTruncated: boolean;
    unitsTruncated: boolean;
    classificationsTruncated: boolean;
    documentsTruncated: boolean;
    spatialTruncated: boolean;
  };
};

function newBags(limits: IfcInspectionLimits): InspectorBags {
  return {
    limits,
    project: null,
    sites: [],
    buildings: [],
    storeys: [],
    spaces: [],
    elements: [],
    types: [],
    propertySets: [],
    properties: [],
    quantities: [],
    units: [],
    materials: [],
    systems: [],
    classifications: [],
    documentReferences: [],
    placements: [],
    representations: [],
    entityTypeCounts: {},
    limitations: [],
    counters: {
      elementsTruncated: false,
      spacesTruncated: false,
      storeysTruncated: false,
      systemsTruncated: false,
      materialsTruncated: false,
      propertiesTruncated: false,
      propertySetsTruncated: false,
      quantitiesTruncated: false,
      typesTruncated: false,
      placementsTruncated: false,
      representationsTruncated: false,
      unitsTruncated: false,
      classificationsTruncated: false,
      documentsTruncated: false,
      spatialTruncated: false,
    },
  };
}

function addLimitation(bags: InspectorBags, limitation: string): void {
  if (!bags.limitations.includes(limitation)) bags.limitations.push(limitation);
}

function spatialRecord(entity: StepEntity, kind: IfcSpatialEvidence["kind"]): IfcSpatialEvidence {
  const id = identityFrom(entity);
  const elevation = kind === "BUILDING_STOREY" || kind === "SITE" ? firstNumber(entity.args.slice(9)) : null;
  const limitations: string[] = [];
  if (!id.globalId) limitations.push("the entity carried no GlobalId");
  return {
    ...id,
    kind,
    parentLocator: null,
    elevation,
    reliability: id.globalId ? "HIGH" : "MEDIUM",
    status: "OBSERVED_NOT_APPROVED",
    limitations: limitations.slice(0, MAX_IFC_LIMITATIONS_PER_RECORD),
  };
}

function pushSpatial(bags: InspectorBags, record: IfcSpatialEvidence): void {
  const cap = record.kind === "SPACE"
    ? bags.limits.maxSpaces
    : record.kind === "BUILDING_STOREY"
      ? bags.limits.maxStoreys
      : bags.limits.maxRetainedSpatial;
  const target = record.kind === "SITE"
    ? bags.sites
    : record.kind === "BUILDING"
      ? bags.buildings
      : record.kind === "BUILDING_STOREY"
        ? bags.storeys
        : record.kind === "SPACE"
          ? bags.spaces
          : null;
  if (record.kind === "PROJECT") {
    bags.project = record;
    return;
  }
  if (!target) return;
  if (target.length >= cap) {
    if (record.kind === "SPACE") bags.counters.spacesTruncated = true;
    else if (record.kind === "BUILDING_STOREY") bags.counters.storeysTruncated = true;
    else bags.counters.spatialTruncated = true;
    return;
  }
  target.push(record);
}

function collectNumbers(value: StepValue | undefined): number[] {
  if (!value) return [];
  if (value.kind === "number") return [value.value];
  if (value.kind === "list") return value.values.flatMap((item) => collectNumbers(item));
  if (value.kind === "typed") return collectNumbers(value.value);
  return [];
}

function inspectEntity(entity: StepEntity, bags: InspectorBags): void {
  bags.entityTypeCounts[entity.entityType] = (bags.entityTypeCounts[entity.entityType] ?? 0) + 1;
  const spatialKind = spatialKindForIfcType(entity.entityType);
  if (spatialKind) {
    pushSpatial(bags, spatialRecord(entity, spatialKind));
    return;
  }
  if (entity.entityType === "IFCPROPERTYSET") {
    if (bags.propertySets.length >= bags.limits.maxPropertySets) {
      bags.counters.propertySetsTruncated = true;
      return;
    }
    const id = identityFrom(entity);
    bags.propertySets.push({
      stepId: entity.stepId,
      name: id.name,
      globalId: id.globalId,
      propertyLocators: [],
      definedObjectLocators: [],
      locator: id.locator,
      limitations: [],
    });
    return;
  }
  if (entity.entityType === "IFCELEMENTQUANTITY") {
    if (bags.propertySets.length >= bags.limits.maxPropertySets) {
      bags.counters.propertySetsTruncated = true;
      return;
    }
    const id = identityFrom(entity);
    bags.propertySets.push({
      stepId: entity.stepId,
      name: id.name,
      globalId: id.globalId,
      propertyLocators: [],
      definedObjectLocators: [],
      locator: id.locator,
      limitations: [IFC_QUANTITY_LIMITATION],
    });
    return;
  }
  if (isIfcPropertyType(entity.entityType)) {
    if (bags.properties.length >= bags.limits.maxProperties) {
      bags.counters.propertiesTruncated = true;
      return;
    }
    const form = propertyFormForIfcType(entity.entityType);
    const name = clipIfcText(stepAsString(entity.args[0])) ?? "unnamed";
    let rawValue: string | null = null;
    let unitRef: number | null = null;
    if (form === "SINGLE_VALUE") {
      rawValue = stepLiteral(entity.args[2]);
      unitRef = stepAsRef(entity.args[3]);
    } else if (form === "ENUMERATED_VALUE" || form === "LIST_VALUE") {
      rawValue = stepLiteral(entity.args[2]);
      unitRef = stepAsRef(entity.args[3]);
    } else if (form === "BOUNDED_VALUE") {
      const upper = stepLiteral(entity.args[2]);
      const lower = stepLiteral(entity.args[3]);
      rawValue = [lower, upper].filter(Boolean).join(" .. ") || null;
      unitRef = stepAsRef(entity.args[4]);
    } else if (form === "REFERENCE_VALUE") {
      rawValue = stepLiteral(entity.args[3]) ?? stepLiteral(entity.args[2]);
    } else {
      rawValue = stepLiteral(entity.args[2]);
    }
    const limitations: string[] = ["a property value is observed BIM metadata, not an approved specification or a product selection"];
    if (/^manufacturer$/iu.test(name)) limitations.push("Manufacturer is observed model metadata and does not create a supplier or selected manufacturer");
    if (/^(modelreference|model|reference)$/iu.test(name)) limitations.push("model/reference is observed model metadata and does not create a catalog item or product selection");
    bags.properties.push({
      stepId: entity.stepId,
      form,
      name,
      rawValue: clipIfcText(rawValue),
      unitLocator: unitRef ? formatIfcLocator({ stepId: unitRef }) : null,
      unitLabel: null,
      propertySetName: null,
      propertySetLocator: null,
      definedObjectLocators: [],
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, name }),
      reliability: "HIGH",
      status: "OBSERVED_NOT_APPROVED",
      limitations: limitations.slice(0, MAX_IFC_LIMITATIONS_PER_RECORD),
    });
    return;
  }
  if (isIfcQuantityType(entity.entityType)) {
    if (bags.quantities.length >= bags.limits.maxQuantities) {
      bags.counters.quantitiesTruncated = true;
      return;
    }
    const kind = quantityKindForIfcType(entity.entityType);
    const name = clipIfcText(stepAsString(entity.args[0])) ?? "unnamed";
    const unitRef = stepAsRef(entity.args[2]);
    const value = stepAsNumber(entity.args[3]);
    bags.quantities.push({
      stepId: entity.stepId,
      kind,
      name,
      value,
      rawValue: stepLiteral(entity.args[3]),
      unitLocator: unitRef ? formatIfcLocator({ stepId: unitRef }) : null,
      unitLabel: null,
      quantitySetName: null,
      quantitySetLocator: null,
      definedObjectLocators: [],
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, name }),
      reliability: "HIGH",
      status: "OBSERVED_NOT_APPROVED",
      limitations: [IFC_QUANTITY_LIMITATION],
    });
    return;
  }
  if (entity.entityType === "IFCSIUNIT" || entity.entityType === "IFCCONVERSIONBASEDUNIT" || entity.entityType === "IFCDERIVEDUNIT" || entity.entityType === "IFCUNITASSIGNMENT") {
    if (bags.units.length >= bags.limits.maxUnits) {
      bags.counters.unitsTruncated = true;
      return;
    }
    if (entity.entityType === "IFCUNITASSIGNMENT") {
      bags.units.push({
        stepId: entity.stepId,
        entityType: entity.entityType,
        unitType: "ASSIGNMENT",
        siName: null,
        prefix: null,
        conversionName: null,
        label: null,
        labelArabic: null,
        declared: true,
        locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType }),
        limitations: [],
      });
      return;
    }
    const unitType = stepAsEnum(entity.args[1]);
    const prefix = entity.entityType === "IFCSIUNIT" ? stepAsEnum(entity.args[2]) : null;
    const siName = entity.entityType === "IFCSIUNIT" ? stepAsEnum(entity.args[3]) : null;
    const conversionName = entity.entityType === "IFCCONVERSIONBASEDUNIT" ? clipIfcText(stepAsString(entity.args[2])) : null;
    const labels = ifcUnitLabel(prefix, siName, conversionName);
    bags.units.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      unitType,
      siName,
      prefix,
      conversionName,
      label: labels.label,
      labelArabic: labels.labelArabic,
      declared: Boolean(labels.label || unitType),
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType }),
      limitations: [],
    });
    return;
  }
  if (isIfcTypeObjectType(entity.entityType)) {
    if (bags.types.length >= bags.limits.maxTypeObjects) {
      bags.counters.typesTruncated = true;
      return;
    }
    const id = identityFrom(entity);
    bags.types.push({
      ...id,
      reliability: id.globalId ? "HIGH" : "MEDIUM",
      status: "OBSERVED_NOT_APPROVED",
      limitations: ["a type assignment is BIM evidence of a type object, not an approved product selection"],
    });
    return;
  }
  if (isIfcSystemType(entity.entityType)) {
    if (bags.systems.length >= bags.limits.maxSystems) {
      bags.counters.systemsTruncated = true;
      return;
    }
    const id = identityFrom(entity);
    bags.systems.push({
      ...id,
      memberLocators: [],
      reliability: id.globalId ? "HIGH" : "MEDIUM",
      status: "OBSERVED_NOT_APPROVED",
      limitations: ["system membership is observed BIM grouping, not engineering topology such as a circuit or airflow path"],
    });
    return;
  }
  if (isIfcMaterialType(entity.entityType)) {
    if (bags.materials.length >= bags.limits.maxMaterials) {
      bags.counters.materialsTruncated = true;
      return;
    }
    const name = clipIfcText(stepAsString(entity.args[0]) ?? stepAsString(entity.args[1]));
    bags.materials.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      name,
      layerNames: [],
      associatedObjectLocators: [],
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, name }),
      reliability: "HIGH",
      status: "OBSERVED_NOT_APPROVED",
      limitations: ["a material name is observed BIM evidence, not a catalog product, supplier, or purchase item"],
    });
    return;
  }
  if (entity.entityType === "IFCCLASSIFICATION" || entity.entityType === "IFCCLASSIFICATIONREFERENCE") {
    if (bags.classifications.length >= bags.limits.maxClassifications) {
      bags.counters.classificationsTruncated = true;
      return;
    }
    const location = clipIfcText(stepAsString(entity.args[0]));
    const identification = clipIfcText(stepAsString(entity.args[1]));
    const name = clipIfcText(stepAsString(entity.args[2]) ?? stepAsString(entity.args[3]));
    bags.classifications.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      location,
      identification,
      name,
      sourceName: entity.entityType === "IFCCLASSIFICATION" ? clipIfcText(stepAsString(entity.args[3]) ?? name) : null,
      associatedObjectLocators: [],
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, name: identification ?? name }),
      reliability: "HIGH",
      status: "OBSERVED_NOT_APPROVED",
      limitations: ["classification codes are preserved as the model stored them; they were not interpreted against an external taxonomy"],
    });
    return;
  }
  if (entity.entityType === "IFCDOCUMENTREFERENCE" || entity.entityType === "IFCDOCUMENTINFORMATION" || entity.entityType === "IFCEXTERNALREFERENCE") {
    if (bags.documentReferences.length >= bags.limits.maxDocumentReferences) {
      bags.counters.documentsTruncated = true;
      return;
    }
    const location = clipIfcText(stepAsString(entity.args[0]));
    const identification = clipIfcText(stepAsString(entity.args[1]));
    const name = clipIfcText(stepAsString(entity.args[2]));
    const limitations = [IFC_EXTERNAL_REFERENCE_LIMITATION];
    if (looksRemote(location)) limitations.push("the location looks like a path or URL and was recorded without being opened");
    bags.documentReferences.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      location,
      identification,
      name,
      associatedObjectLocators: [],
      opened: false,
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType, name: identification ?? name }),
      reliability: "HIGH",
      status: "OBSERVED_NOT_APPROVED",
      limitations: limitations.slice(0, MAX_IFC_LIMITATIONS_PER_RECORD),
    });
    return;
  }
  if (isIfcPlacementType(entity.entityType)) {
    if (bags.placements.length >= bags.limits.maxPlacements) {
      bags.counters.placementsTruncated = true;
      return;
    }
    const coords = collectNumbers(entity.args[0]).slice(0, 3);
    const dirs = entity.entityType === "IFCDIRECTION" ? collectNumbers(entity.args[0]).slice(0, 3) : collectNumbers(entity.args[1]).slice(0, 3);
    bags.placements.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      coordinates: coords,
      directionRatios: entity.entityType === "IFCDIRECTION" ? dirs : collectNumbers(entity.args[1]).slice(0, 3),
      relativeToLocator: stepAsRef(entity.args[0]) ? formatIfcLocator({ stepId: stepAsRef(entity.args[0])! }) : null,
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType }),
      limitations: ["placement coordinates were preserved as stored and were not transformed into world-space geometry or distances"],
    });
    return;
  }
  if (isIfcRepresentationType(entity.entityType)) {
    if (bags.representations.length >= bags.limits.maxRepresentations) {
      bags.counters.representationsTruncated = true;
      return;
    }
    const identifier = entity.entityType === "IFCSHAPEREPRESENTATION" ? clipIfcText(stepAsString(entity.args[1])) : clipIfcText(stepAsString(entity.args[0]));
    const representationType = entity.entityType === "IFCSHAPEREPRESENTATION" ? clipIfcText(stepAsString(entity.args[2])) : null;
    const items = entity.entityType === "IFCSHAPEREPRESENTATION" ? stepAsRefList(entity.args[3]) : stepAsRefList(entity.args[2]);
    bags.representations.push({
      stepId: entity.stepId,
      entityType: entity.entityType,
      identifier,
      representationType,
      itemStepIds: items.slice(0, bags.limits.maxReferencesPerEntity),
      locator: formatIfcLocator({ stepId: entity.stepId, entityType: entity.entityType }),
      limitations: ["representation metadata was preserved; geometry was not tessellated, meshed, or measured"],
    });
    return;
  }
  if (isGenericIfcElementType(entity.entityType) || /^IFC[A-Z0-9]+$/u.test(entity.entityType) && stepAsString(entity.args[0]) && entity.entityType.startsWith("IFC") && !entity.entityType.startsWith("IFCREL")) {
    if (!isGenericIfcElementType(entity.entityType)) return;
    if (bags.elements.length >= bags.limits.maxRetainedElements) {
      bags.counters.elementsTruncated = true;
      return;
    }
    if ((bags.entityTypeCounts[entity.entityType] ?? 0) && bags.elements.filter((item) => item.entityType === entity.entityType).length + bags.elements.length >= bags.limits.maxElements) {
      bags.counters.elementsTruncated = true;
    }
    const id = identityFrom(entity);
    const placementRef = stepAsRef(entity.args[5]);
    const representationRef = stepAsRef(entity.args[6]);
    bags.elements.push({
      ...id,
      containerLocator: null,
      typeLocator: null,
      typeName: null,
      systemLocators: [],
      materialLocators: [],
      propertySetLocators: [],
      quantitySetLocators: [],
      classificationLocators: [],
      documentLocators: [],
      placementLocator: placementRef ? formatIfcLocator({ stepId: placementRef }) : null,
      representationLocator: representationRef ? formatIfcLocator({ stepId: representationRef }) : null,
      reliability: id.globalId ? "HIGH" : "MEDIUM",
      status: "OBSERVED_NOT_APPROVED",
      limitations: id.globalId ? [] : ["the entity carried no GlobalId, so it is identified by its STEP id only"],
    });
  }
}

function locatorFor(entity: StepEntity | undefined): string | null {
  if (!entity) return null;
  return formatIfcLocator({
    stepId: entity.stepId,
    entityType: entity.entityType,
    globalId: stepAsString(entity.args[0]),
    name: stepAsString(entity.args[2]),
  });
}

function findElement(bags: InspectorBags, stepId: number): IfcElementEvidence | IfcSpatialEvidence | IfcSystemEvidence | undefined {
  if (bags.project?.stepId === stepId) return bags.project;
  return bags.elements.find((item) => item.stepId === stepId)
    ?? bags.spaces.find((item) => item.stepId === stepId)
    ?? bags.storeys.find((item) => item.stepId === stepId)
    ?? bags.buildings.find((item) => item.stepId === stepId)
    ?? bags.sites.find((item) => item.stepId === stepId)
    ?? bags.systems.find((item) => item.stepId === stepId);
}

function applyRelationships(read: StepReadResult, bags: InspectorBags): void {
  const byId = read.entityById;
  for (const entity of read.entities) {
    const type = entity.entityType;
    if (type === "IFCRELAGGREGATES") {
      const parent = stepAsRef(entity.args[4]);
      const children = stepAsRefList(entity.args[5]);
      const parentEntity = parent ? byId.get(parent) : undefined;
      const parentLoc = locatorFor(parentEntity);
      for (const childId of children.slice(0, bags.limits.maxReferencesPerEntity)) {
        const child = findElement(bags, childId);
        if (child && "parentLocator" in child && parentLoc) child.parentLocator = parentLoc;
      }
    } else if (type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const container = relating ? locatorFor(byId.get(relating)) : null;
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const element = bags.elements.find((item) => item.stepId === id);
        if (element && container) element.containerLocator = container;
        const space = bags.spaces.find((item) => item.stepId === id);
        if (space && container) space.parentLocator = container;
      }
    } else if (type === "IFCRELDEFINESBYTYPE") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const typeEntity = relating ? byId.get(relating) : undefined;
      const typeLoc = locatorFor(typeEntity);
      const typeName = typeEntity ? clipIfcText(stepAsString(typeEntity.args[2]) ?? stepAsString(typeEntity.args[4])) : null;
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const element = bags.elements.find((item) => item.stepId === id);
        if (element && typeLoc) {
          element.typeLocator = typeLoc;
          element.typeName = typeName;
        }
      }
    } else if (type === "IFCRELDEFINESBYPROPERTIES") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const def = relating ? byId.get(relating) : undefined;
      const defLoc = locatorFor(def);
      const defName = def ? clipIfcText(stepAsString(def.args[2])) : null;
      const relatedLocators = related
        .map((id) => locatorFor(byId.get(id)))
        .filter((item): item is string => Boolean(item));
      if (def?.entityType === "IFCPROPERTYSET") {
        const set = bags.propertySets.find((item) => item.stepId === def.stepId);
        if (set) set.definedObjectLocators = limitList([...new Set([...set.definedObjectLocators, ...relatedLocators])], bags.limits.maxReferencesPerEntity);
        const hasProperties = stepAsRefList(def.args[4]);
        for (const propId of hasProperties) {
          const property = bags.properties.find((item) => item.stepId === propId);
          if (property) {
            property.propertySetName = defName;
            property.propertySetLocator = defLoc;
            property.definedObjectLocators = limitList([...new Set([...property.definedObjectLocators, ...relatedLocators])], bags.limits.maxReferencesPerEntity);
          }
          if (set) {
            const propLoc = formatIfcLocator({ stepId: propId, entityType: byId.get(propId)?.entityType });
            if (!set.propertyLocators.includes(propLoc)) set.propertyLocators.push(propLoc);
          }
        }
        for (const id of related) {
          const element = bags.elements.find((item) => item.stepId === id);
          if (element && defLoc && !element.propertySetLocators.includes(defLoc)) element.propertySetLocators.push(defLoc);
        }
      } else if (def?.entityType === "IFCELEMENTQUANTITY") {
        const quantities = stepAsRefList(def.args[5]);
        for (const qid of quantities) {
          const quantity = bags.quantities.find((item) => item.stepId === qid);
          if (quantity) {
            quantity.quantitySetName = defName;
            quantity.quantitySetLocator = defLoc;
            quantity.definedObjectLocators = limitList([...new Set([...quantity.definedObjectLocators, ...relatedLocators])], bags.limits.maxReferencesPerEntity);
          }
        }
        for (const id of related) {
          const element = bags.elements.find((item) => item.stepId === id);
          if (element && defLoc && !element.quantitySetLocators.includes(defLoc)) element.quantitySetLocators.push(defLoc);
        }
      }
    } else if (type === "IFCRELASSIGNSTOGROUP") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[6]) ?? stepAsRef(entity.args[5]);
      const groupLoc = relating ? locatorFor(byId.get(relating)) : null;
      const system = relating ? bags.systems.find((item) => item.stepId === relating) : undefined;
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const loc = locatorFor(byId.get(id));
        if (system && loc && !system.memberLocators.includes(loc)) system.memberLocators.push(loc);
        const element = bags.elements.find((item) => item.stepId === id);
        if (element && groupLoc && !element.systemLocators.includes(groupLoc)) element.systemLocators.push(groupLoc);
      }
    } else if (type === "IFCRELASSOCIATESMATERIAL") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const materialLoc = relating ? locatorFor(byId.get(relating)) : null;
      const material = relating ? bags.materials.find((item) => item.stepId === relating) : undefined;
      // Material layer sets point at a set, which may not be the IFCMATERIAL itself.
      let resolvedMaterial = material;
      if (!resolvedMaterial && relating) {
        const relatingEntity = byId.get(relating);
        if (relatingEntity && isIfcMaterialType(relatingEntity.entityType)) {
          const nested = stepAsRefList(relatingEntity.args[0]);
          for (const nestedId of nested) {
            const found = bags.materials.find((item) => item.stepId === nestedId);
            if (found) resolvedMaterial = found;
          }
          if (!resolvedMaterial) {
            resolvedMaterial = bags.materials.find((item) => item.stepId === relating);
          }
        }
      }
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const loc = locatorFor(byId.get(id));
        const element = bags.elements.find((item) => item.stepId === id);
        const useLoc = materialLoc ?? (resolvedMaterial?.locator ?? null);
        if (element && useLoc && !element.materialLocators.includes(useLoc)) element.materialLocators.push(useLoc);
        if (resolvedMaterial && loc && !resolvedMaterial.associatedObjectLocators.includes(loc)) {
          resolvedMaterial.associatedObjectLocators.push(loc);
        }
      }
    } else if (type === "IFCRELASSOCIATESCLASSIFICATION") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const classLoc = relating ? locatorFor(byId.get(relating)) : null;
      const classification = relating ? bags.classifications.find((item) => item.stepId === relating) : undefined;
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const loc = locatorFor(byId.get(id));
        if (classification && loc && !classification.associatedObjectLocators.includes(loc)) classification.associatedObjectLocators.push(loc);
        const element = bags.elements.find((item) => item.stepId === id);
        if (element && classLoc && !element.classificationLocators.includes(classLoc)) element.classificationLocators.push(classLoc);
        const space = bags.spaces.find((item) => item.stepId === id);
        if (space && classLoc) {
          space.limitations = [...new Set([...space.limitations, "classification/reference metadata is preserved as stored"])].slice(0, MAX_IFC_LIMITATIONS_PER_RECORD);
        }
      }
    } else if (type === "IFCRELASSOCIATESDOCUMENT") {
      const related = stepAsRefList(entity.args[4]);
      const relating = stepAsRef(entity.args[5]);
      const docLoc = relating ? locatorFor(byId.get(relating)) : null;
      const doc = relating ? bags.documentReferences.find((item) => item.stepId === relating) : undefined;
      for (const id of related.slice(0, bags.limits.maxReferencesPerEntity)) {
        const loc = locatorFor(byId.get(id));
        if (doc && loc && !doc.associatedObjectLocators.includes(loc)) doc.associatedObjectLocators.push(loc);
        const element = bags.elements.find((item) => item.stepId === id);
        if (element && docLoc && !element.documentLocators.includes(docLoc)) element.documentLocators.push(docLoc);
      }
    }
  }

  // Material layer names: IFCMATERIALLAYERSET -> layers -> IFCMATERIAL
  for (const entity of read.entities) {
    if (entity.entityType !== "IFCMATERIALLAYERSET" && entity.entityType !== "IFCMATERIALCONSTITUENTSET") continue;
    const set = bags.materials.find((item) => item.stepId === entity.stepId);
    const layers = stepAsRefList(entity.args[0]);
    for (const layerId of layers) {
      const layer = byId.get(layerId);
      const materialRef = layer ? stepAsRef(layer.args[0]) : null;
      const material = materialRef ? bags.materials.find((item) => item.stepId === materialRef) : undefined;
      const layerName = material?.name ?? clipIfcText(stepAsString(layer?.args[0] ?? undefined));
      if (set && layerName && !set.layerNames.includes(layerName)) set.layerNames.push(layerName);
      if (material && set) {
        for (const locator of set.associatedObjectLocators) {
          if (!material.associatedObjectLocators.includes(locator)) material.associatedObjectLocators.push(locator);
        }
      }
    }
  }

  // Fill unit labels on properties/quantities from unit records.
  const unitByLocator = new Map(bags.units.map((unit) => [unit.locator, unit]));
  for (const property of bags.properties) {
    if (property.unitLocator) property.unitLabel = unitByLocator.get(property.unitLocator)?.label ?? null;
  }
  for (const quantity of bags.quantities) {
    if (quantity.unitLocator) quantity.unitLabel = unitByLocator.get(quantity.unitLocator)?.label ?? null;
  }
}

function buildDocumentFacts(decision: IfcFormatDecision, read: StepReadResult, fallback: boolean): IfcDocumentFacts {
  const declared = read.header.schemas[0] ?? null;
  const schema = ifcSchemaFromDeclared(declared);
  const limitations = [...decision.limitations, ...schema.limitations];
  if (fallback) limitations.push("the file was decoded with a single-byte fallback; characters outside it may not read exactly");
  return {
    format: "IFC_SPF",
    schema,
    header: {
      description: read.header.description,
      fileName: read.header.fileName,
      timestamp: read.header.timestamp,
      author: read.header.author,
      organization: read.header.organization,
      preprocessor: read.header.preprocessor,
      originatingSystem: read.header.originatingSystem,
    },
    limitations: [...new Set(limitations)].slice(0, MAX_IFC_LIMITATIONS),
  };
}

export function inspectIfcDocument(
  bytes: Uint8Array,
  options: { filename?: string | null; mimeType?: string | null; limits?: Partial<IfcInspectionLimits> } = {},
): IfcInspection {
  const limits: IfcInspectionLimits = { ...DEFAULT_IFC_LIMITS, ...(options.limits ?? {}) };
  const decision = detectIfcFormat({ bytes, filename: options.filename, mimeType: options.mimeType });
  if (!decision.supported) {
    throw new IfcInspectionError(`IFC_UNSUPPORTED_${decision.format}`, decision.reason);
  }
  const { text, usedFallback } = decodeIfcText(bytes);
  let read: StepReadResult;
  try {
    read = readIfcStep(text, { maxEntities: limits.maxEntities });
  } catch (error) {
    if (error instanceof IfcStepReadError) {
      throw new IfcInspectionError(error.code, error.message);
    }
    throw new IfcInspectionError("IFC_UNREADABLE", "the IFC file could not be read safely");
  }
  const bags = newBags(limits);
  for (const entity of read.entities) inspectEntity(entity, bags);
  applyRelationships(read, bags);

  if (read.truncated) addLimitation(bags, `more than ${limits.maxEntities} STEP entities were present; the remainder were not retained`);
  if (bags.counters.elementsTruncated) addLimitation(bags, `more than ${limits.maxRetainedElements} product entities were retained; the remainder were counted as an ingestion metric only`);
  if (bags.counters.spacesTruncated) addLimitation(bags, `more than ${limits.maxSpaces} spaces were declared; the remainder were not retained`);
  if (bags.counters.storeysTruncated) addLimitation(bags, `more than ${limits.maxStoreys} building storeys were declared; the remainder were not retained`);
  if (bags.counters.systemsTruncated) addLimitation(bags, `more than ${limits.maxSystems} systems/groups were declared; the remainder were not retained`);
  if (bags.counters.propertiesTruncated) addLimitation(bags, `more than ${limits.maxProperties} properties were declared; the remainder were not retained`);
  if (bags.counters.propertySetsTruncated) addLimitation(bags, `more than ${limits.maxPropertySets} property sets were declared; the remainder were not retained`);
  if (bags.counters.quantitiesTruncated) addLimitation(bags, `more than ${limits.maxQuantities} quantities were declared; the remainder were not retained`);
  if (bags.counters.materialsTruncated) addLimitation(bags, `more than ${limits.maxMaterials} materials were declared; the remainder were not retained`);
  if (bags.documentReferences.length > 0) addLimitation(bags, IFC_EXTERNAL_REFERENCE_LIMITATION);
  for (const limitation of read.limitations) addLimitation(bags, limitation);

  const truncated = read.truncated
    || Object.values(bags.counters).some(Boolean);

  const document = buildDocumentFacts(decision, read, usedFallback);
  const inspectedProductCount = bags.elements.length;

  return {
    format: "IFC_SPF",
    sizeBytes: bytes.byteLength,
    document,
    project: bags.project,
    sites: bags.sites,
    buildings: bags.buildings,
    storeys: bags.storeys,
    spaces: bags.spaces,
    elements: bags.elements,
    types: bags.types,
    propertySets: bags.propertySets,
    properties: bags.properties,
    quantities: bags.quantities,
    units: bags.units,
    materials: bags.materials,
    systems: bags.systems,
    classifications: bags.classifications,
    documentReferences: bags.documentReferences,
    placements: bags.placements,
    representations: bags.representations,
    entityCount: read.entityCount,
    entityRecordsRetained: read.entities.length,
    entityTypeCounts: bags.entityTypeCounts,
    truncated,
    limitations: [...new Set([
      IFC_BASELINE_LIMITATION,
      IFC_NO_COUNT_LIMITATION,
      ...(inspectedProductCount > 0 ? [`the model contains ${inspectedProductCount} inspected product entit${inspectedProductCount === 1 ? "y" : "ies"}`] : []),
      ...document.limitations,
      ...bags.limitations,
    ])].slice(0, MAX_IFC_LIMITATIONS),
  };
}
