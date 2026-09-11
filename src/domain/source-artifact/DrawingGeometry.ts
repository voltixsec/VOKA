import type { PageAttribution } from "./index";
import type { ObservationReliability } from "./PdfObservations";

/**
 * Phase 2A-5: bounded drawing GEOMETRY evidence model.
 *
 * This module owns the page-space coordinate system and the geometry
 * primitive vocabulary only. It holds no provider, no parser, no rasterizer,
 * and no business rules about what a drawing means commercially.
 *
 * Hard rules:
 * - geometry is PAGE SPACE ONLY. Coordinates are normalized to 0..1 against
 *   the page box (CropBox when present, otherwise MediaBox), with the origin
 *   at the bottom-left of the page AS DISPLAYED (after /Rotate). Nothing here
 *   is a real-world dimension: no primitive may claim metres, millimetres, or
 *   feet merely because coordinates exist;
 * - `pageNumber` is the caller's proven value. Content whose page attribution
 *   was never proven stays `UNATTRIBUTED` with `pageNumber: null` and can
 *   never acquire a page identity here;
 * - coordinates outside the page box are REJECTED, not invented. Only
 *   floating-point noise at the very edge is clamped, and clamping is
 *   disclosed;
 * - every page is bounded: primitive counts, points per polyline, and pages
 *   per document are capped, and truncation is always disclosed;
 * - geometry evidence is never a quantity, a count of equipment, a selected
 *   product, or an approved measurement. SYMBOL_REGION primitives are
 *   deliberately excluded from every aggregate so the no-counting boundary
 *   cannot be crossed by accident.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Only primitive types the 2A-5 analyzer can actually evidence are declared.
 * Extension lines, leader lines, and callout regions were deliberately NOT
 * included: distinguishing them from ordinary line work would require
 * inference this slice does not perform, and a vocabulary entry no code can
 * produce is an invitation to fabricate it later.
 */
export const GEOMETRY_PRIMITIVE_TYPES = [
  "LINE_SEGMENT",
  "POLYLINE",
  "RECTANGLE",
  "CIRCLE_OR_ARC",
  "REGION",
  "DIMENSION_LINE_CANDIDATE",
  "SYMBOL_REGION",
] as const;

export type GeometryPrimitiveType = (typeof GEOMETRY_PRIMITIVE_TYPES)[number];

const GEOMETRY_PRIMITIVE_TYPE_SET = new Set<string>(GEOMETRY_PRIMITIVE_TYPES);

export function isGeometryPrimitiveType(value: string): value is GeometryPrimitiveType {
  return GEOMETRY_PRIMITIVE_TYPE_SET.has(value);
}

/** Which reading produced the geometry. Vector geometry exists only when the source actually contains vector data. */
export const GEOMETRY_SOURCES = ["PDF_VECTOR", "DRAWING_VISION"] as const;
export type GeometrySource = (typeof GEOMETRY_SOURCES)[number];

/**
 * Geometry primitives whose per-page COUNT may be distilled for a bounded
 * language-model context. `SYMBOL_REGION` is deliberately absent: counting
 * symbol instances is out of scope and must never be distilled, printed, or
 * derived from this model.
 */
export const DISTILLABLE_GEOMETRY_TYPES = [
  "LINE_SEGMENT",
  "POLYLINE",
  "RECTANGLE",
  "CIRCLE_OR_ARC",
  "REGION",
  "DIMENSION_LINE_CANDIDATE",
] as const satisfies readonly GeometryPrimitiveType[];

const DISTILLABLE_GEOMETRY_TYPE_SET = new Set<string>(DISTILLABLE_GEOMETRY_TYPES);

// ---------------------------------------------------------------------------
// Bounds. Every limit is a hard cap; exceeding it truncates deterministically
// and the truncation is disclosed.
// ---------------------------------------------------------------------------

/** Maximum drawing pages whose geometry is extracted per document. */
export const MAX_GEOMETRY_PAGES_PER_DOCUMENT = 4;
/** Maximum retained geometry primitives per page. */
export const MAX_GEOMETRY_PRIMITIVES_PER_PAGE = 400;
/** Maximum retained points in one polyline. */
export const MAX_POINTS_PER_POLYLINE = 64;
/** Maximum retained original PDF user-space points kept for provenance on one primitive. */
export const MAX_PDF_POINTS_PER_PRIMITIVE = 64;
/** Maximum symbol-instance candidates per page (individual candidates only; never aggregated). */
export const MAX_SYMBOL_CANDIDATES_PER_PAGE = 40;
/** Maximum dimension text records per page. */
export const MAX_DIMENSION_CANDIDATES_PER_PAGE = 60;
/** Maximum symbol/legend relationship candidates per page. */
export const MAX_SYMBOL_RELATIONSHIPS_PER_PAGE = 60;
/** Maximum dimension-line candidates retained per page. */
export const MAX_DIMENSION_LINE_CANDIDATES_PER_PAGE = 60;
/** Maximum coordinate samples included in the distilled geometry context. */
export const MAX_DISTILLED_SAMPLES_PER_PAGE = 6;
/** Maximum characters of distilled geometry handed to a language model for one page. */
export const MAX_DISTILLED_CONTEXT_CHARACTERS = 600;
/** Maximum limitations recorded per page. */
export const MAX_GEOMETRY_LIMITATIONS_PER_PAGE = 8;

/** Coordinate precision retained in normalized page space. */
const COORDINATE_DECIMALS = 4;
/**
 * A point may sit at most this far outside the normalized page box before the
 * primitive is rejected. The window exists only for floating-point noise at
 * the page edge; anything beyond it is genuine out-of-page content and is
 * dropped rather than clamped into a false position.
 */
const BOUND_EPSILON = 1e-6;

export const GEOMETRY_BASELINE_LIMITATION =
  "geometry is expressed in normalized page space (0..1) with the origin at the bottom-left of the page as displayed; it is page geometry evidence, not a real-world measurement, and no unit is implied";

// ---------------------------------------------------------------------------
// Coordinate model
// ---------------------------------------------------------------------------

/** `[x0, y0, x1, y1]` in PDF user space. */
export type PageBox = readonly [number, number, number, number];

export type PageCoordinateFrame = {
  box: PageBox;
  boxSource: "CROP_BOX" | "MEDIA_BOX";
  /** Clockwise page rotation as declared by /Rotate, normalized to 0/90/180/270. */
  rotation: 0 | 90 | 180 | 270;
  /** User-space size of the box before rotation. */
  width: number;
  height: number;
  /** User-space size of the page as displayed, after rotation. */
  displayedWidth: number;
  displayedHeight: number;
};

/** A point in normalized page space: origin bottom-left of the displayed page, x right, y up. */
export type NormalizedPoint = { x: number; y: number };

/** An axis-aligned box in normalized page space, always with x0 <= x1 and y0 <= y1. */
export type NormalizedBox = { x0: number; y0: number; x1: number; y1: number };

/** A point in original PDF user space, kept only as provenance for vector geometry. */
export type PageSpacePoint = { x: number; y: number };

function isValidBox(box: PageBox | null | undefined): box is PageBox {
  if (!box || box.length !== 4) return false;
  return box.every((value) => typeof value === "number" && Number.isFinite(value)) && box[2] > box[0] && box[3] > box[1];
}

/**
 * Builds the canonical drawing-page coordinate frame.
 *
 * - CropBox wins over MediaBox when both are readable, because it is the
 *   visible page area; the choice is recorded in `boxSource`;
 * - /Rotate is normalized to a clockwise quarter-turn; any other value is
 *   treated as 0 and disclosed rather than silently accepted;
 * - a page without a usable box has no coordinate identity at all: the frame
 *   is null and no geometry may be produced for it.
 */
export function pageCoordinateFrame(input: {
  mediaBox: PageBox | null | undefined;
  cropBox?: PageBox | null;
  rotation?: number | null;
}): { frame: PageCoordinateFrame; limitations: string[] } | null {
  const limitations: string[] = [];
  const cropValid = isValidBox(input.cropBox);
  const mediaValid = isValidBox(input.mediaBox);
  const box = cropValid ? (input.cropBox as PageBox) : mediaValid ? (input.mediaBox as PageBox) : null;
  if (!box) return null;
  const boxSource = cropValid ? "CROP_BOX" : "MEDIA_BOX";
  if (cropValid && mediaValid) limitations.push("the page declares both a crop box and a media box; the crop box was used for normalization");
  const rawRotation = typeof input.rotation === "number" && Number.isFinite(input.rotation) ? input.rotation : 0;
  const normalizedRotation = ((Math.round(rawRotation / 90) * 90) % 360 + 360) % 360;
  if (normalizedRotation !== rawRotation) limitations.push(`the page declares a /Rotate value of ${rawRotation}, which is not a quarter turn; it was treated as ${normalizedRotation} for normalization`);
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  const rotated = normalizedRotation === 90 || normalizedRotation === 270;
  return {
    frame: {
      box,
      boxSource,
      rotation: normalizedRotation as 0 | 90 | 180 | 270,
      width,
      height,
      displayedWidth: rotated ? height : width,
      displayedHeight: rotated ? width : height,
    },
    limitations,
  };
}

function round(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Maps one PDF user-space point onto the canonical normalized page space.
 *
 * The mapping accounts for /Rotate so that (0,0) is always the bottom-left of
 * the page as a reader sees it:
 * - 0:   x → right,  y → up
 * - 90:  the page is rotated clockwise, so the original +y axis points right
 *        and the original +x axis points down
 * - 180: both axes are inverted
 * - 270: the original +y axis points left and the original +x axis points up
 *
 * Returns null when the point lies outside the page box by more than
 * floating-point noise: out-of-page content is rejected, never invented.
 */
export function normalizePagePoint(
  point: PageSpacePoint,
  frame: PageCoordinateFrame,
): { point: NormalizedPoint; clamped: boolean } | null {
  const [x0, y0, x1, y1] = frame.box;
  const width = frame.width;
  const height = frame.height;
  let u: number;
  let v: number;
  switch (frame.rotation) {
    case 90:
      u = (point.y - y0) / height;
      v = (x1 - point.x) / width;
      break;
    case 180:
      u = (x1 - point.x) / width;
      v = (y1 - point.y) / height;
      break;
    case 270:
      u = (y1 - point.y) / height;
      v = (point.x - x0) / width;
      break;
    default:
      u = (point.x - x0) / width;
      v = (point.y - y0) / height;
      break;
  }
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  let clamped = false;
  for (const value of [u, v]) {
    if (value < -BOUND_EPSILON || value > 1 + BOUND_EPSILON) return null;
  }
  if (u < 0 || u > 1) { u = Math.min(1, Math.max(0, u)); clamped = true; }
  if (v < 0 || v > 1) { v = Math.min(1, Math.max(0, v)); clamped = true; }
  return { point: { x: round(u), y: round(v) }, clamped };
}

/**
 * Normalizes a whole path. The path is rejected entirely when any point lies
 * outside the page box, so a partially out-of-page primitive can never be
 * silently reshaped into a plausible-looking in-page one.
 */
export function normalizePagePath(
  points: readonly PageSpacePoint[],
  frame: PageCoordinateFrame,
): { points: NormalizedPoint[]; clamped: boolean } | null {
  if (!points.length) return null;
  const out: NormalizedPoint[] = [];
  let clamped = false;
  for (const raw of points) {
    const normalized = normalizePagePoint(raw, frame);
    if (!normalized) return null;
    if (normalized.clamped) clamped = true;
    out.push(normalized.point);
  }
  return { points: out, clamped };
}

export function boundingBoxOf(points: readonly NormalizedPoint[]): NormalizedBox | null {
  if (!points.length) return null;
  let x0 = points[0]!.x;
  let y0 = points[0]!.y;
  let x1 = x0;
  let y1 = y0;
  for (const point of points) {
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }
  return { x0, y0, x1, y1 };
}

export function boxArea(box: NormalizedBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

/** Centre of a normalized box; used for conservative spatial association. */
export function boxCenter(box: NormalizedBox): NormalizedPoint {
  return { x: round((box.x0 + box.x1) / 2), y: round((box.y0 + box.y1) / 2) };
}

/** Shortest distance in normalized page space from a point to an axis-aligned box (0 when inside). */
export function distancePointToBox(point: NormalizedPoint, box: NormalizedBox): number {
  const dx = Math.max(box.x0 - point.x, 0, point.x - box.x1);
  const dy = Math.max(box.y0 - point.y, 0, point.y - box.y1);
  return Math.hypot(dx, dy);
}

/** Shortest distance in normalized page space from a point to a segment. */
export function distancePointToSegment(point: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  let t = ((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSquared;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(point.x - (a.x + t * vx), point.y - (a.y + t * vy));
}

export function segmentLength(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Maps a disclosed 0..1 confidence onto the ordinal reliability band. The
 * mapping is an engineering-review signal, not a probability, and it is the
 * same band the accepted 2A-3/2A-4 readings use so all channels stay
 * comparable.
 */
export function reliabilityFromConfidence(confidence: number | null | undefined): ObservationReliability {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return "MEDIUM";
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.5) return "MEDIUM";
  return "LOW";
}

/**
 * True when a segment runs (near-)parallel to a page axis. Axis alignment is
 * what makes a line a plausible dimension line at all; the tolerance is a
 * fraction of the page so it is scale independent.
 */
export function isAxisAligned(a: NormalizedPoint, b: NormalizedPoint, tolerance = 0.004): { aligned: boolean; horizontal: boolean; vertical: boolean } {
  const horizontal = Math.abs(a.y - b.y) <= tolerance;
  const vertical = Math.abs(a.x - b.x) <= tolerance;
  return { aligned: horizontal || vertical, horizontal, vertical };
}

// ---------------------------------------------------------------------------
// Geometry evidence model
// ---------------------------------------------------------------------------

export type GeometryEvidence = {
  /** Stable, human-readable locator: "page 4, vector path 12" or "drawing page 4, upper-left". */
  locator: string;
  /** Plain reason explaining what caused VOKA to believe this. */
  reason: string;
  /** Identifiers of the primitives or records this item was derived from. */
  derivedFrom?: string[];
};

export type GeometryPrimitive = {
  /** Stable document-scoped identifier such as "G-41". */
  id: string;
  type: GeometryPrimitiveType;
  source: GeometrySource;
  /** Proven page number, or null when attribution was never proven. Never invented. */
  pageNumber: number | null;
  attribution: PageAttribution;
  /** Normalized page-space points, in path order. */
  points: NormalizedPoint[];
  boundingBox: NormalizedBox | null;
  /** Original PDF user-space points, present only for PDF-vector provenance. */
  pdfPoints?: PageSpacePoint[];
  closed?: boolean;
  stroked?: boolean;
  filled?: boolean;
  reliability: ObservationReliability;
  evidence: GeometryEvidence;
  limitations: string[];
};

export type PageGeometry = {
  pageNumber: number | null;
  attribution: PageAttribution;
  source: GeometrySource;
  /** Coordinate frame used for this page; null when the page has no usable box. */
  frame: {
    boxSource: "CROP_BOX" | "MEDIA_BOX";
    rotation: 0 | 90 | 180 | 270;
    /** Page size in PDF points, as displayed. */
    widthPt: number;
    heightPt: number;
  } | null;
  primitives: GeometryPrimitive[];
  /** Counts observed before bounding, so truncation is honest. */
  observed: { paths: number; textAnchors: number };
  truncated: boolean;
  limitations: string[];
};

/** Stable document-scoped ids: "G-41" style, deterministic in traversal order. */
export type IdAllocator = { next: (prefix: string) => string };

export function createIdAllocator(): IdAllocator {
  const counters = new Map<string, number>();
  return {
    next: (prefix: string) => {
      const value = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, value);
      return `${prefix}-${value}`;
    },
  };
}

/**
 * Builds a geometry primitive, enforcing the page-space contract:
 * - an unproven page keeps `pageNumber: null` and `UNATTRIBUTED` attribution;
 * - the baseline page-space limitation is always present;
 * - points are capped and the cap is disclosed.
 */
export function createGeometryPrimitive(input: {
  id: string;
  type: GeometryPrimitiveType;
  source: GeometrySource;
  pageNumber: number | null;
  attribution: PageAttribution;
  points: NormalizedPoint[];
  pdfPoints?: PageSpacePoint[];
  closed?: boolean;
  stroked?: boolean;
  filled?: boolean;
  reliability: ObservationReliability;
  evidence: GeometryEvidence;
  limitations?: string[];
}): GeometryPrimitive {
  const pageNumber = input.attribution === "PAGE_TREE" ? input.pageNumber : null;
  const limitations = [...(input.limitations ?? [])];
  const points = input.points.slice(0, MAX_POINTS_PER_POLYLINE);
  if (input.points.length > MAX_POINTS_PER_POLYLINE) {
    limitations.push(`the polyline was truncated to ${MAX_POINTS_PER_POLYLINE} points for bounded storage`);
  }
  const pdfPoints = input.pdfPoints?.slice(0, MAX_PDF_POINTS_PER_PRIMITIVE);
  if (input.pdfPoints && input.pdfPoints.length > MAX_PDF_POINTS_PER_PRIMITIVE) {
    limitations.push(`the original PDF coordinates were truncated to ${MAX_PDF_POINTS_PER_PRIMITIVE} points`);
  }
  return {
    id: input.id,
    type: input.type,
    source: input.source,
    pageNumber,
    attribution: input.attribution,
    points,
    boundingBox: boundingBoxOf(points),
    ...(pdfPoints ? { pdfPoints } : {}),
    ...(input.closed === undefined ? {} : { closed: input.closed }),
    ...(input.stroked === undefined ? {} : { stroked: input.stroked }),
    ...(input.filled === undefined ? {} : { filled: input.filled }),
    reliability: input.reliability,
    evidence: input.evidence,
    limitations: [...new Set([GEOMETRY_BASELINE_LIMITATION, ...limitations])].slice(0, MAX_GEOMETRY_LIMITATIONS_PER_PAGE),
  };
}

// ---------------------------------------------------------------------------
// Bounded distilled geometry context
// ---------------------------------------------------------------------------

export type DistilledGeometryPage = {
  pageNumber: number | null;
  /** Per-type counts of structural primitives. Symbol regions are never counted. */
  primitivesByType: Partial<Record<GeometryPrimitiveType, number>>;
  /** A few rounded bounding boxes, so the model gets shape context without the vector dump. */
  samples: string[];
  /** Bounded plain-text summary handed to a language model. */
  text: string;
};

/**
 * Distils page geometry into a small, bounded summary suitable for a language
 * model. It carries structural counts and a handful of rounded boxes only:
 * never the full primitive list (thousands of vectors would explode the
 * prompt), and never any count of symbol regions, symbol instances, or
 * equipment.
 */
export function distillPageGeometry(page: PageGeometry): DistilledGeometryPage {
  const primitivesByType: Partial<Record<GeometryPrimitiveType, number>> = {};
  const samples: string[] = [];
  for (const primitive of page.primitives) {
    if (!DISTILLABLE_GEOMETRY_TYPE_SET.has(primitive.type)) continue;
    primitivesByType[primitive.type] = (primitivesByType[primitive.type] ?? 0) + 1;
    if (samples.length < MAX_DISTILLED_SAMPLES_PER_PAGE && primitive.boundingBox) {
      const box = primitive.boundingBox;
      samples.push(`${primitive.type.toLowerCase()}@${box.x0},${box.y0}-${box.x1},${box.y1}`);
    }
  }
  const counts = DISTILLABLE_GEOMETRY_TYPES.filter((type) => primitivesByType[type]).map((type) => `${primitivesByType[type]} ${type.toLowerCase().replace(/_/gu, " ")}(s)`);
  const where = page.pageNumber === null ? "an unattributed page" : `page ${page.pageNumber}`;
  const text = counts.length
    ? `${where}: bounded vector geometry summary — ${counts.join(", ")}${samples.length ? `; sample boxes ${samples.join("; ")}` : ""}. Page-space coordinates only; no real-world measurement was derived.`
    : `${where}: no bounded vector geometry was retained.`;
  return {
    pageNumber: page.pageNumber,
    primitivesByType,
    samples,
    text: text.slice(0, MAX_DISTILLED_CONTEXT_CHARACTERS),
  };
}

export type DistilledGeometryContext = {
  pages: DistilledGeometryPage[];
  /** Bounded plain-text block; empty when no geometry was retained. */
  text: string;
  limitations: string[];
};

export function distillGeometryContext(pages: PageGeometry[]): DistilledGeometryContext {
  const distilled = pages.map(distillPageGeometry);
  const limitations = [...new Set(pages.flatMap((page) => page.limitations))].slice(0, MAX_GEOMETRY_LIMITATIONS_PER_PAGE);
  return {
    pages: distilled,
    text: distilled.map((entry) => entry.text).join(" ").slice(0, MAX_DISTILLED_CONTEXT_CHARACTERS * MAX_GEOMETRY_PAGES_PER_DOCUMENT),
    limitations,
  };
}
