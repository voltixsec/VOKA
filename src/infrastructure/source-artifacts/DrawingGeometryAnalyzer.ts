import type { DrawingGeometryProjectionInput } from "@/src/application/source-artifacts";
import type { AnalyzedPdfInspection } from "./DocumentInspectionAnalyzer";
import { PdfDocumentParser, type PdfPageRecord } from "./pdf/PdfDocument";
import { PdfContentInterpreter } from "./pdf/PdfContentInterpreter";
import {
  MAX_DIMENSION_CANDIDATES_PER_PAGE,
  MAX_DIMENSION_LINE_CANDIDATES_PER_PAGE,
  MAX_GEOMETRY_PAGES_PER_DOCUMENT,
  MAX_GEOMETRY_PRIMITIVES_PER_PAGE,
  MAX_SYMBOL_CANDIDATES_PER_PAGE,
  associateDimensions,
  boxCenter,
  collectDimensionTexts,
  createGeometryPrimitive,
  createIdAllocator,
  dimensionLineCandidatesOf,
  distillGeometryContext,
  emptyPageDimensionResult,
  linkSymbols,
  normalizeGeometryBox,
  normalizePagePath,
  normalizePagePoint,
  pageCoordinateFrame,
  parseLegendLabel,
  reliabilityFromConfidence,
  shapeSignatureOf,
  shouldInspectDrawingPage,
  type ArtifactPage,
  type DimensionAssociation,
  type DimensionLineCandidate,
  type DimensionSource,
  type DrawingGateIntent,
  type EquipmentReferenceSource,
  type GeometryPrimitive,
  type GeometryPrimitiveType,
  type LegendSymbolDefinition,
  type NormalizedBox,
  type NormalizedPoint,
  type ObservedFact,
  type PageAttribution,
  type PageDimensionResult,
  type PageGeometry,
  type PageSymbolResult,
  type ShapeSignature,
  type SymbolInstanceCandidate,
  type SymbolMatchSource,
  type VisualObservationDraft,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-5: bounded drawing GEOMETRY / DIMENSION / SYMBOL analyzer.
 *
 * This is the single place where PDF vector geometry becomes reviewable
 * evidence. It sits strictly after the accepted pipeline: the pages it touches
 * are only the ones the 2A-4 drawing gate already qualified, and vector
 * content plays no part in that decision. A page packed with line work but
 * without drawing evidence is never inspected here, because vectors alone are
 * not evidence that a page is a drawing.
 *
 * Hard rules enforced by construction:
 * - geometry is PAGE SPACE ONLY, normalized to 0..1 against CropBox (preferred)
 *   or MediaBox, with the origin at the bottom-left of the page AS DISPLAYED
 *   after /Rotate. Nothing here is a real-world measurement: no primitive,
 *   distance, or area leaves this module wearing a unit;
 * - original PDF points are retained as provenance and never used to measure;
 * - a printed scale is captured as a calibration CANDIDATE and never applied:
 *   no page distance is ever multiplied by it;
 * - a printed dimension is a LITERAL. "3500" stays "3500" and acquires a unit
 *   only when the sheet printed one;
 * - OCR text carries no word positions, so OCR dimension readings can exist as
 *   page-level evidence but can never be spatially associated;
 * - symbol candidates stay individual: there is no count, total, or quantity
 *   anywhere in this module, and SYMBOL_REGION is excluded from every
 *   distilled summary so a count cannot be derived by accident;
 * - a standalone image never receives PDF vector geometry. It may only carry
 *   what the vision reading actually reported;
 * - every channel (native text, OCR, PDF vector, drawing vision) keeps its own
 *   provenance. They are never merged, and a disagreement keeps both readings;
 * - nothing here produces a Requirement, a BOM line, a quotation line, a
 *   product selection, a supplier, or an approved quantity.
 */

export type DrawingGeometryLimits = {
  /** Maximum qualified pages whose geometry is extracted per document. */
  maxPages: number;
};

/** Default bound: geometry work must not scale with the size of a drawing set. */
export const DRAWING_GEOMETRY_DEFAULT_MAX_PAGES = MAX_GEOMETRY_PAGES_PER_DOCUMENT;

export function resolveDrawingGeometryLimits(overrides: Partial<DrawingGeometryLimits> = {}): DrawingGeometryLimits {
  const parsed = overrides.maxPages;
  const maxPages = typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DRAWING_GEOMETRY_DEFAULT_MAX_PAGES;
  return { maxPages: Math.min(MAX_GEOMETRY_PAGES_PER_DOCUMENT, maxPages) };
}

/** One page's worth of 2A-5 evidence. */
export type DrawingGeometryPage = {
  pageNumber: number | null;
  attribution: PageAttribution;
  /** Null when the page had no usable page box: disclosed, never guessed. */
  geometry: PageGeometry | null;
  dimensions: PageDimensionResult;
  symbols: PageSymbolResult;
  /** Bounded distilled geometry summary for this page, safe to show a model. */
  distilled: string;
};

/**
 * Raw drawing-vision drafts for one page, supplied by the 2A-4 pass. The
 * geometry analyzer reuses the SAME provider reading so a page is never sent
 * to vision twice just to derive 2A-5 evidence.
 */
export type DrawingVisionDraftPage = {
  pageNumber: number | null;
  attribution: PageAttribution;
  providerId: string;
  drafts: VisualObservationDraft[];
};

export type DrawingGeometryContext = {
  artifactId: string;
  pdfBytes: Uint8Array;
  intent: DrawingGateIntent;
  limits?: Partial<DrawingGeometryLimits>;
  /** Raw bounded drafts from the drawing-vision pass, if it ran. */
  visionDrafts?: DrawingVisionDraftPage[] | null;
  /** Observed facts from the accepted text channels, used for tag corroboration. */
  observations?: ObservedFact[];
};

export type DrawingGeometryConflict = {
  pageNumber: number | null;
  kind: "SCALE" | "DIMENSION_TEXT" | "SYMBOL_MATCH";
  detail: string;
};

export type DrawingGeometryResult = {
  attempted: boolean;
  used: boolean;
  /** Proven page numbers the pass ran on; null entries are unattributed pages. */
  qualifiedPages: (number | null)[];
  pages: DrawingGeometryPage[];
  /** Bounded distilled geometry text for the whole document; never raw primitives. */
  distilled: { text: string; limitations: string[] };
  /** Plain-language, reviewable conflicts across every channel. */
  conflicts: DrawingGeometryConflict[];
  limitations: string[];
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// Bounds and small helpers
// ---------------------------------------------------------------------------

/** Longest single token accepted as a printed-dimension candidate from OCR text. */
const MAX_OCR_TOKEN_CHARACTERS = 24;
/** Upper bound of OCR tokens scanned per page for printed dimensions. */
const MAX_OCR_TOKENS_PER_PAGE = 80;
/** Upper bound of raw vision drafts inspected per page for 2A-5 evidence. */
const MAX_VISION_DRAFTS_PER_PAGE = 40;
/** Upper bound of limitations retained per page. */
const MAX_PAGE_LIMITATIONS = 8;

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "an unattributed page" : `page ${pageNumber}`;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A page number is only claimable when the page tree proved the attribution. */
function provenPageNumber(page: ArtifactPage): number | null {
  return page.attribution === "PAGE_TREE" ? (page.pageNumber ?? null) : null;
}

function clipLimitations(limitations: string[], max = MAX_PAGE_LIMITATIONS): string[] {
  return [...new Set(limitations.filter((item) => typeof item === "string" && item.trim().length > 0))].slice(0, max);
}

function emptyResult(limitations: string[], attempted: boolean): DrawingGeometryResult {
  return {
    attempted,
    used: false,
    qualifiedPages: [],
    pages: [],
    distilled: { text: "", limitations: [] },
    conflicts: [],
    limitations: [...new Set(limitations)],
    truncated: false,
  };
}

/**
 * Classifies a captured vector path onto the geometry vocabulary.
 *
 * Only shapes the capture can actually evidence are named: a rectangle comes
 * from the `re` operator, a two-point path is a line, a curve-built path is a
 * circle or arc, and everything else is a polyline or a closed region. Nothing
 * is promoted to a dimension line here — that happens later, and only through
 * the explicit candidate filter.
 */
function primitiveTypeFor(path: { points: readonly { x: number; y: number }[]; closed: boolean; curveSegments: number; fromRectangle: boolean }): GeometryPrimitiveType {
  if (path.fromRectangle) return "RECTANGLE";
  if (path.points.length <= 2) return "LINE_SEGMENT";
  if (path.curveSegments > 0) return "CIRCLE_OR_ARC";
  return path.closed ? "REGION" : "POLYLINE";
}

/**
 * Splits OCR page text into candidate tokens.
 *
 * OCR reports no word positions, so these tokens are page-level evidence only:
 * they become dimension readings that can be read and compared against another
 * channel, but they can never be placed on the sheet and therefore can never
 * be associated with a dimension line.
 */
function ocrTokens(text: string): string[] {
  const out: string[] = [];
  for (const token of text.split(/[\s|]+/u)) {
    const cleaned = token.trim();
    if (!cleaned || cleaned.length > MAX_OCR_TOKEN_CHARACTERS) continue;
    out.push(cleaned);
    if (out.length >= MAX_OCR_TOKENS_PER_PAGE) break;
  }
  return out;
}

function draftsFor(visionDrafts: DrawingVisionDraftPage[] | null | undefined, pageNumber: number | null): DrawingVisionDraftPage[] {
  if (!visionDrafts?.length) return [];
  return visionDrafts.filter((entry) => (entry.pageNumber ?? null) === pageNumber);
}

/** Four corners of a normalized box, in path order. */
function cornersOf(box: NormalizedBox): NormalizedPoint[] {
  return [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
}

function confidenceOf(draft: VisualObservationDraft): number | null {
  return typeof draft.confidence === "number" && Number.isFinite(draft.confidence) ? draft.confidence : null;
}

// ---------------------------------------------------------------------------
// Vision-derived evidence (shared by the PDF path and the standalone image path)
// ---------------------------------------------------------------------------

type VisionEvidence = {
  sources: DimensionSource[];
  legends: LegendSymbolDefinition[];
  legendShapes: Record<string, ShapeSignature | null>;
  symbols: SymbolInstanceCandidate[];
  symbolSources: SymbolMatchSource[];
  equipmentReferences: EquipmentReferenceSource[];
  /** Reported symbol regions, mirrored as primitives for rendering. */
  symbolRegions: GeometryPrimitive[];
  truncated: boolean;
};

/**
 * Derives dimension, legend, symbol, and equipment evidence from the raw
 * drawing-vision drafts of one surface.
 *
 * Everything produced here is DRAWING_VISION provenance. A candidate is
 * positioned only when the reading reported a real normalized box: a vague
 * region word such as "upper-left" is not a coordinate and is never turned
 * into one.
 */
function collectVisionEvidence(input: {
  drafts: DrawingVisionDraftPage[];
  pageNumber: number | null;
  attribution: PageAttribution;
  allocateId: (prefix: string) => string;
}): VisionEvidence {
  const sources: DimensionSource[] = [];
  const legends: LegendSymbolDefinition[] = [];
  const legendShapes: Record<string, ShapeSignature | null> = {};
  const symbols: SymbolInstanceCandidate[] = [];
  const symbolSources: SymbolMatchSource[] = [];
  const equipmentReferences: EquipmentReferenceSource[] = [];
  const symbolRegions: GeometryPrimitive[] = [];
  let truncated = false;
  const { pageNumber, attribution, allocateId } = input;

  for (const entry of input.drafts) {
    for (const draft of entry.drafts.slice(0, MAX_VISION_DRAFTS_PER_PAGE)) {
      const box = normalizeGeometryBox(draft.geometryBox);
      const position = box ? boxCenter(box) : null;
      const region = draft.region ?? null;
      const value = typeof draft.description === "string" ? draft.description.trim() : "";

      if (typeof draft.dimensionText === "string" && draft.dimensionText.trim()) {
        sources.push({
          text: draft.dimensionText,
          channel: "DRAWING_VISION",
          position,
          region,
          sourceId: entry.providerId,
          reliability: reliabilityFromConfidence(confidenceOf(draft)),
        });
      }
      if (draft.type === "PRINTED_SCALE" && value) {
        sources.push({
          text: value,
          channel: "DRAWING_VISION",
          position,
          region,
          sourceId: entry.providerId,
          reliability: reliabilityFromConfidence(confidenceOf(draft)),
        });
      }
      if (draft.type === "LEGEND_ENTRY" && value) {
        if (legends.length >= MAX_SYMBOL_CANDIDATES_PER_PAGE) {
          truncated = true;
          continue;
        }
        const parsed = parseLegendLabel(value);
        const id = allocateId("L");
        legends.push({
          id,
          pageNumber,
          attribution,
          label: parsed.code ? `${parsed.code} — ${parsed.description}` : value,
          code: parsed.code,
          channel: "DRAWING_VISION",
          region,
          reliability: reliabilityFromConfidence(confidenceOf(draft)),
          evidence: {
            locator: `${pageRef(pageNumber)}, drawing vision${region ? `, ${region}` : ""}`,
            reason: `the legend entry "${value}" was read from the drawing-vision reading of ${pageRef(pageNumber)}`,
            ...(entry.providerId ? { derivedFrom: [entry.providerId] } : {}),
          },
          limitations: ["legend entry is bounded visual text read from a rendered page; it is not an engineering approval and not a selected product"],
        });
        // A legend shape exists only when the reading reported a real region,
        // so vector-shape comparison never runs on a guess.
        legendShapes[id] = box ? shapeSignatureOf({ box, closed: true }) : null;
        continue;
      }
      if (draft.type === "SYMBOL_CANDIDATE" && value) {
        if (symbols.length >= MAX_SYMBOL_CANDIDATES_PER_PAGE) {
          truncated = true;
          continue;
        }
        const id = allocateId("S");
        const symbol: SymbolInstanceCandidate = {
          id,
          pageNumber,
          attribution,
          source: "DRAWING_VISION",
          description: value,
          region: box,
          shapeSignature: box ? shapeSignatureOf({ box }) : null,
          reliability: reliabilityFromConfidence(confidenceOf(draft)),
          evidence: {
            locator: `${pageRef(pageNumber)}, drawing vision${region ? `, ${region}` : ""}`,
            reason: `a symbol candidate described as "${value}" was read from the drawing-vision reading of ${pageRef(pageNumber)}`,
            ...(entry.providerId ? { derivedFrom: [entry.providerId] } : {}),
          },
          limitations: [
            "symbol candidate is an individual bounded observation; no symbol was counted, no quantity was derived, and no takeoff or BOM was produced",
            ...(box ? [] : ["the reading reported no normalized region, so this candidate carries no page-space position"]),
          ],
        };
        symbols.push(symbol);
        // The provider's own legend reference and similarity are passed through
        // under their own match method, so they can never overwrite a code
        // match or a shape comparison.
        symbolSources.push({ symbol, legendRef: draft.legendRef ?? null, similarity: draft.similarity ?? null });
        if (box) {
          symbolRegions.push(createGeometryPrimitive({
            id: allocateId("G"),
            type: "SYMBOL_REGION",
            source: "DRAWING_VISION",
            pageNumber,
            attribution,
            points: cornersOf(box),
            closed: true,
            reliability: reliabilityFromConfidence(confidenceOf(draft)),
            evidence: {
              locator: `${pageRef(pageNumber)}, drawing vision region for ${id}`,
              reason: `the drawing-vision reading reported a normalized region for symbol candidate ${id}`,
              derivedFrom: [id],
            },
            limitations: ["region is a reported normalized box from the drawing-vision reading; it is not a measured outline"],
          }));
        }
        continue;
      }
      if (draft.type === "EQUIPMENT_REFERENCE" && value) {
        equipmentReferences.push({ id: entry.providerId, text: value, position });
      }
      if (typeof draft.equipmentRef === "string" && draft.equipmentRef.trim()) {
        equipmentReferences.push({ id: entry.providerId, text: draft.equipmentRef.trim(), position });
      }
    }
  }

  return { sources, legends, legendShapes, symbols, symbolSources, equipmentReferences, symbolRegions, truncated };
}

// ---------------------------------------------------------------------------
// The PDF analyzer
// ---------------------------------------------------------------------------

/**
 * Runs the bounded geometry pass over an already-completed PDF analysis.
 *
 * It never throws for parser or content-stream reasons: every failure becomes
 * an isolated, truthfully reported limitation, because a failed geometry pass
 * must never masquerade as a page that simply has no geometry.
 */
export function analyzeDrawingGeometry(
  analyzed: AnalyzedPdfInspection,
  context: DrawingGeometryContext,
): DrawingGeometryResult {
  const { pages } = analyzed.inspection;
  const pageClassifications = analyzed.classification?.pages ?? [];
  const limitations: string[] = [];
  if (!pages.length) return emptyResult(limitations, false);

  // 1. Gate every page. Only the accepted 2A-4 gate decides; vector counts,
  //    image counts, and page size play no part anywhere in this module.
  const eligible: { index: number; page: ArtifactPage }[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const decision = shouldInspectDrawingPage({ intent: context.intent, classification: pageClassifications[index] ?? null });
    if (decision.requested) eligible.push({ index, page });
  }
  if (!eligible.length) {
    return emptyResult(["no page passed the drawing gate, so no drawing geometry was extracted"], false);
  }

  const limits = resolveDrawingGeometryLimits(context.limits);
  const capped = eligible.slice(0, limits.maxPages);
  const skipped = eligible.length - capped.length;
  if (skipped > 0) {
    limitations.push(`drawing geometry was limited to the first ${capped.length} qualified page(s); ${skipped} further qualified page(s) were not analyzed`);
  }

  // 2. Parse the document once. This pass is additive: the accepted text and
  //    classification result is read but never recomputed or altered.
  let parser: PdfDocumentParser;
  let model: ReturnType<PdfDocumentParser["parse"]>;
  try {
    parser = new PdfDocumentParser(Buffer.from(context.pdfBytes.buffer, context.pdfBytes.byteOffset, context.pdfBytes.byteLength));
    model = parser.parse();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return emptyResult([`the PDF could not be parsed for drawing geometry (${detail.slice(0, 200)}); no geometry was extracted`], true);
  }
  if (model.encrypted) return emptyResult(["the PDF is encrypted, so no drawing geometry could be extracted"], true);

  const interpreter = new PdfContentInterpreter(parser);
  const ids = createIdAllocator();
  const allocateId = (prefix: string): string => ids.next(prefix);
  const byPageNumber = new Map<number, PdfPageRecord>();
  for (const record of model.pages) if (!byPageNumber.has(record.pageNumber)) byPageNumber.set(record.pageNumber, record);

  const resultPages: DrawingGeometryPage[] = [];
  const conflicts: DrawingGeometryConflict[] = [];
  let truncated = false;
  let used = false;

  for (const item of capped) {
    const page = item.page;
    const pageNumber = provenPageNumber(page);
    const attribution: PageAttribution = page.attribution === "PAGE_TREE" ? "PAGE_TREE" : "UNATTRIBUTED";
    const pageLimitations: string[] = [];

    // 3. Locate the page record. Index alignment is the normal case; the
    //    page-number lookup covers documents whose page array was filtered.
    let record: PdfPageRecord | null = model.pages[item.index] ?? null;
    if (pageNumber !== null && (!record || record.pageNumber !== pageNumber)) record = byPageNumber.get(pageNumber) ?? null;

    const framed = record ? pageCoordinateFrame({ mediaBox: record.mediaBox, cropBox: record.cropBox, rotation: record.rotation }) : null;
    if (!record) {
      pageLimitations.push(`${pageRef(pageNumber)}: the page object could not be located, so no vector geometry was extracted`);
    } else if (!framed) {
      pageLimitations.push(`${pageRef(pageNumber)}: the page declares no usable crop box or media box, so page-space normalization was impossible and no geometry was extracted`);
    } else {
      pageLimitations.push(...framed.limitations);
    }

    const primitives: GeometryPrimitive[] = [];
    let stats: ReturnType<PdfContentInterpreter["interpretPageGeometry"]> | null = null;
    if (record && framed) {
      try {
        stats = interpreter.interpretPageGeometry(record);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown";
        pageLimitations.push(`${pageRef(pageNumber)}: the content stream could not be interpreted for geometry (${detail.slice(0, 200)})`);
      }
    }

    // ---- vector geometry --------------------------------------------------
    if (stats && framed) {
      if (stats.unsupportedFilters > 0) pageLimitations.push(`${stats.unsupportedFilters} content stream(s) on ${pageRef(pageNumber)} used an unsupported or corrupt filter; their geometry is missing`);
      if (stats.truncated) pageLimitations.push(`${pageRef(pageNumber)}: vector capture hit its safety bound, so the retained geometry is partial`);

      let outOfPage = 0;
      for (const path of stats.paths) {
        if (primitives.length >= MAX_GEOMETRY_PRIMITIVES_PER_PAGE) {
          truncated = true;
          break;
        }
        const normalized = normalizePagePath(path.points, framed.frame);
        if (!normalized) {
          outOfPage += 1;
          continue;
        }
        const pathLimitations: string[] = [];
        if (normalized.clamped) pathLimitations.push("one or more points sat marginally outside the page box and were clamped to its edge");
        if (path.curveSegments > 0) pathLimitations.push("curved segments were reduced to their endpoints; the curve interior was not reconstructed");
        if (path.formDepth > 0) pathLimitations.push(`the path was drawn inside a form XObject at depth ${path.formDepth}`);
        primitives.push(createGeometryPrimitive({
          id: allocateId("G"),
          type: primitiveTypeFor(path),
          source: "PDF_VECTOR",
          pageNumber,
          attribution,
          points: normalized.points,
          pdfPoints: path.points,
          closed: path.closed,
          stroked: path.stroked,
          filled: path.filled,
          reliability: "MEDIUM",
          evidence: {
            locator: `${pageRef(pageNumber)}, vector path ${primitives.length + 1}`,
            reason: `a painted vector path was found in the content stream of ${pageRef(pageNumber)}`,
          },
          limitations: pathLimitations,
        }));
      }
      if (outOfPage > 0) pageLimitations.push(`${outOfPage} vector path(s) on ${pageRef(pageNumber)} extended outside the page box and were not retained`);
      if (stats.paths.length > primitives.length) {
        pageLimitations.push(`only ${primitives.length} of ${stats.paths.length} captured vector path(s) on ${pageRef(pageNumber)} were retained`);
      }
    }

    // ---- native positioned text anchors -----------------------------------
    const anchors: Array<{ text: string; position: NormalizedPoint; sourceId: string }> = [];
    if (stats && framed) {
      for (const anchor of stats.anchors) {
        const normalized = normalizePagePoint({ x: anchor.x, y: anchor.y }, framed.frame);
        if (!normalized) continue;
        anchors.push({ text: anchor.text, position: normalized.point, sourceId: allocateId("A") });
      }
      if (stats.anchorsObserved > anchors.length) {
        pageLimitations.push(`${stats.anchorsObserved - anchors.length} text anchor(s) on ${pageRef(pageNumber)} could not be placed in page space and carry no position`);
      }
    }

    // ---- dimension evidence from every channel -----------------------------
    const sources: DimensionSource[] = [];
    for (const anchor of anchors) {
      sources.push({ text: anchor.text, channel: "NATIVE_TEXT", position: anchor.position, sourceId: anchor.sourceId });
    }
    const ocrText = typeof page.ocrText === "string" ? page.ocrText : "";
    if (ocrText.trim() && (page.textSource === "OCR" || page.textSource === "NATIVE_AND_OCR")) {
      for (const token of ocrTokens(ocrText)) sources.push({ text: token, channel: "OCR_TEXT" });
    }
    const pageDrafts = draftsFor(context.visionDrafts, pageNumber);
    const vision = collectVisionEvidence({ drafts: pageDrafts, pageNumber, attribution, allocateId });
    sources.push(...vision.sources);
    // Symbol regions mirror reported vision regions; they are never counted.
    primitives.push(...vision.symbolRegions);

    const collected = collectDimensionTexts({ pageNumber, attribution, sources, allocateId });

    // ---- dimension-line candidates and conservative association ------------
    const allCandidates: DimensionLineCandidate[] = primitives.length
      ? dimensionLineCandidatesOf(primitives.filter((primitive) => primitive.type === "LINE_SEGMENT"))
      : [];
    const candidates = allCandidates.slice(0, MAX_DIMENSION_LINE_CANDIDATES_PER_PAGE);
    if (allCandidates.length > candidates.length) {
      pageLimitations.push(`${allCandidates.length - candidates.length} further dimension-line candidate(s) on ${pageRef(pageNumber)} were not retained`);
    }
    const associated = associateDimensions({ pageNumber, texts: collected.texts, candidates, allocateId });
    let associations: DimensionAssociation[] = associated.associations;
    if (associations.length > MAX_DIMENSION_CANDIDATES_PER_PAGE) {
      pageLimitations.push(`${associations.length - MAX_DIMENSION_CANDIDATES_PER_PAGE} further dimension association(s) on ${pageRef(pageNumber)} were not retained`);
      associations = associations.slice(0, MAX_DIMENSION_CANDIDATES_PER_PAGE);
    }

    // ---- native tag corroboration ------------------------------------------
    // A positioned anchor counts as equipment evidence only when the accepted
    // text reading already observed the same tag on the same page.
    const observations = context.observations ?? analyzed.observations;
    const observedTags = new Set<string>();
    for (const observation of observations) {
      if (observation.type === "EQUIPMENT_TAG" && (observation.pageNumber ?? null) === pageNumber) observedTags.add(observation.value.trim().toUpperCase());
    }
    if (observedTags.size) {
      for (const anchor of anchors) {
        for (const match of anchor.text.matchAll(/\b([A-Za-z]{2,6}-?\d{1,5}[A-Za-z]?)\b/gu)) {
          const token = (match[1] ?? "").trim();
          if (!token || !observedTags.has(token.toUpperCase())) continue;
          vision.equipmentReferences.push({ id: anchor.sourceId, text: token, position: anchor.position });
        }
      }
    }

    const linked = linkSymbols({
      pageNumber,
      symbols: vision.symbolSources,
      legends: vision.legends,
      equipmentReferences: vision.equipmentReferences,
      legendShapes: vision.legendShapes,
      allocateId,
    });

    // ---- assemble the page ------------------------------------------------
    const geometry: PageGeometry | null = framed
      ? {
        pageNumber,
        attribution,
        source: "PDF_VECTOR",
        frame: {
          boxSource: framed.frame.boxSource,
          rotation: framed.frame.rotation,
          widthPt: round(framed.frame.displayedWidth),
          heightPt: round(framed.frame.displayedHeight),
        },
        primitives,
        observed: { paths: stats?.pathsObserved ?? 0, textAnchors: stats?.anchorsObserved ?? 0 },
        truncated: (stats?.truncated ?? false) || primitives.length >= MAX_GEOMETRY_PRIMITIVES_PER_PAGE,
        limitations: clipLimitations(pageLimitations),
      }
      : null;

    const dimensions: PageDimensionResult = {
      pageNumber,
      texts: collected.texts,
      lines: candidates,
      associations,
      scales: collected.scales,
      conflicts: collected.conflicts,
      truncated: collected.truncated,
      limitations: clipLimitations([...collected.limitations, ...associated.limitations]),
    };
    const symbolsResult: PageSymbolResult = {
      pageNumber,
      legends: vision.legends,
      symbols: vision.symbols,
      legendMatches: linked.legendMatches,
      equipmentMatches: linked.equipmentMatches,
      conflicts: linked.conflicts,
      truncated: linked.truncated || vision.truncated,
      limitations: clipLimitations(linked.limitations),
    };

    if (primitives.length || collected.texts.length || collected.scales.length || vision.symbols.length) used = true;
    if (geometry?.truncated || dimensions.truncated || symbolsResult.truncated) truncated = true;
    for (const conflict of [...collected.conflicts, ...linked.conflicts]) conflicts.push(conflict);

    resultPages.push({
      pageNumber,
      attribution,
      geometry,
      dimensions,
      symbols: symbolsResult,
      distilled: geometry ? distillGeometryContext([geometry]).text : "",
    });
  }

  const distilled = distillGeometryContext(resultPages.map((entry) => entry.geometry).filter((entry): entry is PageGeometry => Boolean(entry)));
  return {
    attempted: true,
    used,
    qualifiedPages: capped.map((item) => provenPageNumber(item.page)),
    pages: resultPages,
    distilled: { text: distilled.text, limitations: distilled.limitations },
    conflicts,
    limitations: [...new Set([...limitations, ...distilled.limitations])].slice(0, MAX_PAGE_LIMITATIONS),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Standalone drawing image
// ---------------------------------------------------------------------------

/**
 * Derives 2A-5 evidence for a standalone drawing image from the drawing-vision
 * reading only.
 *
 * An image has no PDF page tree, no content stream, and no page box, so it can
 * never produce PDF vector geometry: `geometry` stays null and the primitive
 * list stays empty. What it may carry is what the vision reading actually
 * reported — printed dimension text, scale text, legend entries, and individual
 * symbol candidates — all under drawing-vision provenance.
 */
export function analyzeDrawingImageGeometry(context: {
  visionDrafts?: DrawingVisionDraftPage[] | null;
}): DrawingGeometryResult {
  const ids = createIdAllocator();
  const allocateId = (prefix: string): string => ids.next(prefix);
  const pageDrafts = draftsFor(context.visionDrafts, null);
  const vision = collectVisionEvidence({ drafts: pageDrafts, pageNumber: null, attribution: "UNATTRIBUTED", allocateId });
  if (!vision.sources.length && !vision.symbols.length && !vision.legends.length) {
    return emptyResult([], Boolean(pageDrafts.length));
  }

  const collected = collectDimensionTexts({ pageNumber: null, attribution: "UNATTRIBUTED", sources: vision.sources, allocateId });
  const linked = linkSymbols({
    pageNumber: null,
    symbols: vision.symbolSources,
    legends: vision.legends,
    equipmentReferences: vision.equipmentReferences,
    legendShapes: vision.legendShapes,
    allocateId,
  });

  const dimensions: PageDimensionResult = {
    ...emptyPageDimensionResult(null),
    texts: collected.texts,
    associations: [],
    scales: collected.scales,
    conflicts: collected.conflicts,
    truncated: collected.truncated,
    limitations: clipLimitations(collected.limitations),
  };
  const symbolsResult: PageSymbolResult = {
    pageNumber: null,
    legends: vision.legends,
    symbols: vision.symbols,
    legendMatches: linked.legendMatches,
    equipmentMatches: linked.equipmentMatches,
    conflicts: linked.conflicts,
    truncated: linked.truncated || vision.truncated,
    limitations: clipLimitations(linked.limitations),
  };

  const used = Boolean(collected.texts.length || collected.scales.length || vision.symbols.length);
  return {
    attempted: true,
    used,
    qualifiedPages: [null],
    pages: [{ pageNumber: null, attribution: "UNATTRIBUTED", geometry: null, dimensions, symbols: symbolsResult, distilled: "" }],
    distilled: { text: "", limitations: ["an image has no PDF page box, so no vector geometry and no page-space normalization applies to it"] },
    conflicts: [...collected.conflicts, ...linked.conflicts],
    limitations: ["an image produces no PDF vector geometry; every record here comes from the drawing-vision reading"],
    truncated: collected.truncated || linked.truncated,
  };
}

// ---------------------------------------------------------------------------
// Projection into the governed application view
// ---------------------------------------------------------------------------

/**
 * Maps the analyzer result onto the bounded application projection.
 *
 * This is the only place the infrastructure result crosses into the governed
 * view, and it carries no count, total, or aggregate of any kind.
 */
export function toDrawingGeometryProjection(result: DrawingGeometryResult | null): DrawingGeometryProjectionInput {
  if (!result) return emptyProjection();
  return {
    attempted: result.attempted,
    pages: result.qualifiedPages,
    primitives: result.pages.flatMap((page) => (page.geometry?.primitives ?? []).map((primitive) => ({
      id: primitive.id,
      type: primitive.type,
      source: primitive.source,
      pageNumber: primitive.pageNumber,
      reliability: primitive.reliability,
      boundingBox: primitive.boundingBox,
      evidence: primitive.evidence,
    }))),
    dimensionTexts: result.pages.flatMap((page) => page.dimensions.texts.map((text) => ({
      id: text.id,
      pageNumber: text.pageNumber,
      channel: text.channel,
      raw: text.raw,
      numericText: text.numericText,
      unit: text.unit,
      kind: text.kind,
      positioned: Boolean(text.position),
      region: text.region,
      reliability: text.reliability,
      evidence: text.evidence,
      limitations: text.limitations,
    }))),
    dimensionLines: result.pages.flatMap((page) => page.dimensions.lines.map((line) => ({
      id: line.id,
      pageNumber: page.pageNumber,
      length: line.length,
      horizontal: line.horizontal,
      vertical: line.vertical,
    }))),
    dimensionAssociations: result.pages.flatMap((page) => page.dimensions.associations.map((association) => ({
      id: association.id,
      pageNumber: association.pageNumber,
      dimensionTextId: association.dimensionTextId,
      dimensionLineCandidateId: association.dimensionLineCandidateId,
      distance: association.distance,
      confidence: association.confidence,
      reliability: association.reliability,
      ambiguous: association.limitations.some((item) => item.includes("comparable distance")),
      evidence: association.evidence,
      limitations: association.limitations,
    }))),
    scaleCandidates: result.pages.flatMap((page) => page.dimensions.scales.map((scale) => ({
      id: scale.id,
      pageNumber: scale.pageNumber,
      printed: scale.printed,
      ratio: scale.ratio,
      channel: scale.channel,
      reliability: scale.reliability,
      evidence: scale.evidence,
      limitations: scale.limitations,
    }))),
    legends: result.pages.flatMap((page) => page.symbols.legends.map((legend) => ({
      id: legend.id,
      pageNumber: legend.pageNumber,
      label: legend.label,
      code: legend.code,
      reliability: legend.reliability,
      evidence: legend.evidence,
      limitations: legend.limitations,
    }))),
    symbolCandidates: result.pages.flatMap((page) => page.symbols.symbols.map((symbol) => ({
      id: symbol.id,
      pageNumber: symbol.pageNumber,
      description: symbol.description,
      region: symbol.region,
      reliability: symbol.reliability,
      evidence: symbol.evidence,
      limitations: symbol.limitations,
    }))),
    symbolToLegend: result.pages.flatMap((page) => page.symbols.legendMatches.map((match) => ({
      id: match.id,
      pageNumber: match.pageNumber,
      symbolId: match.symbolId,
      legendId: match.legendId,
      method: match.method,
      confidence: match.confidence,
      reliability: match.reliability,
      ambiguous: match.ambiguous,
      evidence: match.evidence,
      limitations: match.limitations,
    }))),
    symbolToEquipment: result.pages.flatMap((page) => page.symbols.equipmentMatches.map((match) => ({
      id: match.id,
      pageNumber: match.pageNumber,
      symbolId: match.symbolId,
      equipmentReference: match.equipmentReference,
      method: match.method,
      confidence: match.confidence,
      reliability: match.reliability,
      evidence: match.evidence,
      limitations: match.limitations,
    }))),
    conflicts: result.conflicts.map((conflict) => conflict.detail),
    limitations: result.limitations,
    truncated: result.truncated,
  };
}

function emptyProjection(): DrawingGeometryProjectionInput {
  return {
    attempted: false,
    pages: [],
    primitives: [],
    dimensionTexts: [],
    dimensionLines: [],
    dimensionAssociations: [],
    scaleCandidates: [],
    legends: [],
    symbolCandidates: [],
    symbolToLegend: [],
    symbolToEquipment: [],
    conflicts: [],
    limitations: [],
    truncated: false,
  };
}
