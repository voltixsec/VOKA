import type { ObservationReliability } from "./PdfObservations";
import { OBSERVATION_STATUS, type ObservationStatus } from "./PdfObservations";

/**
 * Phase 2A-7: governed ASCII DXF / CAD evidence model.
 *
 * This module owns the CAD evidence vocabulary and the conservative rules that
 * turn DXF group codes into layers, blocks, inserts, attributes, text, and
 * bounded semantic candidates. It holds no parser and no file-format code: the
 * inspector owns bytes, this module owns meaning.
 *
 * Hard rules, enforced by construction:
 * - NOTHING here is approved. A block name is a name, a layer name is a name,
 *   and an attribute value is a literal. None of them is a product selection,
 *   an approved device, a requirement, a BOM item, or a procurement quantity;
 * - NOTHING here is counted as engineering quantity. Individual instances are
 *   preserved as evidence; aggregate counts of symbols, inserts, or entities
 *   are runtime ingestion metrics only and are never presented as a quantity,
 *   and no aggregate is ever promoted into anything;
 * - units are declared or unknown. `$INSUNITS` is preserved literally and is
 *   never inferred from coordinates, tenant country, project country, company
 *   settings, the file name, or common construction practice. No conversion
 *   exists anywhere in this model, so a coordinate is never described in
 *   metres, millimetres, or any other unit;
 * - DIMENSION values are DXF metadata. A measurement the drawing stored is
 *   preserved verbatim. VOKA never measures geometry, never recalculates a
 *   dimension, and never claims to have verified one;
 * - provenance is CAD, not paper. A drawing has no PDF page, so `pageNumber`
 *   is always null and no CAD record may ever carry a page number. Locators are
 *   section, handle, owner handle, layer, block, layout, and space;
 * - blocks are never exploded recursively. References are bounded by depth,
 *   and a cyclic reference is detected and disclosed rather than followed;
 * - external references are metadata only. A referenced file path is recorded
 *   and never opened, fetched, or resolved;
 * - every structure is bounded. Exceeding a cap truncates deterministically
 *   and the truncation is disclosed; evidence is never silently dropped.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** What the CAD bytes actually are. Only `ASCII_DXF` is inspectable here. */
export const DXF_FORMATS = ["ASCII_DXF", "BINARY_DXF", "DWG", "DGN", "IFC", "RVT", "OVERSIZED", "NOT_A_CAD_FILE", "UNKNOWN"] as const;
export type DxfFormat = (typeof DXF_FORMATS)[number];

/** Formats VOKA can actually inspect in this phase. */
export const SUPPORTED_DXF_FORMATS: readonly DxfFormat[] = ["ASCII_DXF"];

/**
 * The entity types this phase preserves geometry or text for. Anything else is
 * still reported by name and count so a reviewer knows it exists, but its
 * payload is not modelled.
 */
export const DXF_ENTITY_TYPES = [
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "VERTEX",
  "SEQEND",
  "CIRCLE",
  "ARC",
  "ELLIPSE",
  "SPLINE",
  "POINT",
  "SOLID",
  "3DFACE",
  "TEXT",
  "MTEXT",
  "ATTDEF",
  "ATTRIB",
  "DIMENSION",
  "INSERT",
  "HATCH",
  "VIEWPORT",
  "OTHER",
] as const;
export type DxfEntityType = (typeof DXF_ENTITY_TYPES)[number];

const DXF_ENTITY_TYPE_SET = new Set<string>(DXF_ENTITY_TYPES);
export function isDxfEntityType(value: string): value is DxfEntityType {
  return DXF_ENTITY_TYPE_SET.has(value);
}

/** Where an entity or insert lives. Never merged, never deduplicated. */
export const DXF_SPACES = ["MODEL_SPACE", "PAPER_SPACE", "UNKNOWN_SPACE"] as const;
export type DxfSpace = (typeof DXF_SPACES)[number];

/**
 * What proved an entity's space.
 *
 * `GROUP_67` and `OWNER_HANDLE` are explicit evidence from the file.
 * `BLOCK_OWNER` means the entity was read inside a block that itself declared a
 * space. `SECTION_CONVENTION` is the weakest: the DXF convention that the
 * ENTITIES section holds model-space content, recorded as an assumption rather
 * than a proof. `UNRESOLVED` means the file gave nothing and the space stays
 * unknown instead of being defaulted to model space.
 */
export const DXF_SPACE_ATTRIBUTIONS = ["GROUP_67", "OWNER_HANDLE", "BLOCK_OWNER", "SECTION_CONVENTION", "UNRESOLVED"] as const;
export type DxfSpaceAttribution = (typeof DXF_SPACE_ATTRIBUTIONS)[number];

/**
 * Bounded, evidence-backed relationships only.
 *
 * Deliberately absent, and never added by inference: CONNECTED_TO, FEEDS,
 * CIRCUIT, PIPE_ROUTE, NETWORK_PATH, AIRFLOW, CONTROL_LOOP. Those are
 * engineering topology and belong to a later phase; nothing in a DXF file
 * proves them.
 */
export const DXF_RELATIONSHIP_KINDS = [
  "ENTITY_ON_LAYER",
  "ENTITY_IN_BLOCK",
  "INSERT_REFERENCES_BLOCK",
  "ATTRIBUTE_ON_INSERT",
  "ATTRIBUTE_DEFINITION_IN_BLOCK",
  "TEXT_NEAR_ENTITY_CANDIDATE",
  "BLOCK_NAME_SEMANTIC_CANDIDATE",
  "LAYER_NAME_SEMANTIC_CANDIDATE",
] as const;
export type DxfRelationshipKind = (typeof DXF_RELATIONSHIP_KINDS)[number];

/** Which explicit evidence supported a semantic candidate. */
export const DXF_SEMANTIC_SOURCES = [
  "BLOCK_NAME",
  "LAYER_NAME",
  "ATTRIBUTE_VALUE",
  "NEARBY_TEXT",
  "ENTITY_TYPE",
  "REPEATED_LABEL",
] as const;
export type DxfSemanticSource = (typeof DXF_SEMANTIC_SOURCES)[number];

/** Geometry kinds preserved verbatim as raw CAD fields. */
export const DXF_GEOMETRY_KINDS = ["LINE", "POLYLINE", "CIRCLE", "ARC", "ELLIPSE", "SPLINE", "POINT", "FACE", "NONE"] as const;
export type DxfGeometryKind = (typeof DXF_GEOMETRY_KINDS)[number];

// ---------------------------------------------------------------------------
// Bounds. Every cap is a hard limit; exceeding it truncates and is disclosed.
// ---------------------------------------------------------------------------

/** Maximum drawing size accepted for inspection. Matches the upload policy. */
export const MAX_DXF_BYTES = 25 * 1024 * 1024;
/** Maximum entity records read from the ENTITIES section and block bodies. */
export const MAX_ENTITIES = 25_000;
/** Maximum layer records retained from the LAYER table. */
export const MAX_LAYERS = 2_000;
/** Maximum block definitions retained from the BLOCKS section. */
export const MAX_BLOCKS = 2_000;
/** Maximum entities retained inside one block definition. */
export const MAX_ENTITIES_PER_BLOCK = 500;
/** Maximum vertices retained on one polyline entity. */
export const MAX_VERTICES_PER_ENTITY = 2_000;
/** Maximum TEXT/MTEXT records retained across the drawing. */
export const MAX_TEXT_RECORDS = 2_000;
/** Maximum dimension records retained across the drawing. */
export const MAX_DIMENSION_RECORDS = 1_000;
/** Maximum relationship records retained across the drawing. */
export const MAX_RELATIONSHIPS = 3_000;
/** Maximum entity records retained in the deterministic inspection result. */
export const MAX_RETAINED_ENTITIES = 1_500;
/** Maximum attribute records retained on one insert or block. */
export const MAX_ATTRIBUTES_PER_RECORD = 24;
/** Maximum external-reference records retained. */
export const MAX_EXTERNAL_REFERENCES = 64;
/** Maximum semantic candidates retained. */
export const MAX_SEMANTIC_CANDIDATES = 200;
/**
 * How deep a block may be followed through INSERT chains.
 *
 * A DXF block may insert another block, and a hostile or merely careless file
 * can make that chain cyclic or unbounded. VOKA never explodes blocks to
 * compute anything; depth exists only so a bounded review path terminates.
 */
export const MAX_BLOCK_EXPANSION_DEPTH = 4;
/** Maximum characters retained for one raw text value. */
export const MAX_DXF_TEXT_CHARACTERS = 480;
/** Maximum characters retained for one normalized text value. */
export const MAX_DXF_NORMALIZED_CHARACTERS = 320;
/** Maximum group-code pairs scanned in one file, bounding runtime and memory. */
export const MAX_GROUP_CODES_SCANNED = 4_000_000;
/** Maximum header variables retained. */
export const MAX_HEADER_VARIABLES = 120;
/** Maximum limitations retained per record. */
export const MAX_DXF_LIMITATIONS_PER_RECORD = 6;
/** Maximum limitations retained per drawing. */
export const MAX_DXF_LIMITATIONS = 12;

/**
 * CAD provenance has no PDF page. This constant exists so every CAD record
 * states the truth explicitly instead of leaving a page-shaped hole that a
 * later consumer might fill with an invented number.
 */
export const DXF_PAGE_NUMBER: null = null;

export const DXF_BASELINE_LIMITATION =
  "CAD evidence carries section, handle, layer, block, layout, and space provenance instead of page numbers; coordinates and radii were preserved exactly as the drawing stored them, no unit was inferred or converted, no dimension was measured or recalculated, and no entity count is an engineering quantity";

export const DXF_SEMANTIC_BASELINE_LIMITATION =
  "semantic candidates are observed drawing readings only: not approved, not selected, not counted, and never promoted into a requirement, BOM, quotation line, or procurement record";

export const DXF_NO_COUNT_LIMITATION =
  "entity, insert, and text totals in this inspection are ingestion metrics describing how much of the file VOKA read; they are not equipment counts, quantities, or takeoff results";

// ---------------------------------------------------------------------------
// CAD locators (exact provenance)
// ---------------------------------------------------------------------------

export type DxfLocatorFields = {
  /** "ENTITIES", "BLOCKS", "TABLES", "HEADER", "LAYER", "MODEL_SPACE", "PAPER_SPACE". */
  section: string;
  entityHandle?: string | null;
  ownerHandle?: string | null;
  layerName?: string | null;
  blockName?: string | null;
  layoutName?: string | null;
  space?: DxfSpace | null;
  /** Attribute tag, when the locator points at one attribute. */
  attributeTag?: string | null;
};

/**
 * Builds the exact CAD locator for a piece of evidence.
 *
 * DXF has no page numbers, so a locator is the only way a claim can be traced
 * back. Every locator is built from values the file actually carried; a missing
 * handle is simply omitted rather than replaced with an invented one, because a
 * fabricated handle would point at a different entity than the one described.
 */
export function formatDxfLocator(fields: DxfLocatorFields): string {
  const parts: string[] = [`DXF:${fields.section}`];
  if (fields.blockName) parts.push(`block=${fields.blockName}`);
  if (fields.layoutName) parts.push(`layout=${fields.layoutName}`);
  if (fields.entityHandle) parts.push(`handle=${fields.entityHandle}`);
  if (fields.ownerHandle) parts.push(`owner=${fields.ownerHandle}`);
  if (fields.layerName) parts.push(`layer=${fields.layerName}`);
  if (fields.attributeTag) parts.push(`attribute=${fields.attributeTag}`);
  return parts.join(":");
}

/** "DXF:LAYER=FIRE_ALARM" — the layer-level locator form. */
export function formatDxfLayerLocator(layerName: string): string {
  return `DXF:LAYER=${layerName}`;
}

/** "DXF:MODEL_SPACE:handle=10A" / "DXF:PAPER_SPACE:layout=Layout1:handle=22B". */
export function formatDxfSpaceLocator(space: DxfSpace, entityHandle: string | null, layoutName: string | null): string {
  const section = space === "PAPER_SPACE" ? "PAPER_SPACE" : space === "MODEL_SPACE" ? "MODEL_SPACE" : "UNATTRIBUTED_SPACE";
  const parts: string[] = [`DXF:${section}`];
  if (space === "PAPER_SPACE" && layoutName) parts.push(`layout=${layoutName}`);
  if (entityHandle) parts.push(`handle=${entityHandle}`);
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Drawing version ($ACADVER)
// ---------------------------------------------------------------------------

/**
 * Release names AutoCAD publishes for `$ACADVER` codes. A code not in this
 * table is preserved verbatim with a null label rather than being guessed.
 */
const ACADVER_LABELS: Readonly<Record<string, string>> = {
  AC1009: "AutoCAD R12",
  AC1012: "AutoCAD R13",
  AC1014: "AutoCAD R14",
  AC1015: "AutoCAD 2000",
  AC1017: "AutoCAD 2003",
  AC1018: "AutoCAD 2004",
  AC1021: "AutoCAD 2007",
  AC1024: "AutoCAD 2010",
  AC1027: "AutoCAD 2013",
  AC1032: "AutoCAD 2018",
};

export type DxfVersionEvidence = {
  /** Verbatim `$ACADVER` value, e.g. "AC1027"; null when the file omits it. */
  code: string | null;
  /** Published release name when the code is known; null otherwise. */
  label: string | null;
  /** Exact locator of the header variable the version was read from. */
  locator: string;
  limitations: string[];
};

export function dxfVersionFromCode(code: string | null): DxfVersionEvidence {
  if (!code) {
    return { code: null, label: null, locator: "DXF:HEADER:variable=$ACADVER", limitations: ["the drawing did not declare a $ACADVER version"] };
  }
  const label = ACADVER_LABELS[code.toUpperCase()] ?? null;
  return {
    code,
    label,
    locator: "DXF:HEADER:variable=$ACADVER",
    limitations: label ? [] : [`the version code ${code} is not a release VOKA recognizes, so it was preserved verbatim`],
  };
}

// ---------------------------------------------------------------------------
// Drawing units ($INSUNITS) — declared or unknown, never inferred
// ---------------------------------------------------------------------------

/**
 * AutoCAD `$INSUNITS` values. The unit name is a semantic label for the code
 * the drawing declared; it is not a conversion factor and VOKA never applies
 * one to any coordinate, radius, or measurement.
 */
const INSUNITS: Readonly<Record<number, { singular: string; plural: string; arabic: string }>> = {
  0: { singular: "unitless", plural: "unitless", arabic: "بدون وحدة" },
  1: { singular: "inch", plural: "inches", arabic: "بوصة" },
  2: { singular: "foot", plural: "feet", arabic: "قدم" },
  3: { singular: "mile", plural: "miles", arabic: "ميل" },
  4: { singular: "millimetre", plural: "millimetres", arabic: "مليمتر" },
  5: { singular: "centimetre", plural: "centimetres", arabic: "سنتيمتر" },
  6: { singular: "metre", plural: "metres", arabic: "متر" },
  7: { singular: "kilometre", plural: "kilometres", arabic: "كيلومتر" },
  8: { singular: "microinch", plural: "microinches", arabic: "ميكروبوصة" },
  9: { singular: "mil", plural: "mils", arabic: "ميل (ألف من البوصة)" },
  10: { singular: "yard", plural: "yards", arabic: "ياردة" },
  11: { singular: "angstrom", plural: "angstroms", arabic: "أنجستروم" },
  12: { singular: "nanometre", plural: "nanometres", arabic: "نانومتر" },
  13: { singular: "micron", plural: "microns", arabic: "ميكرون" },
  14: { singular: "decimetre", plural: "decimetres", arabic: "ديسيمتر" },
  15: { singular: "decametre", plural: "decametres", arabic: "ديكامتر" },
  16: { singular: "hectometre", plural: "hectometres", arabic: "هكتومتر" },
  17: { singular: "gigametre", plural: "gigametres", arabic: "جيجامتر" },
  18: { singular: "astronomical unit", plural: "astronomical units", arabic: "وحدة فلكية" },
  19: { singular: "light year", plural: "light years", arabic: "سنة ضوئية" },
  20: { singular: "parsec", plural: "parsecs", arabic: "فرسخ فلكي" },
};

export type DxfUnitsEvidence = {
  /** Verbatim numeric `$INSUNITS` code; null when the file omits it. */
  code: number | null;
  /** Raw string exactly as stored, so a malformed value stays visible. */
  raw: string | null;
  /** Semantic name of the declared unit; null when unknown or undeclared. */
  name: string | null;
  /** Arabic name of the declared unit; null when unknown or undeclared. */
  nameArabic: string | null;
  /** True only when the file itself declared a recognized unit. */
  declared: boolean;
  locator: string;
  limitations: string[];
};

const UNITS_LOCATOR = "DXF:HEADER:variable=$INSUNITS";

/**
 * Reads declared drawing units.
 *
 * There is exactly one input: the `$INSUNITS` code the file stored. When it is
 * absent, unknown, or malformed the result is "not declared" — VOKA does not
 * look at coordinates, extents, the tenant, the country, the project, the
 * company settings, the file name, or common construction practice to guess a
 * unit. Guessing would let one drawing silently become 1000x wrong.
 */
export function dxfUnitsFromCode(code: number | null, raw: string | null): DxfUnitsEvidence {
  if (code === null) {
    return {
      code: null,
      raw,
      name: null,
      nameArabic: null,
      declared: false,
      locator: UNITS_LOCATOR,
      limitations: ["the drawing did not declare CAD units ($INSUNITS is absent), so its units remain unknown and were not inferred from coordinates, extents, or project settings"],
    };
  }
  const entry = INSUNITS[code];
  if (!entry) {
    return {
      code,
      raw,
      name: null,
      nameArabic: null,
      declared: false,
      locator: UNITS_LOCATOR,
      limitations: [`the drawing declared the unrecognized unit code ${code}, so it was preserved verbatim and the units remain unknown`],
    };
  }
  return {
    code,
    raw,
    name: entry.plural,
    nameArabic: entry.arabic,
    declared: true,
    locator: UNITS_LOCATOR,
    limitations: [],
  };
}

/** Units when the drawing declared nothing. Exported so callers never invent. */
export const UNDECLARED_DXF_UNITS: DxfUnitsEvidence = {
  code: null,
  raw: null,
  name: null,
  nameArabic: null,
  declared: false,
  locator: UNITS_LOCATOR,
  limitations: ["the drawing did not declare CAD units ($INSUNITS is absent), so its units remain unknown and were not inferred"],
};

// ---------------------------------------------------------------------------
// Raw CAD geometry — preserved, never measured
// ---------------------------------------------------------------------------

/** A coordinate triple exactly as the DXF stored it. Absent axes stay null. */
export type DxfPoint = { x: number | null; y: number | null; z: number | null };

export const EMPTY_DXF_POINT: DxfPoint = { x: null, y: null, z: null };

export function hasDxfPoint(point: DxfPoint | null): boolean {
  return Boolean(point && (point.x !== null || point.y !== null || point.z !== null));
}

/**
 * Raw geometry fields preserved verbatim.
 *
 * These are coordinates and radii in the drawing's own declared (or
 * undeclared) units. They are evidence. VOKA deliberately derives nothing from
 * them: no length, no area, no volume, no room size, no cable or pipe or duct
 * run, and no material quantity. A DXF radius is not a pipe size.
 */
export type DxfGeometryEvidence = {
  kind: DxfGeometryKind;
  startPoint: DxfPoint | null;
  endPoint: DxfPoint | null;
  center: DxfPoint | null;
  /** Verbatim group-40 radius. Never converted and never used to derive length. */
  radius: number | null;
  /**
   * Verbatim group-11 major-axis endpoint vector for an ELLIPSE. The format
   * stores the major axis as a vector from the centre, not as a radius, and it
   * is preserved that way: turning it into a radius would be a conversion.
   */
  majorAxisEndpoint: DxfPoint | null;
  /** Verbatim group-40 minor-to-major axis ratio for an ELLIPSE. */
  axisRatio: number | null;
  /** Verbatim group-50 start angle in DEGREES, exactly as stored. */
  startAngleDegrees: number | null;
  /** Verbatim group-51 end angle in DEGREES, exactly as stored. */
  endAngleDegrees: number | null;
  /**
   * Verbatim group-41/42 parameters bounding an ELLIPSE. The format stores
   * these in RADIANS, so they are kept in radians and are never placed in the
   * degree fields above — mixing the two would silently misstate the geometry.
   */
  startParameter: number | null;
  endParameter: number | null;
  /** Verbatim closed flag. */
  closed: boolean;
  /** Retained vertices, bounded by MAX_VERTICES_PER_ENTITY. */
  vertices: DxfPoint[];
  /** Total vertices the entity declared, which may exceed what was retained. */
  vertexCount: number;
  truncated: boolean;
  limitations: string[];
};

export function emptyDxfGeometry(): DxfGeometryEvidence {
  return {
    kind: "NONE",
    startPoint: null,
    endPoint: null,
    center: null,
    radius: null,
    majorAxisEndpoint: null,
    axisRatio: null,
    startAngleDegrees: null,
    endAngleDegrees: null,
    startParameter: null,
    endParameter: null,
    closed: false,
    vertices: [],
    vertexCount: 0,
    truncated: false,
    limitations: [],
  };
}

// ---------------------------------------------------------------------------
// Text and attributes
// ---------------------------------------------------------------------------

/**
 * One TEXT or MTEXT record.
 *
 * `raw` is verbatim DXF content including control syntax; `normalized` is the
 * same content with only DXF formatting control codes stripped so it can be
 * read by a person. Normalization never rewrites meaning, never expands an
 * abbreviation, and never translates anything; when it changes the string the
 * original is still there for review.
 */
export type DxfTextEvidence = {
  id: string;
  /** "TEXT" or "MTEXT", as the file wrote it. */
  entityType: "TEXT" | "MTEXT";
  handle: string | null;
  ownerHandle: string | null;
  layerName: string | null;
  space: DxfSpace;
  layoutName: string | null;
  /** Verbatim content including DXF control syntax. */
  raw: string;
  /** Readable view; identical to raw when no control syntax was present. */
  normalized: string;
  normalizedChanged: boolean;
  insertionPoint: DxfPoint | null;
  /** Verbatim group-50 rotation in DEGREES. */
  rotationDegrees: number | null;
  /** Verbatim group-40 text height in drawing units. Never converted. */
  height: number | null;
  /** Verbatim group-7 text style name. */
  styleName: string | null;
  /** Bounding block when the text lives inside a block definition. */
  blockName: string | null;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

/** One ATTDEF or ATTRIB record. Observed CAD attribute, never a product spec. */
export type DxfAttributeEvidence = {
  id: string;
  /** "ATTDEF" lives in a block definition; "ATTRIB" hangs off an INSERT. */
  entityType: "ATTDEF" | "ATTRIB";
  handle: string | null;
  ownerHandle: string | null;
  /** Verbatim group-2 tag, e.g. "DEVICE_TYPE". */
  tag: string;
  /** Verbatim group-3 prompt; ATTDEF only. */
  prompt: string | null;
  /** Verbatim group-1 literal value. */
  value: string;
  layerName: string | null;
  space: DxfSpace;
  insertionPoint: DxfPoint | null;
  height: number | null;
  /** Block definition name for an ATTDEF; referenced block for an ATTRIB. */
  blockName: string | null;
  /** INSERT handle for an ATTRIB, when the file linked one. */
  insertHandle: string | null;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

/**
 * One DIMENSION record.
 *
 * Every numeric field here is what the drawing stored. VOKA does not measure
 * the geometry the dimension points at, does not recompute `measurement`, and
 * does not verify it against anything. `displayText` is the override string
 * (group 1); the literal `<>` means the drawing asked for the computed value,
 * and that computed value is the file's own claim, not VOKA's.
 */
export type DxfDimensionEvidence = {
  id: string;
  handle: string | null;
  ownerHandle: string | null;
  layerName: string | null;
  space: DxfSpace;
  layoutName: string | null;
  /** Verbatim group-1 override/display text. */
  displayText: string | null;
  /**
   * True when group 1 was the placeholder `<>`, meaning the drawing did not
   * write an override and the displayed value comes from the file itself.
   */
  displayIsPlaceholder: boolean;
  /** Verbatim group-70 dimension-type flags. */
  dimensionTypeFlags: number | null;
  /** Plain reading of the low-order type bits; a hint, never a measurement. */
  dimensionTypeLabel: string | null;
  /** Verbatim group-42 measurement the drawing stored. Never recomputed. */
  measurement: number | null;
  /** Verbatim group-43 tolerance, when stored. */
  tolerance: number | null;
  /** Verbatim group-7 dimension style name. */
  styleName: string | null;
  /** Verbatim group-2 anonymous/associated block name, e.g. "*D1". */
  blockName: string | null;
  definitionPoint: DxfPoint | null;
  referencePoint1: DxfPoint | null;
  referencePoint2: DxfPoint | null;
  referencePoint3: DxfPoint | null;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

/**
 * Plain reading of the DIMENSION group-70 type bits.
 *
 * The low three bits name the dimension form the file declared. VOKA reads the
 * label only; it does not measure anything and does not check the value.
 */
export function dxfDimensionTypeLabel(flags: number | null): string | null {
  if (flags === null) return null;
  switch (flags & 0x07) {
    case 0: return "linear";
    case 1: return "aligned";
    case 2: return "angular";
    case 3: return "diameter";
    case 4: return "radius";
    case 5: return "angular (3 point)";
    case 6: return "ordinate";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export type DxfLayerEvidence = {
  name: string;
  /** Verbatim group-5 handle; null when the file omitted it. Never invented. */
  handle: string | null;
  ownerHandle: string | null;
  /** Verbatim group-62 colour index. Negative means the layer is off. */
  colorIndex: number | null;
  /** Group-62 sign bit: the layer is switched off in the drawing. */
  off: boolean;
  /** Verbatim group-6 line-type name. */
  lineType: string | null;
  /** Group-70 bit 1: frozen. */
  frozen: boolean;
  /** Group-70 bit 2: frozen by default in new viewports. */
  frozenByDefault: boolean;
  /** Group-70 bit 4: locked. */
  locked: boolean;
  /** Verbatim group-70 flags, preserved so nothing is lost in interpretation. */
  flags: number | null;
  /** True when the layer name is one of the reserved model/paper layers. */
  reserved: boolean;
  /** Bounded count of inspected entities on this layer. An ingestion metric. */
  observedEntityCount: number;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

/** Reserved AutoCAD layer names that carry no design semantics. */
const RESERVED_LAYER_NAMES = new Set(["0", "DEFPOINTS", "DEFPOINT"]);

export function isReservedDxfLayer(name: string): boolean {
  return RESERVED_LAYER_NAMES.has(name.trim().toUpperCase());
}

/**
 * Reads LAYER group-62 / group-70 flags.
 *
 * Group 62 carries the colour index, and its sign carries the on/off switch:
 * a negative value means the layer is switched off, so the absolute value is
 * the colour and the sign is a visibility fact. Group 70 carries bit 1
 * (frozen), bit 2 (frozen by default in new viewports), and bit 4 (locked).
 * All four are kept separately because "off", "frozen", and "locked" are three
 * different states with different consequences for a reviewer.
 */
export function dxfLayerStateFromFlags(flags: number | null, colorValue: number | null): {
  off: boolean;
  frozen: boolean;
  frozenByDefault: boolean;
  locked: boolean;
  colorIndex: number | null;
} {
  const value = flags ?? 0;
  return {
    off: typeof colorValue === "number" && colorValue < 0,
    frozen: (value & 0x01) !== 0,
    frozenByDefault: (value & 0x02) !== 0,
    locked: (value & 0x04) !== 0,
    colorIndex: typeof colorValue === "number" ? Math.abs(colorValue) : null,
  };
}

// ---------------------------------------------------------------------------
// Blocks, inserts, external references
// ---------------------------------------------------------------------------

export type DxfBlockDefinition = {
  name: string;
  handle: string | null;
  ownerHandle: string | null;
  layerName: string | null;
  basePoint: DxfPoint | null;
  /** Verbatim group-70 block flags. */
  flags: number | null;
  /** Group-70 bit 1: anonymous block, typically a dimension's own geometry. */
  anonymous: boolean;
  /** Group-70 bit 4: this block IS an external reference. Metadata only. */
  externalReference: boolean;
  /** Group-70 bit 8: xref overlay rather than an attached reference. */
  xrefOverlay: boolean;
  /** Verbatim group-1 xref path. Recorded, never opened, never fetched. */
  xrefPath: string | null;
  /** True when the block name marks a model- or paper-space owner. */
  spaceOwner: boolean;
  /** Which space this block defines, when the file says so. */
  space: DxfSpace;
  /** Layout name this paper-space block presents as, when resolvable. */
  layoutName: string | null;
  /** Bounded entity handles contained in this block. References, not copies. */
  containedEntityIds: string[];
  /** Total entities declared in the block; may exceed what was retained. */
  containedEntityCount: number;
  /** Bounded ATTDEF records defined by this block. */
  attributeDefinitions: DxfAttributeEvidence[];
  /** Bounded INSERT records observed referencing this block. */
  insertHandles: string[];
  /** Bounded count of inserts referencing this block. An ingestion metric. */
  insertCount: number;
  containedTruncated: boolean;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type DxfBlockInsert = {
  id: string;
  handle: string | null;
  ownerHandle: string | null;
  /** Verbatim group-2 name of the block being inserted. */
  blockName: string;
  /** True when the drawing has no block definition by that name. */
  blockMissing: boolean;
  insertionPoint: DxfPoint | null;
  /** Verbatim group-41/42/43 scale factors. Never applied to anything. */
  scaleX: number | null;
  scaleY: number | null;
  scaleZ: number | null;
  /** Verbatim group-50 rotation in DEGREES, exactly as stored. */
  rotationDegrees: number | null;
  layerName: string | null;
  space: DxfSpace;
  layoutName: string | null;
  /** Bounded ATTRIB records attached to this insert, in file order. */
  attributes: DxfAttributeEvidence[];
  attributeCount: number;
  /** Total attribute records declared; may exceed what was retained. */
  attributesTruncated: boolean;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

/**
 * External-reference metadata.
 *
 * VOKA records that a drawing points at another file and where it says that
 * file is. It never opens the path, never fetches a network location, never
 * retrieves another DXF or DWG, and never resolves the referenced content. A
 * local path in a DXF belongs to whoever authored the file and means nothing
 * on VOKA's machine.
 */
export type DxfExternalReference = {
  /** Block name carrying the reference. */
  blockName: string;
  /** Verbatim group-1 path exactly as the drawing wrote it. */
  path: string;
  /** True when the path looks like a network location rather than a local one. */
  looksRemote: boolean;
  overlay: boolean;
  handle: string | null;
  locator: string;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * One bounded entity record.
 *
 * `evidenceId` is stable within the inspection and is derived from the file's
 * own handle where the file provided one. Where the file provided no handle
 * the id is a positional reference and is labelled as such; VOKA never
 * fabricates a handle, because a made-up handle would resolve to a different
 * entity in the real drawing and silently misdirect a reviewer.
 */
export type DxfEntityEvidence = {
  evidenceId: string;
  /** Verbatim entity type as the file wrote it. */
  entityType: string;
  /** Modelled type when VOKA knows it; "OTHER" otherwise. */
  knownType: DxfEntityType;
  /** Verbatim group-5 handle; null when absent. Never invented. */
  handle: string | null;
  /** Verbatim group-330 owner handle; null when absent. */
  ownerHandle: string | null;
  /** True when the file gave no handle, so the id is positional only. */
  handleMissing: boolean;
  layerName: string | null;
  space: DxfSpace;
  /**
   * How the space was established. A space that came from an explicit group-67
   * flag or an owner-handle chain is proven; a space assumed from the DXF
   * convention that the ENTITIES section holds model space is labelled as an
   * assumption, because assuming it silently would merge the two spaces.
   */
  spaceAttribution: DxfSpaceAttribution;
  layoutName: string | null;
  /** Group-67 paper-space flag, when the entity carried one. */
  paperSpaceFlag: boolean | null;
  /** Block definition this entity was read inside; null for ENTITIES section. */
  blockName: string | null;
  geometry: DxfGeometryEvidence;
  /** TEXT/MTEXT payload when this entity carries text. */
  text: DxfTextEvidence | null;
  /** DIMENSION payload when this entity is a dimension. */
  dimension: DxfDimensionEvidence | null;
  /** INSERT payload when this entity inserts a block. */
  insert: DxfBlockInsert | null;
  /** ATTDEF/ATTRIB payload when this entity is an attribute. */
  attribute: DxfAttributeEvidence | null;
  /** Verbatim group-62 colour index. */
  colorIndex: number | null;
  /** Verbatim group-6 line-type name. */
  lineType: string | null;
  locator: string;
  reliability: ObservationReliability;
  status: ObservationStatus;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Space summaries (model space and paper space stay separate)
// ---------------------------------------------------------------------------

export type DxfSpaceSummary = {
  space: DxfSpace;
  /** Layout name this space presents as, when the file resolved one. */
  layoutName: string | null;
  /** Bounded entity records retained for this space. */
  entities: DxfEntityEvidence[];
  /** Total entities read in this space. An ingestion metric, not a quantity. */
  entityCount: number;
  /** Distinct layers observed in this space. */
  layerNames: string[];
  /** Distinct block names inserted in this space. */
  insertedBlockNames: string[];
  /** Text records read in this space. An ingestion metric. */
  textCount: number;
  /** Dimension records read in this space. An ingestion metric. */
  dimensionCount: number;
  /** Insert records read in this space. An ingestion metric. */
  insertCount: number;
  truncated: boolean;
  locator: string;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export type DxfRelationship = {
  kind: DxfRelationshipKind;
  /** Locator of the subject, e.g. the entity. */
  subject: string;
  /** Locator of the object, e.g. the layer or block. */
  object: string;
  /** Plain reason a reviewer can check against the file. */
  reason: string;
  reliability: ObservationReliability;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Semantic candidates
// ---------------------------------------------------------------------------

/**
 * One conservative semantic candidate.
 *
 * A candidate is a reviewable reading, not a decision. When two readings are
 * supported by different evidence, both are kept and neither is preferred:
 * picking a winner would be VOKA choosing equipment, which is the user's call
 * and never a parser's.
 */
export type DxfSemanticCandidate = {
  id: string;
  /** The reading, e.g. "Smoke Detector", taken from evidence verbatim. */
  label: string;
  /** Which kinds of explicit evidence supported this reading. */
  sources: DxfSemanticSource[];
  /** Bounded exact locators backing the reading. */
  evidenceLocators: string[];
  /** Plain reasons, each naming the evidence that supported the reading. */
  reasons: string[];
  /** Distinct corroborating evidence records. Never an equipment count. */
  corroborationCount: number;
  /** 0..1 review signal, not a probability and not a selection score. */
  confidence: number;
  reliability: ObservationReliability;
  status: ObservationStatus;
  /** True when another candidate reads the same evidence differently. */
  conflictsWith: string[];
  space: DxfSpace;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

export type DxfDocumentFacts = {
  format: DxfFormat;
  version: DxfVersionEvidence;
  units: DxfUnitsEvidence;
  /** Verbatim `$DWGCODEPAGE`, e.g. "ANSI_1252"; null when absent. */
  codePage: string | null;
  /** Verbatim `$MEASUREMENT` (0 = imperial, 1 = metric); null when absent. */
  measurement: number | null;
  /** Verbatim `$HANDSEED`; null when absent. */
  handleSeed: string | null;
  /** Verbatim `$EXTMIN` / `$EXTMAX` when the file declared extents. */
  declaredExtents: { min: DxfPoint; max: DxfPoint } | null;
  /** Bounded raw header variables preserved for review. */
  headerVariables: Array<{ name: string; raw: string; locator: string }>;
  /** Sections the file actually contained. */
  sectionsPresent: string[];
  limitations: string[];
};

export type DxfInspection = {
  format: "ASCII_DXF";
  sizeBytes: number;
  document: DxfDocumentFacts;
  layers: DxfLayerEvidence[];
  blocks: DxfBlockDefinition[];
  inserts: DxfBlockInsert[];
  texts: DxfTextEvidence[];
  dimensions: DxfDimensionEvidence[];
  attributes: DxfAttributeEvidence[];
  /** Bounded retained entity records in file order. */
  entities: DxfEntityEvidence[];
  /** Model space and paper space, kept apart. Both are always present. */
  spaces: Record<DxfSpace, DxfSpaceSummary>;
  externalReferences: DxfExternalReference[];
  /** Total entity records read, including those beyond the retention cap. */
  entityCount: number;
  /** Entity records retained in `entities`. */
  entityRecordsRetained: number;
  /** Counts by verbatim entity type. Ingestion metrics only. */
  entityTypeCounts: Record<string, number>;
  /** Unmodelled entity type names, so nothing is silently ignored. */
  unmodelledEntityTypes: string[];
  truncated: boolean;
  limitations: string[];
};

export type DxfAnalysis = {
  format: "ASCII_DXF";
  inspection: DxfInspection;
  relationships: DxfRelationship[];
  relationshipCount: number;
  candidates: DxfSemanticCandidate[];
  truncated: boolean;
  limitations: string[];
};

/**
 * Bounded shape persisted in `SourceArtifact.extractedPages` for a drawing.
 *
 * It reuses the existing JSON column instead of adding a migration: version 4
 * keeps it distinct from the version-2 PDF page model and the version-3
 * workbook model, both of which ignore it. Only structural counts, declared
 * metadata, and limitations are stored — never an entity dump — so a large
 * drawing cannot bloat the row.
 */
export type StoredDxfModel = {
  version: 4;
  kind: "DXF";
  versionCode: string | null;
  versionLabel: string | null;
  unitsCode: number | null;
  unitsName: string | null;
  layerCount: number;
  blockCount: number;
  entityCount: number;
  insertCount: number;
  textCount: number;
  dimensionCount: number;
  externalReferenceCount: number;
  modelSpaceEntityCount: number;
  paperSpaceEntityCount: number;
  truncated: boolean;
  limitations: string[];
};

export function isStoredDxfModel(value: unknown): value is StoredDxfModel {
  const candidate = value as Partial<StoredDxfModel> | null;
  return Boolean(
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
    && candidate.version === 4 && candidate.kind === "DXF" && typeof candidate.entityCount === "number",
  );
}

// ---------------------------------------------------------------------------
// DXF text normalization (control syntax only)
// ---------------------------------------------------------------------------

/**
 * Strips DXF control syntax so text can be read by a person.
 *
 * Only formatting control codes are touched: `\P` paragraph breaks become
 * newlines, `\L \l \O \o \K \k \~` toggles and non-breaking spaces are
 * resolved, `\f...;` font switches and `\C/\c/\H/\Q/\T/\W` parameters are
 * dropped along with their trailing semicolon, and `{}` grouping braces are
 * removed. Unicode escapes `\U+XXXX` and `\M+NXXXX` are decoded when they are
 * well formed. Nothing else is rewritten: the wording, the abbreviations, and
 * the language are the drawing's, and changing them would put words in the
 * author's mouth.
 */
export function normalizeDxfText(raw: string): string {
  if (!raw) return "";
  let text = raw;
  // Paragraph break: the DXF newline. Becomes a real newline, never a space,
  // because merging two title-block lines would invent a phrase.
  text = text.replace(/\\[Pp]/gu, "\n");
  // Non-breaking space.
  text = text.replace(/\\~/gu, " ");
  // Unicode escapes: \U+0041 and \M+10041 (the one-byte code-page form).
  text = text.replace(/\\U\+([0-9A-Fa-f]{4})/gu, (_match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  });
  text = text.replace(/\\M\+[0-9A-Fa-f]{4}/gu, "");
  // Parameterized switches with a semicolon-terminated argument: font, colour,
  // height, width factor, oblique, tracking. The argument is formatting, so
  // the whole escape is dropped rather than printed as literal noise.
  text = text.replace(/\\[fFcCHhQqTtWwA][^;\\]*;/gu, "");
  // Bare formatting toggles: underline, overline, strikethrough.
  text = text.replace(/\\[LlOoKkXx]/gu, "");
  // Stray escaped backslash and remaining braces used for grouping.
  text = text.replace(/\\\\/gu, "\\").replace(/[{}]/gu, "");
  // Collapse the whitespace the escapes left behind, but keep line breaks.
  text = text.replace(/[ \t]{2,}/gu, " ").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
  return text;
}

// ---------------------------------------------------------------------------
// Conservative semantic vocabulary
// ---------------------------------------------------------------------------

/**
 * Splits a CAD name into comparable tokens.
 *
 * CAD names are written in every style: `SMOKE_DETECTOR`, `Smoke Detector`,
 * `A-DOOR`, `E-EQUIP`, `SD-01`. Splitting on the separators those styles use
 * is what lets one block name and one layer name corroborate each other. The
 * tokens are compared, never displayed: a user sees the verbatim label.
 */
export function dxfNameTokens(name: string): string[] {
  if (!name) return [];
  return name
    .replace(/[\u0640]/gu, "")
    .split(/[^A-Za-z0-9\u0600-\u06FF]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .map((token) => token.toUpperCase());
}

/**
 * Expands the short codes drawings actually use into readable words.
 *
 * This is a conservative reading aid, not a product catalogue: it turns the
 * label `SD` into the phrase "smoke detector" so a reviewer can read a
 * candidate, and it never asserts that the device is one. Unknown codes stay
 * exactly as written, so a drawing using `SD` for something else is not
 * silently rewritten.
 */
const SEMANTIC_PHRASES: ReadonlyArray<{ tokens: readonly string[]; phrase: string }> = [
  { tokens: ["SMOKE", "DETECTOR"], phrase: "Smoke Detector" },
  { tokens: ["SD"], phrase: "Smoke Detector" },
  { tokens: ["HEAT", "DETECTOR"], phrase: "Heat Detector" },
  { tokens: ["HD"], phrase: "Heat Detector" },
  { tokens: ["MANUAL", "CALL", "POINT"], phrase: "Manual Call Point" },
  { tokens: ["MCP"], phrase: "Manual Call Point" },
  { tokens: ["FIRE", "ALARM"], phrase: "Fire Alarm" },
  { tokens: ["FIRE", "ALARM", "PANEL"], phrase: "Fire Alarm Panel" },
  { tokens: ["FAP"], phrase: "Fire Alarm Panel" },
  { tokens: ["BEACON"], phrase: "Beacon" },
  { tokens: ["SOUNDER"], phrase: "Sounder" },
  { tokens: ["CCTV"], phrase: "CCTV Camera" },
  { tokens: ["CAMERA"], phrase: "CCTV Camera" },
  { tokens: ["CAM"], phrase: "CCTV Camera" },
  { tokens: ["DVR"], phrase: "Video Recorder" },
  { tokens: ["NVR"], phrase: "Network Video Recorder" },
  { tokens: ["ACCESS", "CONTROL"], phrase: "Access Control" },
  { tokens: ["READER"], phrase: "Card Reader" },
  { tokens: ["LIGHTING"], phrase: "Lighting" },
  { tokens: ["LUMINAIRE"], phrase: "Luminaire" },
  { tokens: ["HVAC"], phrase: "HVAC" },
  { tokens: ["AIR", "CONDITIONING"], phrase: "Air Conditioning" },
  { tokens: ["DIFFUSER"], phrase: "Air Diffuser" },
  { tokens: ["DOOR"], phrase: "Door" },
  { tokens: ["WINDOW"], phrase: "Window" },
  { tokens: ["ELEVATOR"], phrase: "Elevator" },
  { tokens: ["LIFT"], phrase: "Elevator" },
  { tokens: ["PUMP"], phrase: "Pump" },
  { tokens: ["VALVE"], phrase: "Valve" },
  { tokens: ["PANEL"], phrase: "Panel" },
  { tokens: ["CABINET"], phrase: "Cabinet" },
  { tokens: ["SPRINKLER"], phrase: "Sprinkler" },
  { tokens: ["SENSOR"], phrase: "Sensor" },
  { tokens: ["SWITCH"], phrase: "Switch" },
  { tokens: ["SOCKET"], phrase: "Socket Outlet" },
  { tokens: ["EXIT", "SIGN"], phrase: "Exit Sign" },
];

/**
 * Reads a conservative phrase from CAD name tokens.
 *
 * The whole token set must be accounted for by the phrase, or the phrase's
 * tokens must all be present. That is deliberately strict: `SD` on a layer
 * called `FIRE_ALARM` reads as a smoke detector candidate, but `SD` on a layer
 * called `SITE_DRAINAGE` does not, because the layer contradicts it.
 */
export function phraseForDxfTokens(tokens: readonly string[]): string | null {
  if (!tokens.length) return null;
  for (const entry of SEMANTIC_PHRASES) {
    if (entry.tokens.every((token) => tokens.includes(token))) return entry.phrase;
  }
  return null;
}

/**
 * Decides whether two readings of the same evidence conflict.
 *
 * Two candidates conflict when they are different readings supported by the
 * same underlying evidence record. The conflict is recorded and both readings
 * survive: VOKA does not pick a winner, because choosing between two readings
 * of a drawing is choosing equipment.
 */
export function dxfCandidatesConflict(left: DxfSemanticCandidate, right: DxfSemanticCandidate): boolean {
  if (left.id === right.id) return false;
  if (left.label.toUpperCase() === right.label.toUpperCase()) return false;
  // A layer locator is deliberately excluded. A layer is shared infrastructure:
  // FIRE_ALARM legitimately carries smoke detectors, call points, and sounders,
  // so two readings that merely share a layer do not disagree — they describe
  // different things on the same layer. Only two readings of the SAME specific
  // record (one block, one insert, one text, one attribute) are a conflict.
  const specific = (locator: string) => !locator.startsWith("DXF:LAYER=");
  return left.evidenceLocators.some((locator) => specific(locator) && right.evidenceLocators.includes(locator));
}

export { OBSERVATION_STATUS as DXF_OBSERVATION_STATUS };
