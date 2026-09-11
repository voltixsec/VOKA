import type { PageAttribution } from "./index";
import type { ObservationReliability } from "./PdfObservations";
import {
  GEOMETRY_BASELINE_LIMITATION,
  MAX_DIMENSION_CANDIDATES_PER_PAGE,
  distancePointToSegment,
  reliabilityFromConfidence,
  segmentLength,
  type GeometryEvidence,
  type NormalizedPoint,
} from "./DrawingGeometry";

/**
 * Phase 2A-5: PRINTED dimension annotation intelligence.
 *
 * This module understands printed dimensions — it never measures geometry.
 * A printed "3500" is evidence that those characters appear on the sheet; it
 * is not evidence that anything is 3500 of any unit long, and it is never
 * converted.
 *
 * Hard rules:
 * - a dimension record is a LITERAL. There is deliberately no converted,
 *   normalized, or metric field anywhere in this model: "3500" stays "3500";
 * - a unit is recorded only when the printed text carries one. A bare number
 *   never acquires a unit by inference, page size, title-block convention, or
 *   familiarity;
 * - association to a dimension line is conservative: the text must sit near a
 *   credible dimension-line candidate, the distance and confidence are
 *   retained, plausible alternatives are retained side by side, and no winner
 *   is ever forced;
 * - a printed scale is captured as a calibration CANDIDATE only. It is never
 *   applied: no page distance is converted into a real-world measurement, and
 *   no length, area, or quantity is produced;
 * - conflicting readings (native vs OCR vs vision, or 1:50 vs 1:100) are all
 *   preserved with their own provenance. Nothing is silently resolved.
 */

export const DIMENSION_RECORD_TYPES = [
  "DIMENSION_TEXT",
  "DIMENSION_UNIT",
  "DIMENSION_LINE_REFERENCE",
  "DIMENSION_ASSOCIATION",
  "PRINTED_SCALE",
  "LEVEL_REFERENCE",
  "GRID_REFERENCE",
] as const;

export type DimensionRecordType = (typeof DIMENSION_RECORD_TYPES)[number];

export const DIMENSION_KINDS = ["LENGTH", "DIAMETER", "RADIUS", "LEVEL", "GRID", "UNKNOWN"] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

/** Which reading the printed text came from. The channels never merge. */
export const DIMENSION_CHANNELS = ["NATIVE_TEXT", "OCR_TEXT", "DRAWING_VISION"] as const;
export type DimensionChannel = (typeof DIMENSION_CHANNELS)[number];

export const DIMENSION_TEXT_LIMITATION =
  "a printed dimension is the literal text printed on the sheet; it was not converted into a real-world measurement and no scale was applied";

export const SCALE_NOT_APPLIED_LIMITATION =
  "the printed scale was captured as a calibration candidate only; it was never used to convert a page distance into a real-world measurement";

/** Widest normalized page-space distance at which text may be associated with a dimension line. */
export const MAX_DIMENSION_ASSOCIATION_DISTANCE = 0.06;
/** Two candidates this close in distance are equally plausible: both are retained as ambiguous. */
export const DIMENSION_AMBIGUITY_MARGIN = 0.01;
/** Upper bound of association candidates retained per dimension text. */
export const MAX_ASSOCIATIONS_PER_DIMENSION_TEXT = 4;
/** A credible dimension line is at least this long, as a fraction of the page. */
export const MIN_DIMENSION_LINE_LENGTH = 0.015;
/** ... and at most this long. */
export const MAX_DIMENSION_LINE_LENGTH = 0.95;

const MAX_DIMENSION_LIMITATIONS = 6;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clipLimitations(limitations: string[]): string[] {
  return [...new Set(limitations)].slice(0, MAX_DIMENSION_LIMITATIONS);
}

// ---------------------------------------------------------------------------
// Printed dimension parsing
// ---------------------------------------------------------------------------

const NUMBER = "\\d{1,7}(?:[.,]\\d{1,3})?";
const UNIT_TOKENS = "mm|cm|m|metre|metres|meter|meters|ft|feet|foot|in|inch|inches|\"|'";

const SCALE_PATTERN = new RegExp(`^(?:scale|sc)\\b\\s*[:.]?\\s*(1\\s*[:\\/]\\s*(${NUMBER}))$`, "iu");
const SCALE_BARE_PATTERN = new RegExp(`^1\\s*[:\\/]\\s*(${NUMBER})$`, "u");
const LEVEL_PATTERN = new RegExp(`^(?:el|elev|elevation|level)\\b\\s*[:.]?\\s*([+-]?${NUMBER})\\s*(?:(${UNIT_TOKENS}))?$`, "iu");
const GRID_PATTERN = /^(?:grid|gr|axis)\b\s*[:.]?\s*([A-Za-z]{1,2}\s*(?:[\/-]\s*\d{1,3})?|\d{1,3}\s*(?:[\/-]\s*[A-Za-z]{1,2})?|[A-Za-z]{1,3})$/iu;
const DIAMETER_PATTERN = new RegExp(`^(?:[ø⌀ɸ]|phi|dia\\.?|d\\s*\\.)\\s*(${NUMBER})\\s*(?:(${UNIT_TOKENS}))?$`, "iu");
const RADIUS_PATTERN = new RegExp(`^r\\s*\\.?\\s*(${NUMBER})\\s*(?:(${UNIT_TOKENS}))?$`, "iu");
const LENGTH_WITH_UNIT_PATTERN = new RegExp(`^(${NUMBER})\\s*(${UNIT_TOKENS})$`, "iu");
const FEET_INCH_PATTERN = new RegExp(`^(\\d{1,3})\\s*'\\s*-?\\s*(\\d{1,2}(?:\\.\\d+)?)?\\s*(?:")?$`, "u");
const BARE_NUMBER_PATTERN = new RegExp(`^(${NUMBER})$`, "u");

export type ParsedDimension = {
  kind: DimensionKind;
  /** Verbatim matched text, trimmed. */
  raw: string;
  /** Verbatim numeric portion, e.g. "3.50". Never parsed into a number for measurement. */
  numericText: string | null;
  /** Verbatim unit token when the printed text carries one; null otherwise. */
  unit: string | null;
  limitations: string[];
};

/**
 * Parses one printed token into a bounded dimension reading.
 *
 * Only explicit evidence is accepted: a unit is recorded when the printed text
 * carries one, a level needs a level marker, and a grid reference needs a grid
 * marker. A bare number is recorded as a LENGTH candidate with NO unit and a
 * limitation saying exactly that.
 */
export function parseDimensionToken(raw: string): ParsedDimension | null {
  const text = raw.trim().replace(/\s+/gu, " ");
  if (!text || text.length > 40) return null;

  const level = LEVEL_PATTERN.exec(text);
  if (level) {
    return { kind: "LEVEL", raw: text, numericText: level[1] ?? null, unit: level[2] ?? null, limitations: ["level reference read as printed; it is a level marker on the sheet, not a verified elevation"] };
  }
  const grid = GRID_PATTERN.exec(text);
  if (grid) {
    return { kind: "GRID", raw: text, numericText: null, unit: null, limitations: ["grid reference read as printed; the referenced grid line was not located or verified"] };
  }
  const diameter = DIAMETER_PATTERN.exec(text);
  if (diameter) {
    return { kind: "DIAMETER", raw: text, numericText: diameter[1] ?? null, unit: diameter[2] ?? null, limitations: ["diameter prefix read as printed; the symbol it belongs to was not identified"] };
  }
  const radius = RADIUS_PATTERN.exec(text);
  if (radius) {
    return { kind: "RADIUS", raw: text, numericText: radius[1] ?? null, unit: radius[2] ?? null, limitations: ["radius prefix read as printed; the arc it belongs to was not identified"] };
  }
  const feetInch = FEET_INCH_PATTERN.exec(text);
  if (feetInch) {
    return { kind: "LENGTH", raw: text, numericText: feetInch[1] ?? null, unit: "ft-in", limitations: ["feet/inch notation read as printed; it was not converted into any other unit"] };
  }
  const withUnit = LENGTH_WITH_UNIT_PATTERN.exec(text);
  if (withUnit) {
    return { kind: "LENGTH", raw: text, numericText: withUnit[1] ?? null, unit: withUnit[2] ?? null, limitations: [] };
  }
  const bare = BARE_NUMBER_PATTERN.exec(text);
  if (bare) {
    const numericText = bare[1] ?? null;
    const limitations = ["the printed number carries no unit, so no unit was assigned and no conversion was performed"];
    const asInteger = Number((numericText ?? "").replace(/,/gu, "."));
    if (Number.isFinite(asInteger) && Number.isInteger(asInteger) && asInteger >= 1900 && asInteger <= 2100) {
      limitations.push("a bare four-digit number in this range may be a year or a reference rather than a dimension");
    }
    return { kind: "LENGTH", raw: text, numericText, unit: null, limitations };
  }
  return null;
}

export type ParsedScale = {
  /** Verbatim printed scale text, e.g. "1:100". */
  printed: string;
  /** Candidate ratio metadata (e.g. 100 for "1:100"). Never applied. */
  ratio: number | null;
  limitations: string[];
};

/**
 * Parses printed scale text into a calibration CANDIDATE.
 *
 * The ratio is metadata describing the printed characters only. Nothing in
 * this module, and nothing downstream in 2A-5, multiplies a page distance by
 * it. "NTS" (not to scale) yields a candidate with a null ratio rather than a
 * guessed one.
 */
export function parseScaleToken(raw: string): ParsedScale | null {
  const text = raw.trim().replace(/\s+/gu, " ");
  if (!text || text.length > 60) return null;
  if (/^n\.?t\.?s\.?$/iu.test(text) || /\bnot\s+to\s+scale\b/iu.test(text)) {
    return { printed: text, ratio: null, limitations: ["the sheet states it is not to scale; no ratio was inferred"] };
  }
  const labelled = SCALE_PATTERN.exec(text);
  const bare = labelled ? null : SCALE_BARE_PATTERN.exec(text);
  const match = labelled ?? bare;
  if (!match) return null;
  const value = Number((match[2] ?? match[1] ?? "").replace(/,/gu, "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    printed: text,
    ratio: round(value, 4),
    limitations: [],
  };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type DimensionTextRecord = {
  /** Stable document-scoped identifier such as "D-12". */
  id: string;
  pageNumber: number | null;
  attribution: PageAttribution;
  channel: DimensionChannel;
  /** Verbatim printed text, e.g. "1200 mm". */
  raw: string;
  /** Verbatim numeric portion; never converted. */
  numericText: string | null;
  /** Verbatim unit token when printed; null otherwise. */
  unit: string | null;
  kind: DimensionKind;
  /** Position in normalized page space. Null for OCR text, which carries no word positions. */
  position: NormalizedPoint | null;
  /** Bounded region vocabulary for vision readings; null when unknown. */
  region: string | null;
  reliability: ObservationReliability;
  evidence: GeometryEvidence;
  limitations: string[];
};

export const DIMENSION_ASSOCIATION_STATUS = "ASSOCIATION_CANDIDATE" as const;

export type DimensionAssociation = {
  id: string;
  pageNumber: number | null;
  /** The printed dimension text. */
  dimensionTextId: string;
  /** The geometry primitive this text may annotate. */
  dimensionLineCandidateId: string;
  /** Normalized page-space distance between the text anchor and the line. */
  distance: number;
  /** Disclosed heuristic confidence in 0..1, derived from proximity only. */
  confidence: number;
  reliability: ObservationReliability;
  status: typeof DIMENSION_ASSOCIATION_STATUS;
  limitations: string[];
  evidence: GeometryEvidence;
};

export const SCALE_CANDIDATE_STATUS = "SCALE_CALIBRATION_CANDIDATE_NOT_APPLIED" as const;

export type ScaleCalibrationCandidate = {
  id: string;
  pageNumber: number | null;
  attribution: PageAttribution;
  /** Verbatim printed scale text, e.g. "1:100". */
  printed: string;
  /** Candidate ratio metadata; null when the sheet states no scale. Never applied. */
  ratio: number | null;
  channel: DimensionChannel;
  reliability: ObservationReliability;
  status: typeof SCALE_CANDIDATE_STATUS;
  evidence: GeometryEvidence;
  limitations: string[];
};

export type DimensionConflict = {
  pageNumber: number | null;
  kind: "SCALE" | "DIMENSION_TEXT";
  /** Plain-language, reviewable description naming both readings. */
  detail: string;
};

export type PageDimensionResult = {
  pageNumber: number | null;
  texts: DimensionTextRecord[];
  associations: DimensionAssociation[];
  scales: ScaleCalibrationCandidate[];
  conflicts: DimensionConflict[];
  truncated: boolean;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export type DimensionSource = {
  text: string;
  channel: DimensionChannel;
  /** Normalized page-space position; null for OCR text, which has no word positions. */
  position?: NormalizedPoint | null;
  region?: string | null;
  /** Identifier of the source record for provenance, e.g. an anchor or observation id. */
  sourceId?: string | null;
  reliability?: ObservationReliability;
};

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "an unattributed page" : `page ${pageNumber}`;
}

function channelRef(channel: DimensionChannel): string {
  return channel === "NATIVE_TEXT" ? "native text" : channel === "OCR_TEXT" ? "OCR text" : "drawing vision";
}

/**
 * Collects printed dimension records from one page's readings.
 *
 * - every channel is kept separate; identical values from different channels
 *   are both preserved and reported as an agreement note, never merged;
 * - OCR text has no word positions, so OCR dimensions carry `position: null`
 *   and can never be spatially associated with a line;
 * - the per-page cap is enforced deterministically and truncation is disclosed.
 */
export function collectDimensionTexts(input: {
  pageNumber: number | null;
  attribution: PageAttribution;
  sources: DimensionSource[];
  allocateId: (prefix: string) => string;
}): { texts: DimensionTextRecord[]; scales: ScaleCalibrationCandidate[]; conflicts: DimensionConflict[]; truncated: boolean; limitations: string[] } {
  const texts: DimensionTextRecord[] = [];
  const scales: ScaleCalibrationCandidate[] = [];
  const conflicts: DimensionConflict[] = [];
  const limitations: string[] = [];
  let truncated = false;
  let dropped = 0;

  for (const source of input.sources) {
    const value = source.text.trim();
    if (!value) continue;
    const scale = parseScaleToken(value);
    if (scale) {
      scales.push({
        id: input.allocateId("SC"),
        pageNumber: input.attribution === "PAGE_TREE" ? input.pageNumber : null,
        attribution: input.attribution,
        printed: scale.printed,
        ratio: scale.ratio,
        channel: source.channel,
        reliability: source.reliability ?? "MEDIUM",
        status: SCALE_CANDIDATE_STATUS,
        evidence: {
          locator: `${pageRef(input.pageNumber)}, ${channelRef(source.channel)}`,
          reason: `the printed scale "${scale.printed}" appears in the ${channelRef(source.channel)} reading of ${pageRef(input.pageNumber)}`,
          ...(source.sourceId ? { derivedFrom: [source.sourceId] } : {}),
        },
        limitations: clipLimitations([SCALE_NOT_APPLIED_LIMITATION, ...scale.limitations]),
      });
      continue;
    }
    const parsed = parseDimensionToken(value);
    if (!parsed) continue;
    if (texts.length >= MAX_DIMENSION_CANDIDATES_PER_PAGE) {
      truncated = true;
      dropped += 1;
      continue;
    }
    const position = source.channel === "OCR_TEXT" ? null : (source.position ?? null);
    const limitationsForRecord = [...parsed.limitations];
    if (source.channel === "OCR_TEXT") limitationsForRecord.push("this reading came from OCR, which reports no word positions, so no dimension-line association was attempted for it");
    if (source.channel === "DRAWING_VISION") limitationsForRecord.push("this reading came from drawing vision, so its position is a bounded region hint rather than a measured coordinate");
    texts.push({
      id: input.allocateId("D"),
      pageNumber: input.attribution === "PAGE_TREE" ? input.pageNumber : null,
      attribution: input.attribution,
      channel: source.channel,
      raw: parsed.raw,
      numericText: parsed.numericText,
      unit: parsed.unit,
      kind: parsed.kind,
      position,
      region: source.region ?? null,
      reliability: source.reliability ?? "MEDIUM",
      evidence: {
        locator: `${pageRef(input.pageNumber)}, ${channelRef(source.channel)}${source.region ? `, ${source.region}` : ""}`,
        reason: `the printed text "${parsed.raw}" appears in the ${channelRef(source.channel)} reading of ${pageRef(input.pageNumber)}`,
        ...(source.sourceId ? { derivedFrom: [source.sourceId] } : {}),
      },
      limitations: clipLimitations([DIMENSION_TEXT_LIMITATION, ...limitationsForRecord]),
    });
  }

  if (dropped > 0) limitations.push(`${dropped} further printed dimension candidate(s) were not retained because the ${MAX_DIMENSION_CANDIDATES_PER_PAGE}-per-page bound was reached`);

  // Cross-channel disagreement: same page, different printed values, different
  // channels. Both readings are kept; only a review note is added.
  for (const text of texts) {
    const disagreeing = texts.find((other) => other.id !== text.id && other.channel !== text.channel && other.kind === text.kind && other.raw !== text.raw && other.pageNumber === text.pageNumber);
    if (disagreeing && !conflicts.some((conflict) => conflict.detail.includes(text.raw) && conflict.detail.includes(disagreeing.raw))) {
      conflicts.push({
        pageNumber: text.pageNumber,
        kind: "DIMENSION_TEXT",
        detail: `${pageRef(text.pageNumber)}: the ${channelRef(text.channel)} reading "${text.raw}" and the ${channelRef(disagreeing.channel)} reading "${disagreeing.raw}" disagree; both were kept for review and neither was converted or preferred`,
      });
    }
  }

  // Conflicting printed scales are preserved side by side; no winner is chosen.
  const distinctRatios = [...new Set(scales.map((scale) => scale.ratio).filter((ratio): ratio is number => ratio !== null))];
  const distinctPrinted = [...new Set(scales.map((scale) => scale.printed))];
  if (distinctRatios.length > 1 || distinctPrinted.length > 1) {
    conflicts.push({
      pageNumber: input.attribution === "PAGE_TREE" ? input.pageNumber : null,
      kind: "SCALE",
      detail: `${pageRef(input.pageNumber)}: the printed scale was observed more than once (${distinctPrinted.join(" and ")}); every reading was kept and none was applied`,
    });
  }

  return { texts, scales, conflicts, truncated, limitations };
}

// ---------------------------------------------------------------------------
// Dimension-line candidates and association
// ---------------------------------------------------------------------------

export type DimensionLineCandidate = {
  id: string;
  a: NormalizedPoint;
  b: NormalizedPoint;
  length: number;
  horizontal: boolean;
  vertical: boolean;
};

/**
 * Selects credible dimension-line candidates from already-extracted geometry.
 *
 * A line qualifies only when it is axis-aligned and its length falls inside a
 * plausible dimension-line window. It remains a CANDIDATE: qualification says
 * the line could carry a dimension, never that it does.
 */
export function dimensionLineCandidatesOf(
  primitives: ReadonlyArray<{ id: string; type: string; points: NormalizedPoint[] }>,
): DimensionLineCandidate[] {
  const out: DimensionLineCandidate[] = [];
  for (const primitive of primitives) {
    if (primitive.type !== "LINE_SEGMENT" && primitive.type !== "DIMENSION_LINE_CANDIDATE") continue;
    if (primitive.points.length < 2) continue;
    const a = primitive.points[0]!;
    const b = primitive.points[primitive.points.length - 1]!;
    const length = segmentLength(a, b);
    if (length < MIN_DIMENSION_LINE_LENGTH || length > MAX_DIMENSION_LINE_LENGTH) continue;
    const horizontal = Math.abs(a.y - b.y) <= 0.004;
    const vertical = Math.abs(a.x - b.x) <= 0.004;
    if (!horizontal && !vertical) continue;
    out.push({ id: primitive.id, a, b, length: round(length), horizontal, vertical });
  }
  return out;
}

/**
 * Associates printed dimension text with nearby dimension-line candidates.
 *
 * Conservative by construction:
 * - only text with a real position (native or vision) participates; OCR text,
 *   which has no word positions, is never associated;
 * - every candidate inside the proximity bound is retained, sorted by
 *   distance, up to a small cap;
 * - when several candidates are almost equally close they are all marked
 *   ambiguous instead of a winner being forced;
 * - confidence is a disclosed proximity heuristic, never a claim that the
 *   text annotates that line.
 */
export function associateDimensions(input: {
  pageNumber: number | null;
  texts: DimensionTextRecord[];
  candidates: DimensionLineCandidate[];
  allocateId: (prefix: string) => string;
  maxDistance?: number;
}): { associations: DimensionAssociation[]; limitations: string[] } {
  const maxDistance = input.maxDistance ?? MAX_DIMENSION_ASSOCIATION_DISTANCE;
  const associations: DimensionAssociation[] = [];
  const limitations: string[] = [];
  let ambiguous = 0;

  for (const text of input.texts) {
    if (!text.position) continue;
    if (text.kind === "LEVEL" || text.kind === "GRID") continue;
    const scored: Array<{ candidate: DimensionLineCandidate; distance: number }> = [];
    for (const candidate of input.candidates) {
      const distance = distancePointToSegment(text.position, candidate.a, candidate.b);
      if (distance <= maxDistance) scored.push({ candidate, distance });
    }
    if (!scored.length) continue;
    scored.sort((left, right) => left.distance - right.distance || (left.candidate.id < right.candidate.id ? -1 : 1));
    const kept = scored.slice(0, MAX_ASSOCIATIONS_PER_DIMENSION_TEXT);
    const best = kept[0]!.distance;
    const tied = kept.filter((entry) => entry.distance - best <= DIMENSION_AMBIGUITY_MARGIN);
    for (const entry of kept) {
      const confidence = round(Math.max(0, 1 - entry.distance / maxDistance), 3);
      const isTied = tied.length > 1 && entry.distance - best <= DIMENSION_AMBIGUITY_MARGIN;
      const entryLimitations = [
        "association is a proximity candidate only: it does not establish that the printed text annotates this line, and no measurement was derived from it",
      ];
      if (isTied) {
        ambiguous += 1;
        entryLimitations.push(`${tied.length} dimension-line candidate(s) sit at a comparable distance, so no single line was preferred`);
      }
      if (scored.length > kept.length) entryLimitations.push(`${scored.length - kept.length} further nearby candidate(s) were not retained for this text`);
      associations.push({
        id: input.allocateId("DA"),
        pageNumber: text.pageNumber,
        dimensionTextId: text.id,
        dimensionLineCandidateId: entry.candidate.id,
        distance: round(entry.distance),
        confidence,
        reliability: reliabilityFromConfidence(confidence),
        status: DIMENSION_ASSOCIATION_STATUS,
        limitations: clipLimitations(entryLimitations),
        evidence: {
          locator: `${pageRef(text.pageNumber)}, ${channelRef(text.channel)} near ${entry.candidate.id}`,
          reason: `the printed text "${text.raw}" from ${channelRef(text.channel)} sits ${round(entry.distance)} of a page away from dimension-line candidate ${entry.candidate.id}`,
          derivedFrom: [text.id, entry.candidate.id],
        },
      });
    }
  }

  if (ambiguous > 0) {
    limitations.push(`${ambiguous} dimension association(s) were ambiguous: several dimension-line candidates sat at a comparable distance and all were kept for review`);
  }
  return { associations, limitations };
}

/** True when a dimension record carries an explicitly printed unit. */
export function hasExplicitUnit(record: DimensionTextRecord): boolean {
  return Boolean(record.unit);
}

/** Human-facing record type for a dimension record, used by the projection and briefs. */
export function dimensionRecordTypeFor(record: DimensionTextRecord): DimensionRecordType {
  if (record.kind === "LEVEL") return "LEVEL_REFERENCE";
  if (record.kind === "GRID") return "GRID_REFERENCE";
  return "DIMENSION_TEXT";
}
