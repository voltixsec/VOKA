import type { ObservationReliability } from "./PdfObservations";
import { OBSERVATION_STATUS, type ObservationStatus } from "./PdfObservations";

/**
 * Phase 2A-8: governed textual IFC / BIM evidence model.
 *
 * This module owns the BIM evidence vocabulary and the conservative rules that
 * turn STEP entities into project/site/building/storey/space hierarchy,
 * elements, types, property sets, declared quantities, units, materials,
 * systems, classifications, document references, placement/representation
 * metadata, and bounded semantic candidates. It holds no parser and no
 * file-format code: the inspector owns bytes, this module owns meaning.
 *
 * Hard rules, enforced by construction:
 * - NOTHING here is approved. A GlobalId is identity evidence, a Name is a
 *   name, a Manufacturer property is a literal. None of them is a product
 *   selection, a supplier, an approved device, a requirement, a BOM item, or a
 *   procurement quantity;
 * - NOTHING here is counted as engineering quantity. Individual elements stay
 *   inspectable; entity totals are ingestion metrics only;
 * - quantities stored in IFC (IFCQUANTITY*) are DECLARED model evidence. VOKA
 *   never calculates length, area, volume, or equipment count from geometry;
 * - units are declared or unknown. Missing units stay unknown. No conversion
 *   exists anywhere in this model (3500 mm is never rewritten as 3.5 m);
 * - provenance is STEP, not paper. An IFC model has no PDF page, so
 *   `pageNumber` is always null. Locators use the STEP entity id;
 * - GlobalId is preserved exactly and is never regenerated. STEP id (#123) and
 *   GlobalId are distinct identifiers;
 * - spatial containment and aggregation are recorded ONLY where IFC
 *   relationships explicitly support them. Coordinates never invent storeys;
 * - external document/classification references are metadata only and are
 *   never fetched, opened, or resolved;
 * - geometry is not tessellated, meshed, or measured. Placement and
 *   representation records are structural metadata;
 * - every structure is bounded. Exceeding a cap truncates deterministically
 *   and the truncation is disclosed.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** What the bytes actually are. Only `IFC_SPF` is inspectable in this phase. */
export const IFC_FORMATS = [
  "IFC_SPF",
  "IFC_ZIP",
  "IFC_BINARY",
  "RVT",
  "RFA",
  "DWG",
  "DXF",
  "DGN",
  "NWC",
  "NWD",
  "OVERSIZED",
  "NOT_AN_IFC_FILE",
  "MALFORMED_STEP",
  "UNKNOWN",
] as const;
export type IfcFormat = (typeof IFC_FORMATS)[number];

export const SUPPORTED_IFC_FORMATS: readonly IfcFormat[] = ["IFC_SPF"];

/** Declared FILE_SCHEMA families VOKA can inspect generically. */
export const IFC_SCHEMA_FAMILIES = ["IFC2X3", "IFC4", "IFC4X3", "OTHER"] as const;
export type IfcSchemaFamily = (typeof IFC_SCHEMA_FAMILIES)[number];

/**
 * Bounded, evidence-backed relationships only.
 *
 * Deliberately absent, and never added by inference: CONNECTED_TO, FEEDS,
 * SUPPLIES, PIPE_ROUTE, CABLE_ROUTE, AIRFLOW, CONTROL_LOOP. Those are
 * engineering topology. A raw IFCRELCONNECTS* record may be preserved as OTHER
 * evidence; it is never upgraded to engineering truth.
 */
export const IFC_RELATIONSHIP_KINDS = [
  "SPATIALLY_CONTAINED_IN",
  "AGGREGATES",
  "DEFINED_BY_TYPE",
  "DEFINED_BY_PROPERTY_SET",
  "ASSIGNED_TO_SYSTEM",
  "ASSOCIATED_WITH_MATERIAL",
  "ASSOCIATED_WITH_CLASSIFICATION",
  "HAS_DOCUMENT_REFERENCE",
] as const;
export type IfcRelationshipKind = (typeof IFC_RELATIONSHIP_KINDS)[number];

export const IFC_SEMANTIC_SOURCES = [
  "ENTITY_TYPE",
  "NAME",
  "OBJECT_TYPE",
  "TAG",
  "PREDEFINED_TYPE",
  "ASSIGNED_TYPE",
  "PROPERTY_VALUE",
  "SYSTEM_MEMBERSHIP",
  "CLASSIFICATION",
  "MATERIAL",
] as const;
export type IfcSemanticSource = (typeof IFC_SEMANTIC_SOURCES)[number];

export const IFC_PROPERTY_FORMS = [
  "SINGLE_VALUE",
  "ENUMERATED_VALUE",
  "LIST_VALUE",
  "BOUNDED_VALUE",
  "REFERENCE_VALUE",
  "OTHER",
] as const;
export type IfcPropertyForm = (typeof IFC_PROPERTY_FORMS)[number];

export const IFC_QUANTITY_KINDS = [
  "LENGTH",
  "AREA",
  "VOLUME",
  "COUNT",
  "WEIGHT",
  "TIME",
  "OTHER",
] as const;
export type IfcQuantityKind = (typeof IFC_QUANTITY_KINDS)[number];

export const IFC_SPATIAL_KINDS = ["PROJECT", "SITE", "BUILDING", "BUILDING_STOREY", "SPACE"] as const;
export type IfcSpatialKind = (typeof IFC_SPATIAL_KINDS)[number];

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const MAX_IFC_BYTES = 25 * 1024 * 1024;
export const MAX_STEP_ENTITIES = 50_000;
export const MAX_IFC_RELATIONSHIPS = 8_000;
export const MAX_PROPERTIES = 8_000;
export const MAX_PROPERTY_SETS = 2_000;
export const MAX_QUANTITIES = 2_000;
export const MAX_ELEMENTS = 8_000;
export const MAX_SPACES = 2_000;
export const MAX_STOREYS = 200;
export const MAX_SYSTEMS = 500;
export const MAX_MATERIALS = 1_000;
export const MAX_PROJECTED_IFC_ENTITIES = 24;
export const MAX_REFERENCES_PER_ENTITY = 24;
export const MAX_STEP_NESTING_DEPTH = 32;
export const MAX_STEP_RECORD_LENGTH = 64_000;
export const MAX_RETAINED_ELEMENTS = 1_500;
export const MAX_RETAINED_SPATIAL = 400;
export const MAX_IFC_SEMANTIC_CANDIDATES = 200;
export const MAX_IFC_TEXT_CHARACTERS = 480;
export const MAX_IFC_LIMITATIONS_PER_RECORD = 6;
export const MAX_IFC_LIMITATIONS = 12;
export const MAX_CLASSIFICATIONS = 400;
export const MAX_DOCUMENT_REFERENCES = 64;
export const MAX_TYPE_OBJECTS = 2_000;
export const MAX_PLACEMENTS = 1_000;
export const MAX_REPRESENTATIONS = 1_000;
export const MAX_UNITS = 200;
export const MAX_RAW_STEP_TEXT = 1_200;

/** An IFC model has no PDF page. Stated so no consumer can invent one. */
export const IFC_PAGE_NUMBER: null = null;

export const IFC_BASELINE_LIMITATION =
  "BIM evidence carries STEP entity id, GlobalId, entity type, and Name provenance instead of page numbers; declared quantities were preserved as the model stored them and were not calculated from geometry; no unit was inferred or converted; and no entity total is an engineering quantity";

export const IFC_SEMANTIC_BASELINE_LIMITATION =
  "semantic candidates are observed BIM readings only: not approved, not selected, not counted, and never promoted into a requirement, BOM, quotation line, product selection, supplier, or procurement record";

export const IFC_NO_COUNT_LIMITATION =
  "entity, element, space, and system totals in this inspection are ingestion metrics describing how much of the file VOKA read; they are not equipment counts, quantities, or takeoff results";

export const IFC_QUANTITY_LIMITATION =
  "declared IFC quantities are model metadata the file stored; VOKA did not calculate, recompute, or verify them from geometry";

export const IFC_EXTERNAL_REFERENCE_LIMITATION =
  "the model references an external document which was not opened, fetched, or resolved; only this metadata was recorded";

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

export type IfcLocatorFields = {
  stepId: number;
  entityType?: string | null;
  globalId?: string | null;
  name?: string | null;
  tag?: string | null;
};

/** "IFC:#512" / "IFC:#512:IFCFIRESUPPRESSIONTERMINAL". */
export function formatIfcLocator(fields: IfcLocatorFields): string {
  const type = fields.entityType?.trim();
  return type ? `IFC:#${fields.stepId}:${type.toUpperCase()}` : `IFC:#${fields.stepId}`;
}

/** Human-readable trace used in briefs: never a page number. */
export function formatIfcHumanTrace(fields: IfcLocatorFields): string {
  const parts = [`IFC:#${fields.stepId}`];
  if (fields.globalId) parts.push(`GlobalId=${fields.globalId}`);
  if (fields.entityType) parts.push(`type=${fields.entityType.toUpperCase()}`);
  if (fields.name) parts.push(`name=${fields.name}`);
  if (fields.tag) parts.push(`tag=${fields.tag}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Reads the FILE_SCHEMA identifier into a family VOKA can talk about.
 *
 * The exact declared schema string is always preserved. The family is a
 * coarse grouping so IFC4X3 can be inspected generically with an explicit
 * limitation rather than pretending schema-specific semantics are understood.
 */
export function ifcSchemaFamilyFromDeclared(declared: string | null): IfcSchemaFamily {
  if (!declared) return "OTHER";
  const upper = declared.trim().toUpperCase();
  if (upper.startsWith("IFC2X3")) return "IFC2X3";
  if (upper.startsWith("IFC4X3")) return "IFC4X3";
  if (upper.startsWith("IFC4")) return "IFC4";
  return "OTHER";
}

export type IfcSchemaEvidence = {
  /** Exact FILE_SCHEMA identifier, e.g. "IFC4" or "IFC4X3_ADD2". */
  declared: string | null;
  family: IfcSchemaFamily;
  /** True when VOKA inspects this schema generically rather than fully. */
  genericInspection: boolean;
  locator: string;
  limitations: string[];
};

export function ifcSchemaFromDeclared(declared: string | null): IfcSchemaEvidence {
  const family = ifcSchemaFamilyFromDeclared(declared);
  if (!declared) {
    return {
      declared: null,
      family: "OTHER",
      genericInspection: true,
      locator: "IFC:HEADER:FILE_SCHEMA",
      limitations: ["the file did not declare a FILE_SCHEMA, so the IFC schema remains unknown"],
    };
  }
  const generic = family === "IFC4X3" || family === "OTHER";
  const limitations: string[] = [];
  if (family === "IFC4X3") {
    limitations.push(`the file declares schema ${declared}; VOKA inspected generic entity evidence only and did not apply IFC4X3-specific semantics`);
  } else if (family === "OTHER") {
    limitations.push(`the file declares schema ${declared}, which is outside IFC2X3/IFC4; generic entity evidence was preserved without schema-specific interpretation`);
  }
  return {
    declared,
    family,
    genericInspection: generic,
    locator: "IFC:HEADER:FILE_SCHEMA",
    limitations,
  };
}

// ---------------------------------------------------------------------------
// Units — declared or unknown, never inferred, never converted
// ---------------------------------------------------------------------------

const SI_UNIT_NAMES: Readonly<Record<string, { en: string; ar: string }>> = {
  METRE: { en: "metre", ar: "متر" },
  SQUARE_METRE: { en: "square metre", ar: "متر مربع" },
  CUBIC_METRE: { en: "cubic metre", ar: "متر مكعب" },
  GRAM: { en: "gram", ar: "غرام" },
  SECOND: { en: "second", ar: "ثانية" },
  AMPERE: { en: "ampere", ar: "أمبير" },
  KELVIN: { en: "kelvin", ar: "كلفن" },
  RADIAN: { en: "radian", ar: "راديان" },
  STERADIAN: { en: "steradian", ar: "ستراديان" },
  HERTZ: { en: "hertz", ar: "هرتز" },
  NEWTON: { en: "newton", ar: "نيوتن" },
  PASCAL: { en: "pascal", ar: "باسكال" },
  JOULE: { en: "joule", ar: "جول" },
  WATT: { en: "watt", ar: "واط" },
  VOLT: { en: "volt", ar: "فولت" },
  LUMEN: { en: "lumen", ar: "لومن" },
  LUX: { en: "lux", ar: "لكس" },
  DEGREE_CELSIUS: { en: "degree Celsius", ar: "درجة مئوية" },
};

const SI_PREFIXES: Readonly<Record<string, { en: string; ar: string }>> = {
  EXA: { en: "exa", ar: "إكسا" },
  PETA: { en: "peta", ar: "بيتا" },
  TERA: { en: "tera", ar: "تيرا" },
  GIGA: { en: "giga", ar: "جيجا" },
  MEGA: { en: "mega", ar: "ميجا" },
  KILO: { en: "kilo", ar: "كيلو" },
  HECTO: { en: "hecto", ar: "هكتو" },
  DECA: { en: "deca", ar: "ديكا" },
  DECI: { en: "deci", ar: "ديسي" },
  CENTI: { en: "centi", ar: "سنتي" },
  MILLI: { en: "milli", ar: "ملي" },
  MICRO: { en: "micro", ar: "ميكرو" },
  NANO: { en: "nano", ar: "نانو" },
  PICO: { en: "pico", ar: "بيكو" },
  FEMTO: { en: "femto", ar: "فيمتو" },
  ATTO: { en: "atto", ar: "أتو" },
};

export type IfcUnitEvidence = {
  stepId: number;
  entityType: string;
  /** Verbatim unit type enum, e.g. LENGTHUNIT. */
  unitType: string | null;
  /** Verbatim SI name enum, e.g. METRE. */
  siName: string | null;
  /** Verbatim SI prefix enum, e.g. MILLI; null when absent. */
  prefix: string | null;
  /** Conversion-based unit name, when present. */
  conversionName: string | null;
  /** Plain reading of the declared unit; null when unknown. */
  label: string | null;
  labelArabic: string | null;
  declared: boolean;
  locator: string;
  limitations: string[];
};

/**
 * Builds a unit record from declared IFCSIUNIT / conversion-based fields.
 *
 * The label is a reading of the enums the file stored. It is not a conversion
 * factor and is never applied to any quantity or coordinate.
 */
export function ifcUnitLabel(prefix: string | null, siName: string | null, conversionName: string | null): {
  label: string | null;
  labelArabic: string | null;
} {
  if (conversionName) return { label: conversionName, labelArabic: null };
  if (!siName) return { label: null, labelArabic: null };
  const unit = SI_UNIT_NAMES[siName];
  const prefixEntry = prefix ? SI_PREFIXES[prefix] : null;
  if (!unit) {
    const raw = prefix ? `${prefix} ${siName}` : siName;
    return { label: raw.replace(/_/gu, " ").toLowerCase(), labelArabic: null };
  }
  if (!prefixEntry) return { label: unit.en, labelArabic: unit.ar };
  return {
    label: `${prefixEntry.en} ${unit.en}`,
    labelArabic: `${prefixEntry.ar}${unit.ar}`,
  };
}

// ---------------------------------------------------------------------------
// Core records
// ---------------------------------------------------------------------------

export type IfcIdentity = {
  stepId: number;
  entityType: string;
  globalId: string | null;
  name: string | null;
  description: string | null;
  objectType: string | null;
  tag: string | null;
  predefinedType: string | null;
  longName: string | null;
  locator: string;
};

export type IfcSpatialEvidence = IfcIdentity & {
  kind: IfcSpatialKind;
  /** Parent spatial locator when an explicit aggregation named one. */
  parentLocator: string | null;
  /** Declared elevation when the entity stored one; never inferred. */
  elevation: number | null;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcElementEvidence = IfcIdentity & {
  /** Spatial container locator when IFCRELCONTAINEDINSPATIALSTRUCTURE named one. */
  containerLocator: string | null;
  typeLocator: string | null;
  typeName: string | null;
  systemLocators: string[];
  materialLocators: string[];
  propertySetLocators: string[];
  quantitySetLocators: string[];
  classificationLocators: string[];
  documentLocators: string[];
  placementLocator: string | null;
  representationLocator: string | null;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcTypeEvidence = IfcIdentity & {
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcPropertyEvidence = {
  stepId: number;
  form: IfcPropertyForm;
  name: string;
  /** Literal/raw value exactly as stored (joined for list/bounded forms). */
  rawValue: string | null;
  unitLocator: string | null;
  unitLabel: string | null;
  propertySetName: string | null;
  propertySetLocator: string | null;
  /** Entities this property set defines, as locators. */
  definedObjectLocators: string[];
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcPropertySetEvidence = {
  stepId: number;
  name: string | null;
  globalId: string | null;
  propertyLocators: string[];
  definedObjectLocators: string[];
  locator: string;
  limitations: string[];
};

export type IfcQuantityEvidence = {
  stepId: number;
  kind: IfcQuantityKind;
  name: string;
  /** Declared numeric value the IFC stored. Never recalculated. */
  value: number | null;
  rawValue: string | null;
  unitLocator: string | null;
  unitLabel: string | null;
  quantitySetName: string | null;
  quantitySetLocator: string | null;
  definedObjectLocators: string[];
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcMaterialEvidence = {
  stepId: number;
  entityType: string;
  name: string | null;
  layerNames: string[];
  associatedObjectLocators: string[];
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcSystemEvidence = IfcIdentity & {
  memberLocators: string[];
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcClassificationEvidence = {
  stepId: number;
  entityType: string;
  location: string | null;
  identification: string | null;
  name: string | null;
  sourceName: string | null;
  associatedObjectLocators: string[];
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcDocumentReferenceEvidence = {
  stepId: number;
  entityType: string;
  location: string | null;
  identification: string | null;
  name: string | null;
  associatedObjectLocators: string[];
  opened: false;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

export type IfcPlacementEvidence = {
  stepId: number;
  entityType: string;
  /** Raw coordinate values exactly as stored; never transformed. */
  coordinates: number[];
  directionRatios: number[];
  relativeToLocator: string | null;
  locator: string;
  limitations: string[];
};

export type IfcRepresentationEvidence = {
  stepId: number;
  entityType: string;
  identifier: string | null;
  representationType: string | null;
  itemStepIds: number[];
  locator: string;
  limitations: string[];
};

export type IfcRelationship = {
  kind: IfcRelationshipKind;
  subject: string;
  object: string;
  reason: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type IfcSemanticCandidate = {
  id: string;
  label: string;
  sources: IfcSemanticSource[];
  evidenceLocators: string[];
  reasons: string[];
  corroborationCount: number;
  confidence: number;
  reliability: ObservationReliability;
  status: ObservationStatus;
  conflictsWith: string[];
  limitations: string[];
};

export type IfcHeaderFacts = {
  description: string | null;
  fileName: string | null;
  timestamp: string | null;
  author: string | null;
  organization: string | null;
  preprocessor: string | null;
  originatingSystem: string | null;
};

export type IfcDocumentFacts = {
  format: IfcFormat;
  schema: IfcSchemaEvidence;
  header: IfcHeaderFacts;
  limitations: string[];
};

export type IfcInspection = {
  format: "IFC_SPF";
  sizeBytes: number;
  document: IfcDocumentFacts;
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
  /** Total STEP entity records read, including those beyond retention caps. */
  entityCount: number;
  entityRecordsRetained: number;
  entityTypeCounts: Record<string, number>;
  truncated: boolean;
  limitations: string[];
};

export type IfcAnalysis = {
  format: "IFC_SPF";
  inspection: IfcInspection;
  relationships: IfcRelationship[];
  relationshipCount: number;
  candidates: IfcSemanticCandidate[];
  truncated: boolean;
  limitations: string[];
};

/**
 * Bounded shape persisted in `SourceArtifact.extractedPages` for an IFC model.
 *
 * Version 5 keeps it distinct from PDF (2), workbook (3), and DXF (4). Only
 * structural counts, declared schema, and limitations are stored — never an
 * entity dump.
 */
export type StoredIfcModel = {
  version: 5;
  kind: "IFC";
  schema: string | null;
  schemaFamily: IfcSchemaFamily;
  projectName: string | null;
  siteCount: number;
  buildingCount: number;
  storeyCount: number;
  spaceCount: number;
  elementCount: number;
  systemCount: number;
  truncated: boolean;
  limitations: string[];
};

export function isStoredIfcModel(value: unknown): value is StoredIfcModel {
  const candidate = value as Partial<StoredIfcModel> | null;
  return Boolean(
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
    && candidate.version === 5 && candidate.kind === "IFC" && typeof candidate.elementCount === "number",
  );
}

// ---------------------------------------------------------------------------
// Entity classification (generic — not a validity whitelist)
// ---------------------------------------------------------------------------

const SPATIAL_TYPES: Readonly<Record<string, IfcSpatialKind>> = {
  IFCPROJECT: "PROJECT",
  IFCSITE: "SITE",
  IFCBUILDING: "BUILDING",
  IFCBUILDINGSTOREY: "BUILDING_STOREY",
  IFCSPACE: "SPACE",
};

export function spatialKindForIfcType(entityType: string): IfcSpatialKind | null {
  return SPATIAL_TYPES[entityType.toUpperCase()] ?? null;
}

export function isIfcRelationshipType(entityType: string): boolean {
  return entityType.toUpperCase().startsWith("IFCREL");
}

export function isIfcTypeObjectType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  return upper === "IFCTYPEOBJECT" || upper === "IFCELEMENTTYPE" || (upper.startsWith("IFC") && upper.endsWith("TYPE") && upper !== "IFCTYPEOBJECT");
}

export function isIfcPropertyType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  return upper.startsWith("IFCPROPERTY") && upper !== "IFCPROPERTYSET" && upper !== "IFCPROPERTYSETDEFINITION";
}

export function isIfcQuantityType(entityType: string): boolean {
  return entityType.toUpperCase().startsWith("IFCQUANTITY");
}

export function isIfcMaterialType(entityType: string): boolean {
  return entityType.toUpperCase().startsWith("IFCMATERIAL");
}

export function isIfcSystemType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  return upper === "IFCSYSTEM" || upper === "IFCDISTRIBUTIONSYSTEM" || upper === "IFCGROUP" || upper === "IFCZONE";
}

export function isIfcPlacementType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  return upper === "IFCLOCALPLACEMENT" || upper.startsWith("IFCAXIS2PLACEMENT") || upper === "IFCCARTESIANPOINT" || upper === "IFCDIRECTION";
}

export function isIfcRepresentationType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  return upper === "IFCPRODUCTDEFINITIONSHAPE" || upper === "IFCSHAPEREPRESENTATION" || upper === "IFCSHAPEREPRESENTATION";
}

/**
 * True when an unknown IFC entity still looks like an IfcRoot product that
 * should remain inspectable as a generic element. Deliberately not a tiny
 * whitelist: unknown types stay inspectable where they carry a GlobalId and
 * are not a known non-product construct.
 */
export function isGenericIfcElementType(entityType: string): boolean {
  const upper = entityType.toUpperCase();
  if (!upper.startsWith("IFC")) return false;
  if (spatialKindForIfcType(upper)) return false;
  if (isIfcRelationshipType(upper)) return false;
  if (isIfcTypeObjectType(upper)) return false;
  if (isIfcPropertyType(upper) || upper === "IFCPROPERTYSET" || upper === "IFCELEMENTQUANTITY") return false;
  if (isIfcQuantityType(upper)) return false;
  if (isIfcSystemType(upper)) return false;
  if (isIfcMaterialType(upper)) return false;
  if (isIfcPlacementType(upper) || isIfcRepresentationType(upper)) return false;
  if (upper.startsWith("IFCUNIT") || upper === "IFCSIUNIT" || upper === "IFCCONVERSIONBASEDUNIT" || upper === "IFCDERIVEDUNIT" || upper === "IFCMEASUREWITHUNIT") return false;
  if (upper.startsWith("IFCCLASSIFICATION") || upper.startsWith("IFCDOCUMENT") || upper === "IFCEXTERNALREFERENCE") return false;
  if (upper.startsWith("IFCOWNERHISTORY") || upper.startsWith("IFCAPPLICATION") || upper.startsWith("IFCPERSON") || upper.startsWith("IFCORGANIZATION") || upper.startsWith("IFCPOSTALADDRESS") || upper.startsWith("IFCTELECOMADDRESS")) return false;
  if (upper.includes("GEOMETRICREPRESENTATION") || upper.includes("REPRESENTATIONCONTEXT") || upper === "IFCMAPPEDITEM" || upper.startsWith("IFCSTYLED") || upper.startsWith("IFCCOLOUR") || upper.startsWith("IFCSURFACESTYLE")) return false;
  if (upper.startsWith("IFCPROFILE") || upper.startsWith("IFCEXTRUDEDAREASOLID") || upper.startsWith("IFCBREP") || upper.startsWith("IFCFACE") || upper.startsWith("IFCPOLYLOOP") || upper.startsWith("IFCINDEXED") || upper.startsWith("IFCTRIANGULATED") || upper.startsWith("IFCBOOLEAN")) return false;
  return true;
}

export function quantityKindForIfcType(entityType: string): IfcQuantityKind {
  switch (entityType.toUpperCase()) {
    case "IFCQUANTITYLENGTH": return "LENGTH";
    case "IFCQUANTITYAREA": return "AREA";
    case "IFCQUANTITYVOLUME": return "VOLUME";
    case "IFCQUANTITYCOUNT": return "COUNT";
    case "IFCQUANTITYWEIGHT": return "WEIGHT";
    case "IFCQUANTITYTIME": return "TIME";
    default: return "OTHER";
  }
}

export function propertyFormForIfcType(entityType: string): IfcPropertyForm {
  switch (entityType.toUpperCase()) {
    case "IFCPROPERTYSINGLEVALUE": return "SINGLE_VALUE";
    case "IFCPROPERTYENUMERATEDVALUE": return "ENUMERATED_VALUE";
    case "IFCPROPERTYLISTVALUE": return "LIST_VALUE";
    case "IFCPROPERTYBOUNDEDVALUE": return "BOUNDED_VALUE";
    case "IFCPROPERTYREFERENCEVALUE": return "REFERENCE_VALUE";
    default: return "OTHER";
  }
}

// ---------------------------------------------------------------------------
// Conservative semantic vocabulary
// ---------------------------------------------------------------------------

export function ifcNameTokens(name: string): string[] {
  if (!name) return [];
  return name
    .replace(/[\u0640]/gu, "")
    .split(/[^A-Za-z0-9\u0600-\u06FF]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .map((token) => token.toUpperCase());
}

const SEMANTIC_PHRASES: ReadonlyArray<{ tokens: readonly string[]; phrase: string }> = [
  { tokens: ["SMOKE", "DETECTOR"], phrase: "Smoke Detector" },
  { tokens: ["SD"], phrase: "Smoke Detector" },
  { tokens: ["HEAT", "DETECTOR"], phrase: "Heat Detector" },
  { tokens: ["HD"], phrase: "Heat Detector" },
  { tokens: ["FIRE", "ALARM"], phrase: "Fire Alarm" },
  { tokens: ["FIRE", "SUPPRESSION"], phrase: "Fire Suppression Terminal" },
  { tokens: ["SPRINKLER"], phrase: "Sprinkler" },
  { tokens: ["CCTV"], phrase: "CCTV Camera" },
  { tokens: ["CAMERA"], phrase: "CCTV Camera" },
  { tokens: ["LIGHT", "FIXTURE"], phrase: "Light Fixture" },
  { tokens: ["LUMINAIRE"], phrase: "Luminaire" },
  { tokens: ["AIR", "TERMINAL"], phrase: "Air Terminal" },
  { tokens: ["DIFFUSER"], phrase: "Air Diffuser" },
  { tokens: ["DOOR"], phrase: "Door" },
  { tokens: ["WINDOW"], phrase: "Window" },
  { tokens: ["WALL"], phrase: "Wall" },
  { tokens: ["SLAB"], phrase: "Slab" },
  { tokens: ["BEAM"], phrase: "Beam" },
  { tokens: ["COLUMN"], phrase: "Column" },
  { tokens: ["SENSOR"], phrase: "Sensor" },
  { tokens: ["ALARM"], phrase: "Alarm" },
  { tokens: ["FURNISHING"], phrase: "Furnishing" },
];

export function phraseForIfcTokens(tokens: readonly string[]): string | null {
  if (!tokens.length) return null;
  for (const entry of SEMANTIC_PHRASES) {
    if (entry.tokens.every((token) => tokens.includes(token))) return entry.phrase;
  }
  return null;
}

/**
 * A readable phrase from an IFC class name such as IFCFLOWTERMINAL.
 * Unknown classes stay as a spaced reading of the type, never a guess.
 */
export function phraseForIfcEntityType(entityType: string): string | null {
  const upper = entityType.toUpperCase();
  if (!upper.startsWith("IFC")) return null;
  const rest = upper.slice(3);
  const mapped: Record<string, string> = {
    FLOWTERMINAL: "Flow Terminal",
    FLOWCONTROLLER: "Flow Controller",
    DISTRIBUTIONELEMENT: "Distribution Element",
    ELECTRICDISTRIBUTIONPOINT: "Electric Distribution Point",
    FIRESUPPRESSIONTERMINAL: "Fire Suppression Terminal",
    LIGHTFIXTURE: "Light Fixture",
    AIRTERMINAL: "Air Terminal",
    FURNISHINGELEMENT: "Furnishing",
    BUILDINGELEMENTPROXY: "Building Element",
  };
  if (mapped[rest]) return mapped[rest];
  const tokens = rest.replace(/TYPE$/u, "").match(/[A-Z]+?(?=[A-Z][A-Z]+|$)|[A-Z][A-Z]+/gu) ?? ifcNameTokens(rest);
  return phraseForIfcTokens(tokens);
}

export function ifcCandidatesConflict(left: IfcSemanticCandidate, right: IfcSemanticCandidate): boolean {
  if (left.id === right.id) return false;
  if (left.label.toUpperCase() === right.label.toUpperCase()) return false;
  return left.evidenceLocators.some((locator) => right.evidenceLocators.includes(locator));
}

export function clipIfcText(value: string | null | undefined, max = MAX_IFC_TEXT_CHARACTERS): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export { OBSERVATION_STATUS as IFC_OBSERVATION_STATUS };
