import {
  DXF_PAGE_NUMBER,
  MAX_ATTRIBUTES_PER_RECORD,
  MAX_DXF_LIMITATIONS_PER_RECORD,
  MAX_DXF_NORMALIZED_CHARACTERS,
  MAX_DXF_TEXT_CHARACTERS,
  MAX_VERTICES_PER_ENTITY,
  dxfDimensionTypeLabel,
  emptyDxfGeometry,
  formatDxfLocator,
  isDxfEntityType,
  normalizeDxfText,
  type DxfAttributeEvidence,
  type DxfBlockInsert,
  type DxfDimensionEvidence,
  type DxfEntityEvidence,
  type DxfEntityType,
  type DxfGeometryEvidence,
  type DxfPoint,
  type DxfSpace,
  type DxfSpaceAttribution,
  type DxfTextEvidence,
  type ObservationReliability,
} from "@/src/domain/source-artifact";
import type { DxfGroupCode } from "./DxfGroupCodes";
import { numericGroupValue } from "./DxfGroupCodes";

/**
 * Phase 2A-7: turns raw DXF group codes into bounded entity evidence.
 *
 * The rule running through every builder here is preservation. A coordinate, a
 * radius, an angle, a scale factor, and a dimension measurement are all carried
 * exactly as the file stored them. Nothing is derived from them: no length, no
 * area, no count, no unit conversion, and no re-measurement of a dimension.
 *
 * Where the file omitted a value the record carries null. A missing handle in
 * particular is never filled in with a synthesised one, because an invented
 * handle resolves to a different entity in the real drawing and would silently
 * misdirect anyone who followed it.
 */

export type RawDxfEntity = {
  /** Verbatim entity type exactly as the `0` pair wrote it. */
  type: string;
  groups: DxfGroupCode[];
};

/** Everything the caller knows about where this entity was read from. */
export type DxfEntityContext = {
  artifactId: string;
  /** Block definition this entity sits inside; null in the ENTITIES section. */
  blockName: string | null;
  space: DxfSpace;
  spaceAttribution: DxfSpaceAttribution;
  layoutName: string | null;
  /** Monotonic position used to build a positional id when no handle exists. */
  position: number;
  maxVerticesPerEntity: number;
  maxTextCharacters: number;
  maxAttributesPerRecord: number;
};

/** Section token used in locators, derived from where the entity was read. */
function locatorSection(context: DxfEntityContext): string {
  if (context.blockName) return "BLOCKS";
  if (context.space === "MODEL_SPACE") return "MODEL_SPACE";
  if (context.space === "PAPER_SPACE") return "PAPER_SPACE";
  return "ENTITIES";
}

function firstValue(groups: DxfGroupCode[], code: number): string | null {
  const found = groups.find((group) => group.code === code);
  return found ? found.value : null;
}

function firstNumber(groups: DxfGroupCode[], code: number): number | null {
  const found = groups.find((group) => group.code === code);
  return found ? numericGroupValue(found.code, found.value) : null;
}

function firstFlag(groups: DxfGroupCode[], code: number): boolean | null {
  const value = firstNumber(groups, code);
  return value === null ? null : value !== 0;
}

/** All groups with this code, in file order. */
function allValues(groups: DxfGroupCode[], code: number): string[] {
  return groups.filter((group) => group.code === code).map((group) => group.value);
}

function allNumbers(groups: DxfGroupCode[], code: number): number[] {
  return groups
    .filter((group) => group.code === code)
    .map((group) => numericGroupValue(group.code, group.value))
    .filter((value): value is number => value !== null);
}

/**
 * Reads a coordinate triple from the conventional X/Y/Z code offsets.
 *
 * Returns null when the entity stored no X value at all, so an absent point is
 * distinguishable from a point at the origin. Absent Y or Z stay null inside
 * the returned point rather than being defaulted to zero.
 */
function parsePoint(groups: DxfGroupCode[], xCode: number): DxfPoint | null {
  const x = firstNumber(groups, xCode);
  if (x === null) return null;
  return { x, y: firstNumber(groups, xCode + 10), z: firstNumber(groups, xCode + 20) };
}

function pointHasValue(point: DxfPoint | null): boolean {
  return Boolean(point && point.x !== null);
}

function clipText(value: string, maxCharacters: number): string {
  return value.length > maxCharacters ? value.slice(0, maxCharacters) : value;
}

function bounded(limitations: string[]): string[] {
  return [...new Set(limitations)].slice(0, MAX_DXF_LIMITATIONS_PER_RECORD);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Reads raw geometry for the entity types this phase models.
 *
 * Every field is verbatim. Angles stay in DEGREES because that is what group 50
 * and 51 store; converting them to radians would be a unit conversion of a
 * value that is evidence. Radii stay in the drawing's own declared (or
 * undeclared) units and are never used to compute a length.
 */
export function buildDxfGeometry(entityType: string, groups: DxfGroupCode[], context: DxfEntityContext): DxfGeometryEvidence {
  const geometry = emptyDxfGeometry();
  const limitations: string[] = [];
  switch (entityType.toUpperCase()) {
    case "LINE": {
      geometry.kind = "LINE";
      geometry.startPoint = parsePoint(groups, 10);
      geometry.endPoint = parsePoint(groups, 11);
      if (!pointHasValue(geometry.startPoint) || !pointHasValue(geometry.endPoint)) {
        limitations.push("the LINE record did not carry both endpoints");
      }
      break;
    }
    case "LWPOLYLINE": {
      geometry.kind = "POLYLINE";
      const xs = allNumbers(groups, 10);
      const ys = allNumbers(groups, 20);
      const zs = allNumbers(groups, 30);
      const bulges = allNumbers(groups, 42);
      const declared = firstNumber(groups, 90) ?? Math.max(xs.length, ys.length);
      geometry.vertexCount = declared;
      const retained = Math.min(Math.max(xs.length, ys.length), context.maxVerticesPerEntity);
      for (let index = 0; index < retained; index += 1) {
        geometry.vertices.push({ x: xs[index] ?? null, y: ys[index] ?? null, z: zs[index] ?? null });
      }
      geometry.closed = (firstNumber(groups, 70) ?? 0) % 2 === 1;
      if (bulges.length > 0) {
        limitations.push(`the polyline carries ${bulges.length} bulge value(s) describing curved segments; the raw coordinates were preserved and the curves were not measured`);
      }
      if (Math.max(xs.length, ys.length) > retained) {
        geometry.truncated = true;
        limitations.push(`only the first ${retained} of ${Math.max(xs.length, ys.length)} vertices were retained`);
      }
      break;
    }
    case "POLYLINE": {
      // A heavy POLYLINE carries its geometry in the VERTEX entities that
      // follow it; the caller attaches them. Only its own flags are read here.
      geometry.kind = "POLYLINE";
      const flags = firstNumber(groups, 70) ?? 0;
      geometry.closed = (flags & 0x01) !== 0;
      break;
    }
    case "VERTEX": {
      geometry.kind = "POINT";
      geometry.startPoint = parsePoint(groups, 10);
      break;
    }
    case "CIRCLE": {
      geometry.kind = "CIRCLE";
      geometry.center = parsePoint(groups, 10);
      geometry.radius = firstNumber(groups, 40);
      if (geometry.radius === null) limitations.push("the CIRCLE record carried no radius");
      break;
    }
    case "ARC": {
      geometry.kind = "ARC";
      geometry.center = parsePoint(groups, 10);
      geometry.radius = firstNumber(groups, 40);
      geometry.startAngleDegrees = firstNumber(groups, 50);
      geometry.endAngleDegrees = firstNumber(groups, 51);
      break;
    }
    case "ELLIPSE": {
      geometry.kind = "ELLIPSE";
      geometry.center = parsePoint(groups, 10);
      // DXF stores the major axis as a vector from the centre (group 11), the
      // minor-to-major ratio as group 40, and the bounding parameters as groups
      // 41 and 42 in RADIANS. Each is preserved in the field that matches its
      // meaning; the radian parameters deliberately do not go into the degree
      // fields, because putting them there would misstate the geometry.
      geometry.majorAxisEndpoint = parsePoint(groups, 11);
      geometry.axisRatio = firstNumber(groups, 40);
      geometry.startParameter = firstNumber(groups, 41);
      geometry.endParameter = firstNumber(groups, 42);
      if (!pointHasValue(geometry.majorAxisEndpoint)) {
        limitations.push("the ELLIPSE record carried no major-axis endpoint vector");
      }
      limitations.push("the ellipse's major-axis vector and radian parameters were preserved as stored and were not converted into a radius or degrees");
      break;
    }
    case "SPLINE": {
      geometry.kind = "SPLINE";
      const xs = allNumbers(groups, 10);
      const ys = allNumbers(groups, 20);
      const retained = Math.min(xs.length, context.maxVerticesPerEntity);
      for (let index = 0; index < retained; index += 1) {
        geometry.vertices.push({ x: xs[index] ?? null, y: ys[index] ?? null, z: null });
      }
      geometry.vertexCount = xs.length;
      geometry.closed = ((firstNumber(groups, 70) ?? 0) & 0x01) !== 0;
      if (xs.length > retained) {
        geometry.truncated = true;
        limitations.push(`only the first ${retained} of ${xs.length} spline control points were retained`);
      }
      limitations.push("spline control points were preserved; the curve itself was not evaluated or measured");
      break;
    }
    case "POINT": {
      geometry.kind = "POINT";
      geometry.startPoint = parsePoint(groups, 10);
      break;
    }
    case "SOLID":
    case "3DFACE": {
      geometry.kind = "FACE";
      const corners: DxfPoint[] = [];
      for (const xCode of [10, 11, 12, 13]) {
        const point = parsePoint(groups, xCode);
        if (point) corners.push(point);
      }
      geometry.vertices = corners;
      geometry.vertexCount = corners.length;
      break;
    }
    default:
      geometry.kind = "NONE";
  }
  geometry.limitations = bounded(limitations);
  return geometry;
}

/**
 * Attaches VERTEX entities to the POLYLINE that owns them.
 *
 * A heavy POLYLINE is written as `POLYLINE`, then its `VERTEX` entities, then a
 * `SEQEND`. The vertices belong to the polyline, so they are folded into its
 * geometry here and counted against the same per-entity vertex cap.
 */
export function attachPolylineVertices(
  geometry: DxfGeometryEvidence,
  vertices: DxfPoint[],
  maxVertices: number,
  /**
   * How many VERTEX records the file actually carried. It is passed separately
   * because the caller's own collection is already capped, and using its length
   * as the total would understate what the drawing declared — which would make
   * a truncated polyline look complete.
   */
  declaredTotal: number = vertices.length,
): void {
  const retained = Math.min(vertices.length, Math.max(0, maxVertices - geometry.vertices.length));
  geometry.vertices.push(...vertices.slice(0, retained));
  geometry.vertexCount += declaredTotal;
  if (declaredTotal > geometry.vertices.length) {
    geometry.truncated = true;
    geometry.limitations = bounded([...geometry.limitations, `only the first ${geometry.vertices.length} of ${geometry.vertexCount} polyline vertices were retained`]);
  }
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Reads a TEXT or MTEXT record.
 *
 * `raw` keeps the DXF control syntax verbatim. `normalized` is the readable
 * view with only formatting escapes removed, and `normalizedChanged` says
 * whether the two differ, so a reviewer always knows a transformation happened
 * and can go back to the original.
 */
export function buildDxfText(
  entity: RawDxfEntity,
  context: DxfEntityContext,
  base: { handle: string | null; ownerHandle: string | null; layerName: string | null; space: DxfSpace; layoutName: string | null; locator: string },
): DxfTextEvidence | null {
  const upper = entity.type.toUpperCase();
  if (upper !== "TEXT" && upper !== "MTEXT") return null;
  // MTEXT splits long strings across repeated group-3 chunks before the final
  // group-1. Concatenating them in file order is what the format prescribes;
  // dropping them would silently truncate the drawing's own note.
  const chunks = [...allValues(entity.groups, 3), firstValue(entity.groups, 1) ?? ""].filter((chunk) => chunk.length > 0);
  const raw = clipText(chunks.join(""), context.maxTextCharacters);
  const normalized = clipText(normalizeDxfText(raw), MAX_DXF_NORMALIZED_CHARACTERS);
  const limitations: string[] = [];
  if (chunks.join("").length > raw.length) limitations.push("the text exceeded the retention limit and was truncated");
  if (!raw.trim()) limitations.push("the text record carried no readable content");
  return {
    id: `${base.handle ? `dxf-t:${base.handle}` : `dxf-t:pos:${context.position}`}`,
    entityType: upper === "MTEXT" ? "MTEXT" : "TEXT",
    handle: base.handle,
    ownerHandle: base.ownerHandle,
    layerName: base.layerName,
    space: base.space,
    layoutName: base.layoutName,
    raw,
    normalized,
    normalizedChanged: normalized !== raw,
    insertionPoint: parsePoint(entity.groups, 10),
    rotationDegrees: firstNumber(entity.groups, 50),
    height: firstNumber(entity.groups, 40),
    styleName: firstValue(entity.groups, 7),
    blockName: context.blockName,
    locator: base.locator,
    reliability: normalized.trim() ? "HIGH" : "LOW",
    status: "OBSERVED_NOT_APPROVED",
    limitations: bounded(limitations),
  };
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

/**
 * Reads an ATTDEF or ATTRIB record.
 *
 * Tag, prompt, and value are preserved as literals. An attribute saying
 * `DEVICE_TYPE = SD` is an observed CAD attribute; it is not a product
 * selection, a specification, or an approval, and nothing downstream promotes
 * it into one.
 */
export function buildDxfAttribute(
  entity: RawDxfEntity,
  context: DxfEntityContext,
  base: { handle: string | null; ownerHandle: string | null; layerName: string | null; space: DxfSpace; locator: string; insertHandle: string | null; blockName: string | null },
): DxfAttributeEvidence | null {
  const upper = entity.type.toUpperCase();
  if (upper !== "ATTDEF" && upper !== "ATTRIB") return null;
  const tag = firstValue(entity.groups, 2) ?? "";
  const value = clipText(firstValue(entity.groups, 1) ?? "", MAX_DXF_TEXT_CHARACTERS);
  const limitations: string[] = [];
  if (!tag) limitations.push("the attribute carried no tag, so it cannot be keyed to a field name");
  if (!value.trim()) limitations.push("the attribute value was empty");
  return {
    id: `${base.handle ? `dxf-a:${base.handle}` : `dxf-a:pos:${context.position}`}`,
    entityType: upper === "ATTDEF" ? "ATTDEF" : "ATTRIB",
    handle: base.handle,
    ownerHandle: base.ownerHandle,
    tag,
    prompt: firstValue(entity.groups, 3),
    value,
    layerName: base.layerName,
    space: base.space,
    insertionPoint: parsePoint(entity.groups, 10),
    height: firstNumber(entity.groups, 40),
    blockName: base.blockName ?? context.blockName,
    insertHandle: base.insertHandle,
    locator: formatDxfLocator({ section: locatorSection(context), blockName: base.blockName ?? context.blockName, entityHandle: base.handle, ownerHandle: base.ownerHandle, layerName: base.layerName, attributeTag: tag || null }),
    reliability: tag && value.trim() ? "HIGH" : "LOW",
    status: "OBSERVED_NOT_APPROVED",
    limitations: bounded(limitations),
  };
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/**
 * Reads a DIMENSION record.
 *
 * `measurement` is group 42 — the value the drawing itself stored. VOKA
 * preserves it and does nothing else with it: it does not measure the geometry
 * the dimension points at, does not recompute the value from the definition
 * points, and never claims to have verified it. A dimension in a drawing is the
 * author's statement, and repeating it as VOKA's own measurement would be a
 * false claim about work VOKA did not do.
 */
export function buildDxfDimension(
  entity: RawDxfEntity,
  context: DxfEntityContext,
  base: { handle: string | null; ownerHandle: string | null; layerName: string | null; space: DxfSpace; layoutName: string | null; locator: string },
): DxfDimensionEvidence | null {
  if (entity.type.toUpperCase() !== "DIMENSION") return null;
  const displayText = firstValue(entity.groups, 1);
  const measurement = firstNumber(entity.groups, 42);
  const limitations: string[] = [
    "the dimension value is the drawing's own stored metadata; VOKA did not measure the geometry, recompute the value, or verify it",
  ];
  if (measurement === null) limitations.push("the drawing stored no measurement value for this dimension");
  return {
    id: `${base.handle ? `dxf-d:${base.handle}` : `dxf-d:pos:${context.position}`}`,
    handle: base.handle,
    ownerHandle: base.ownerHandle,
    layerName: base.layerName,
    space: base.space,
    layoutName: base.layoutName,
    displayText,
    displayIsPlaceholder: displayText === null || displayText.trim() === "<>" || displayText.trim() === "",
    dimensionTypeFlags: firstNumber(entity.groups, 70),
    dimensionTypeLabel: dxfDimensionTypeLabel(firstNumber(entity.groups, 70)),
    measurement,
    tolerance: firstNumber(entity.groups, 43),
    styleName: firstValue(entity.groups, 7),
    blockName: firstValue(entity.groups, 2),
    definitionPoint: parsePoint(entity.groups, 10),
    referencePoint1: parsePoint(entity.groups, 13),
    referencePoint2: parsePoint(entity.groups, 14),
    referencePoint3: parsePoint(entity.groups, 15),
    locator: base.locator,
    reliability: measurement !== null ? "HIGH" : "MEDIUM",
    status: "OBSERVED_NOT_APPROVED",
    limitations: bounded(limitations),
  };
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

/**
 * Reads an INSERT record.
 *
 * Scale factors and rotation are preserved verbatim and never applied to
 * anything: VOKA does not transform geometry, explode blocks, or use a scale to
 * convert a coordinate. `blockMissing` records the case where the drawing
 * inserts a block it never defined, which is a real and reviewable defect in
 * the source file rather than something to paper over.
 */
export function buildDxfInsert(
  entity: RawDxfEntity,
  context: DxfEntityContext,
  base: { handle: string | null; ownerHandle: string | null; layerName: string | null; space: DxfSpace; layoutName: string | null; locator: string },
  attributes: DxfAttributeEvidence[] = [],
  attributeCount = 0,
  attributesTruncated = false,
  blockDefined = true,
): DxfBlockInsert | null {
  if (entity.type.toUpperCase() !== "INSERT") return null;
  const blockName = firstValue(entity.groups, 2) ?? "";
  const limitations: string[] = [];
  if (!blockName) limitations.push("the INSERT carried no block name");
  if (!blockDefined) limitations.push(`the drawing inserts the block '${blockName}' but defines no block with that name`);
  if (attributesTruncated) limitations.push(`only the first ${attributes.length} of ${attributeCount} attributes on this insert were retained`);
  return {
    id: `${base.handle ? `dxf-i:${base.handle}` : `dxf-i:pos:${context.position}`}`,
    handle: base.handle,
    ownerHandle: base.ownerHandle,
    blockName,
    blockMissing: !blockDefined,
    insertionPoint: parsePoint(entity.groups, 10),
    scaleX: firstNumber(entity.groups, 41),
    scaleY: firstNumber(entity.groups, 42),
    scaleZ: firstNumber(entity.groups, 43),
    rotationDegrees: firstNumber(entity.groups, 50),
    layerName: base.layerName,
    space: base.space,
    layoutName: base.layoutName,
    attributes: attributes.slice(0, context.maxAttributesPerRecord),
    attributeCount,
    attributesTruncated: attributesTruncated || attributeCount > attributes.length,
    locator: base.locator,
    reliability: blockName ? "HIGH" : "LOW",
    status: "OBSERVED_NOT_APPROVED",
    limitations: bounded(limitations),
  };
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export type BuildEntityResult = {
  entity: DxfEntityEvidence;
  /** ATTRIB/VERTEX bodies that follow this entity, already consumed by the caller. */
  trailing: RawDxfEntity[];
};

/**
 * Builds one bounded entity record from raw group codes.
 *
 * The entity keeps its verbatim type string even when VOKA has no model for it,
 * so an unmodelled `HATCH` or `WIPEOUT` is still visible as a fact about the
 * drawing rather than vanishing.
 */
export function buildEntityEvidence(raw: RawDxfEntity, context: DxfEntityContext, options: { blockDefined?: boolean } = {}): DxfEntityEvidence {
  const groups = raw.groups;
  const handle = firstValue(groups, 5);
  const ownerHandle = firstValue(groups, 330);
  const layerName = firstValue(groups, 8);
  const knownType: DxfEntityType = isDxfEntityType(raw.type.toUpperCase()) ? (raw.type.toUpperCase() as DxfEntityType) : "OTHER";
  const limitations: string[] = [];
  if (!handle) {
    limitations.push("the entity carried no handle, so it is referenced by its position in the file rather than by a CAD handle");
  }
  if (!layerName) limitations.push("the entity declared no layer");
  const locator = formatDxfLocator({
    section: locatorSection(context),
    blockName: context.blockName,
    layoutName: context.space === "PAPER_SPACE" ? context.layoutName : null,
    entityHandle: handle,
    ownerHandle,
    layerName,
  });
  const base = { handle, ownerHandle, layerName, space: context.space, layoutName: context.layoutName, locator };

  const geometry = buildDxfGeometry(raw.type, groups, context);
  const text = buildDxfText(raw, context, base);
  const dimension = buildDxfDimension(raw, context, base);
  const insert = buildDxfInsert(raw, context, base, [], 0, false, options.blockDefined ?? true);
  const attribute = buildDxfAttribute(raw, context, { ...base, insertHandle: null, blockName: null });

  if (knownType === "OTHER") {
    limitations.push(`the entity type ${raw.type} is outside what this phase models; its presence is recorded without its geometry`);
  }

  const reliability: ObservationReliability = handle && layerName ? "HIGH" : handle || layerName ? "MEDIUM" : "LOW";

  return {
    // A stable id per entity. When the file gave a handle the id carries it, so
    // the same drawing inspected twice yields the same ids. When it did not,
    // the id is positional and `handleMissing` says so.
    evidenceId: handle ? `dxf-e:${handle}` : `dxf-e:pos:${context.position}`,
    entityType: raw.type,
    knownType,
    handle,
    ownerHandle,
    handleMissing: !handle,
    layerName,
    space: context.space,
    spaceAttribution: context.spaceAttribution,
    layoutName: context.layoutName,
    paperSpaceFlag: firstFlag(groups, 67),
    blockName: context.blockName,
    geometry,
    text,
    dimension,
    insert,
    attribute,
    colorIndex: firstNumber(groups, 62),
    lineType: firstValue(groups, 6),
    locator,
    reliability,
    status: "OBSERVED_NOT_APPROVED",
    limitations: bounded(limitations),
  };
}

/**
 * True when the entity type is followed by a dependent sequence in the file.
 *
 * `POLYLINE` owns the `VERTEX` records up to `SEQEND`, and `INSERT` owns the
 * `ATTRIB` records up to `SEQEND`. The section walker consumes those into the
 * parent rather than recording them as independent entities, because an ATTRIB
 * floating on its own would lose the insert it belongs to — and the insert is
 * the only thing that says which device the attribute describes.
 */
export function ownsTrailingSequence(entityType: string): "VERTEX" | "ATTRIB" | null {
  const upper = entityType.toUpperCase();
  if (upper === "POLYLINE") return "VERTEX";
  if (upper === "INSERT") return "ATTRIB";
  return null;
}

export { DXF_PAGE_NUMBER, MAX_ATTRIBUTES_PER_RECORD };
