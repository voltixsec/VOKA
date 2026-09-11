import type { PageAttribution } from "./index";
import type { ObservationReliability } from "./PdfObservations";
import {
  MAX_SYMBOL_RELATIONSHIPS_PER_PAGE,
  boxArea,
  boxCenter,
  distancePointToBox,
  reliabilityFromConfidence,
  type GeometryEvidence,
  type NormalizedBox,
  type NormalizedPoint,
} from "./DrawingGeometry";

/**
 * Phase 2A-5: governed SYMBOL / LEGEND relationship intelligence.
 *
 * This module builds a relationship layer on top of the accepted 2A-4 symbol
 * vocabulary (LEGEND_ENTRY, SYMBOL_CANDIDATE, EQUIPMENT_REFERENCE). It may say
 * "this visible symbol candidate appears consistent with the legend entry
 * 'SD — Smoke Detector'". It may NEVER say "there are 37 smoke detectors".
 *
 * Hard rules:
 * - NO COUNTING. Symbol instances are retained as individual candidates only.
 *   There is deliberately no count, total, quantity, or aggregate field in this
 *   model, and no function here returns one. Counting, takeoff, and BOM belong
 *   to a later governed slice;
 * - a match is evidence-based and retains the page, the symbol region, the
 *   legend/source reference, the confidence, the matching method, and the
 *   limitations;
 * - ambiguity is preserved: comparable candidates are all retained and marked
 *   ambiguous. No confidence-based silent winner;
 * - a match is never a quantity, a selected product, a catalog item, a BOM
 *   line, or an approved engineering requirement.
 */

export const SYMBOL_MATCH_METHODS = [
  "EXPLICIT_LEGEND_LABEL",
  "VISUAL_SIMILARITY",
  "VECTOR_SHAPE_SIMILARITY",
  "NEARBY_EQUIPMENT_OR_TAG_TEXT",
  "SAME_PAGE_LEGEND_DEFINITION",
] as const;

export type SymbolMatchMethod = (typeof SYMBOL_MATCH_METHODS)[number];

export const SYMBOL_CHANNELS = ["DRAWING_VISION", "PDF_VECTOR", "NATIVE_TEXT", "OCR_TEXT"] as const;
export type SymbolChannel = (typeof SYMBOL_CHANNELS)[number];

/** Lowest disclosed confidence at which a symbol-to-legend match is reported at all. */
export const MIN_SYMBOL_MATCH_CONFIDENCE = 0.35;
/** Two matches this close in confidence are equally plausible: both are kept, both marked ambiguous. */
export const SYMBOL_AMBIGUITY_MARGIN = 0.1;
/** Widest normalized page-space distance at which nearby tag text is accepted as evidence. */
export const MAX_TAG_TEXT_DISTANCE = 0.05;

export const SYMBOL_NO_COUNT_LIMITATION =
  "symbol candidates are individual observations only: no symbol instance was counted, no quantity was derived, and no takeoff or BOM was produced";

export const SYMBOL_MATCH_LIMITATION =
  "a symbol match is evidence that a candidate is consistent with a legend entry; it is not an identification, not a count, and not a selected product";

const MAX_SYMBOL_LIMITATIONS = 6;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clipLimitations(limitations: string[]): string[] {
  return [...new Set(limitations)].slice(0, MAX_SYMBOL_LIMITATIONS);
}

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "an unattributed page" : `page ${pageNumber}`;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type LegendSymbolDefinition = {
  /** Stable document-scoped identifier such as "L-2". */
  id: string;
  pageNumber: number | null;
  attribution: PageAttribution;
  /** Verbatim legend label as printed, e.g. "SD — Smoke Detector". */
  label: string;
  /** Short code parsed from the label when it carries one, e.g. "SD". */
  code: string | null;
  channel: SymbolChannel;
  region: string | null;
  reliability: ObservationReliability;
  evidence: GeometryEvidence;
  limitations: string[];
};

export type SymbolInstanceCandidate = {
  /** Stable document-scoped identifier such as "S-7". */
  id: string;
  pageNumber: number | null;
  attribution: PageAttribution;
  source: SymbolChannel;
  /** Bounded description when the reading carries one; null otherwise. */
  description: string | null;
  /** Normalized page-space region; null when the reading carries no region. */
  region: NormalizedBox | null;
  /** Coarse shape descriptor, present only when a region exists. */
  shapeSignature: ShapeSignature | null;
  reliability: ObservationReliability;
  evidence: GeometryEvidence;
  limitations: string[];
};

export type SymbolToLegendCandidate = {
  id: string;
  pageNumber: number | null;
  symbolId: string;
  legendId: string;
  /** How the match was evidenced. */
  method: SymbolMatchMethod;
  /** Disclosed confidence in 0..1. */
  confidence: number;
  reliability: ObservationReliability;
  /** True when another candidate matched comparably well and no winner was chosen. */
  ambiguous: boolean;
  limitations: string[];
  evidence: GeometryEvidence;
};

export type SymbolToEquipmentReferenceCandidate = {
  id: string;
  pageNumber: number | null;
  symbolId: string;
  /** The equipment reference text, verbatim. */
  equipmentReference: string;
  sourceId: string | null;
  method: Extract<SymbolMatchMethod, "NEARBY_EQUIPMENT_OR_TAG_TEXT" | "EXPLICIT_LEGEND_LABEL">;
  confidence: number;
  reliability: ObservationReliability;
  limitations: string[];
  evidence: GeometryEvidence;
};

export type SymbolConflict = {
  pageNumber: number | null;
  kind: "SYMBOL_MATCH";
  detail: string;
};

export type PageSymbolResult = {
  pageNumber: number | null;
  legends: LegendSymbolDefinition[];
  symbols: SymbolInstanceCandidate[];
  legendMatches: SymbolToLegendCandidate[];
  equipmentMatches: SymbolToEquipmentReferenceCandidate[];
  conflicts: SymbolConflict[];
  truncated: boolean;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Shape signature (coarse, deterministic, never an identification)
// ---------------------------------------------------------------------------

export type ShapeSignature = {
  /** width / height of the region, clamped to a sane range. */
  aspect: number;
  /** Region area as a fraction of the page. */
  area: number;
  closed: boolean;
  /** Fraction of the outline built from curves, 0..1. */
  curveRatio: number;
};

/**
 * Coarse shape descriptor for a symbol region. It is deliberately coarse: it
 * can support "consistent with" evidence and can never identify a symbol on
 * its own.
 */
export function shapeSignatureOf(input: {
  box?: NormalizedBox | null;
  closed?: boolean;
  curveSegments?: number;
  segments?: number;
}): ShapeSignature | null {
  if (!input.box) return null;
  const width = Math.max(0, input.box.x1 - input.box.x0);
  const height = Math.max(0, input.box.y1 - input.box.y0);
  if (width === 0 && height === 0) return null;
  const aspect = height === 0 ? 4 : Math.min(4, Math.max(0.25, round(width / height, 3)));
  const segments = Math.max(1, input.segments ?? 1);
  const curveRatio = round(Math.min(1, Math.max(0, (input.curveSegments ?? 0) / segments)), 3);
  return { aspect, area: round(boxArea(input.box), 6), closed: input.closed ?? false, curveRatio };
}

/** Coarse similarity between two shape signatures, 0..1. Never an identification. */
export function shapeSimilarity(a: ShapeSignature | null, b: ShapeSignature | null): number {
  if (!a || !b) return 0;
  const aspectScore = 1 - Math.min(1, Math.abs(Math.log(a.aspect / b.aspect)) / Math.log(4));
  const areaScore = a.area === 0 && b.area === 0 ? 1 : 1 - Math.min(1, Math.abs(Math.log((a.area + 1e-6) / (b.area + 1e-6))) / Math.log(20));
  const closedScore = a.closed === b.closed ? 1 : 0.4;
  const curveScore = 1 - Math.min(1, Math.abs(a.curveRatio - b.curveRatio));
  return round(aspectScore * 0.4 + areaScore * 0.3 + closedScore * 0.15 + curveScore * 0.15, 3);
}

// ---------------------------------------------------------------------------
// Legend label parsing
// ---------------------------------------------------------------------------

/**
 * Parses a legend label into a code and a description.
 *
 * "SD — Smoke Detector" → code "SD", description "Smoke Detector".
 * A label without a separator has no code and is kept as printed: nothing is
 * invented to make it parseable.
 */
export function parseLegendLabel(label: string): { code: string | null; description: string } {
  const text = label.trim().replace(/\s+/gu, " ");
  const separated = text.match(/^([A-Za-z][A-Za-z0-9./-]{0,5})\s*(?:[-–—:|]|\.{2,})\s*(.+)$/u);
  if (separated) return { code: separated[1]!.toUpperCase(), description: separated[2]!.trim() };
  const leading = text.match(/^([A-Za-z]{1,3}\d{0,3})\s+(.+)$/u);
  if (leading && /^[A-Z]{1,3}\d{0,3}$/u.test(leading[1]!)) return { code: leading[1]!.toUpperCase(), description: leading[2]!.trim() };
  return { code: null, description: text };
}

/** True when `code` appears as a standalone token in `text`. */
export function mentionsCode(text: string, code: string): boolean {
  if (!code) return false;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[\\s,;:([|/–—-])${escaped}($|[\\s,;:)\]|/–—-])`, "u").test(text);
}

// ---------------------------------------------------------------------------
// Symbol / legend linking
// ---------------------------------------------------------------------------

export type SymbolMatchSource = {
  symbol: SymbolInstanceCandidate;
  /** Provider-supplied legend reference, when the reading carries one. */
  legendRef?: string | null;
  /** Provider-supplied similarity in 0..1, when the reading carries one. */
  similarity?: number | null;
};

export type EquipmentReferenceSource = {
  id: string | null;
  text: string;
  position?: NormalizedPoint | null;
  channel?: SymbolChannel;
};

/**
 * Links symbol-instance candidates to legend definitions and nearby equipment
 * references.
 *
 * Every match keeps its method, confidence, region, and limitations. Comparable
 * matches are all retained and marked ambiguous, so the output never implies
 * "this is the symbol" and never implies "there are N of them".
 */
export function linkSymbols(input: {
  pageNumber: number | null;
  symbols: SymbolMatchSource[];
  legends: LegendSymbolDefinition[];
  equipmentReferences?: EquipmentReferenceSource[];
  /** Shape signature of each legend entry when the reading supplies one. */
  legendShapes?: Record<string, ShapeSignature | null>;
  allocateId: (prefix: string) => string;
}): { legendMatches: SymbolToLegendCandidate[]; equipmentMatches: SymbolToEquipmentReferenceCandidate[]; conflicts: SymbolConflict[]; truncated: boolean; limitations: string[] } {
  const legendMatches: SymbolToLegendCandidate[] = [];
  const equipmentMatches: SymbolToEquipmentReferenceCandidate[] = [];
  const conflicts: SymbolConflict[] = [];
  const limitations: string[] = [];
  let truncated = false;
  const samePageLegend = input.legends.length > 0;

  const push = (candidate: SymbolToLegendCandidate) => {
    if (legendMatches.length >= MAX_SYMBOL_RELATIONSHIPS_PER_PAGE) {
      truncated = true;
      return;
    }
    legendMatches.push(candidate);
  };

  for (const entry of input.symbols) {
    const symbol = entry.symbol;
    const scored: Array<{ legend: LegendSymbolDefinition; method: SymbolMatchMethod; confidence: number; reason: string }> = [];

    for (const legend of input.legends) {
      // 1. An explicit legend label mentioned in the symbol's own reading.
      if (legend.code && symbol.description && mentionsCode(symbol.description, legend.code)) {
        scored.push({
          legend,
          method: "EXPLICIT_LEGEND_LABEL",
          confidence: 0.9,
          reason: `the symbol reading mentions the legend code "${legend.code}" explicitly`,
        });
        continue;
      }
      // 2. Provider-reported visual similarity to this legend entry.
      if (entry.legendRef && legend.code && mentionsCode(entry.legendRef, legend.code)) {
        const similarity = typeof entry.similarity === "number" && Number.isFinite(entry.similarity) ? Math.min(1, Math.max(0, entry.similarity)) : 0.6;
        scored.push({
          legend,
          method: "VISUAL_SIMILARITY",
          confidence: round(similarity, 3),
          reason: `the reading reports visual similarity to the legend entry "${legend.label}"`,
        });
        continue;
      }
      if (entry.legendRef && entry.legendRef.trim().toLocaleLowerCase() === legend.label.trim().toLocaleLowerCase()) {
        const similarity = typeof entry.similarity === "number" && Number.isFinite(entry.similarity) ? Math.min(1, Math.max(0, entry.similarity)) : 0.6;
        scored.push({
          legend,
          method: "VISUAL_SIMILARITY",
          confidence: round(similarity, 3),
          reason: `the reading names the legend entry "${legend.label}" directly`,
        });
        continue;
      }
      // 3. Coarse vector-shape consistency with the legend entry's own region.
      const legendShape = input.legendShapes?.[legend.id] ?? null;
      const similarity = shapeSimilarity(symbol.shapeSignature, legendShape);
      if (similarity > 0) {
        scored.push({
          legend,
          method: "VECTOR_SHAPE_SIMILARITY",
          confidence: round(Math.min(0.8, similarity), 3),
          reason: `the symbol region is coarsely shape-consistent with the legend entry "${legend.label}"`,
        });
      }
    }

    // 4. Nearby equipment / tag text is evidence in its own right.
    for (const reference of input.equipmentReferences ?? []) {
      if (!reference.position || !symbol.region) continue;
      const distance = distancePointToBox(reference.position, symbol.region);
      if (distance > MAX_TAG_TEXT_DISTANCE) continue;
      const confidence = round(Math.max(0.4, 1 - distance / MAX_TAG_TEXT_DISTANCE), 3);
      if (equipmentMatches.length >= MAX_SYMBOL_RELATIONSHIPS_PER_PAGE) {
        truncated = true;
        break;
      }
      equipmentMatches.push({
        id: input.allocateId("SE"),
        pageNumber: symbol.pageNumber,
        symbolId: symbol.id,
        equipmentReference: reference.text,
        sourceId: reference.id ?? null,
        method: "NEARBY_EQUIPMENT_OR_TAG_TEXT",
        confidence,
        reliability: reliabilityFromConfidence(confidence),
        limitations: clipLimitations([
          SYMBOL_MATCH_LIMITATION,
          SYMBOL_NO_COUNT_LIMITATION,
          "the equipment reference sits near the symbol region; proximity is evidence only and does not establish that the tag belongs to this symbol",
        ]),
        evidence: {
          locator: `${pageRef(symbol.pageNumber)}, ${symbol.id} near "${reference.text}"`,
          reason: `the equipment reference "${reference.text}" sits ${round(distance)} of a page from symbol candidate ${symbol.id}`,
          derivedFrom: [symbol.id, ...(reference.id ? [reference.id] : [])],
        },
      });
    }

    const eligible = scored.filter((item) => item.confidence >= MIN_SYMBOL_MATCH_CONFIDENCE);
    if (!eligible.length) continue;
    eligible.sort((left, right) => right.confidence - left.confidence || (left.legend.id < right.legend.id ? -1 : 1));
    const best = eligible[0]!.confidence;
    const tied = eligible.filter((item) => best - item.confidence <= SYMBOL_AMBIGUITY_MARGIN);
    for (const item of eligible.slice(0, 4)) {
      const ambiguous = tied.length > 1 && best - item.confidence <= SYMBOL_AMBIGUITY_MARGIN;
      const methodLimitations = [SYMBOL_MATCH_LIMITATION, SYMBOL_NO_COUNT_LIMITATION];
      if (item.method === "VECTOR_SHAPE_SIMILARITY") methodLimitations.push("shape consistency uses a coarse descriptor of the region; it cannot identify a symbol on its own");
      if (item.method === "VISUAL_SIMILARITY") methodLimitations.push("visual similarity was reported by the drawing-vision reading and is bounded by that reading's own limits");
      if (samePageLegend) methodLimitations.push(`the legend definition ${item.legend.id} is on the same page, which is context only and not proof of a match`);
      if (ambiguous) methodLimitations.push(`${tied.length} legend entr(y/ies) matched comparably, so no single legend entry was preferred`);
      push({
        id: input.allocateId("SL"),
        pageNumber: symbol.pageNumber,
        symbolId: symbol.id,
        legendId: item.legend.id,
        method: item.method,
        confidence: item.confidence,
        reliability: reliabilityFromConfidence(item.confidence),
        ambiguous,
        limitations: clipLimitations(methodLimitations),
        evidence: {
          locator: `${pageRef(symbol.pageNumber)}, ${symbol.id} → ${item.legend.id}`,
          reason: `symbol candidate ${symbol.id} ${item.reason}`,
          derivedFrom: [symbol.id, item.legend.id],
        },
      });
    }
    if (tied.length > 1) {
      conflicts.push({
        pageNumber: symbol.pageNumber,
        kind: "SYMBOL_MATCH",
        detail: `${pageRef(symbol.pageNumber)}: symbol candidate ${symbol.id} is consistent with more than one legend entry (${tied.map((item) => item.legend.label).join(" and ")}); every candidate was kept and none was preferred`,
      });
    }
  }

  if (truncated) limitations.push(`the symbol relationship bound of ${MAX_SYMBOL_RELATIONSHIPS_PER_PAGE} per page was reached; further candidates were not retained`);
  return { legendMatches, equipmentMatches, conflicts, truncated, limitations };
}

/**
 * Region centre for reporting. Exposed so the analyzer can build SYMBOL_REGION
 * geometry without re-deriving the maths.
 */
export function symbolRegionCenter(symbol: SymbolInstanceCandidate): NormalizedPoint | null {
  return symbol.region ? boxCenter(symbol.region) : null;
}
