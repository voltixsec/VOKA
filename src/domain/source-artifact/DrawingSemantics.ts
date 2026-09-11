import type { ObservedFact, ObservationType, PageAttribution } from "./index";
import type { PageClassification } from "./PdfClassification";
import { OBSERVATION_STATUS } from "./PdfObservations";
import { normalizeVisualRegion, visualReliabilityFor, type VisualObservationDraft } from "./ImageVisual";

/**
 * Phase 2A-4: governed DRAWING semantic intelligence.
 *
 * This module owns the drawing-specific *observation vocabulary*, the
 * conservative *drawing inspection gate*, and the *normalization* of drawing
 * vision provider output into bounded observations. It holds no provider
 * implementation, no rasterization, and no business rules about what a
 * drawing means commercially: drawing vision turns a rendered page into
 * bounded literal observations, and the accepted governed pipeline
 * (candidates, projection, brief) treats them as non-approved readings.
 *
 * Hard rules:
 * - a page becomes a drawing candidate only through explicit, reviewable
 *   evidence (the accepted 2A-1B classification, or an explicit drawing
 *   inspection intent corroborated by at least one explicit marker);
 *   vector counts, image counts, page size, and vague visual resemblance
 *   can never qualify a page;
 * - providers may emit only `DRAWING_OBSERVATION_TYPES`; anything else is
 *   dropped, never coerced;
 * - every value is a bounded literal: a printed scale is text, never
 *   permission to measure; a revision is text, never an approved revision;
 *   a symbol candidate is a candidate, never a count; a legend label is a
 *   label, never an approval or a selected product; a title-block party is
 *   text, never a supplier or company;
 * - no drawing observation maps to a governed fact key, so none has a
 *   promotion path: they stay OBSERVED_NOT_APPROVED with no exceptions;
 * - the drawing reading is a separate evidence channel: it never overwrites
 *   native or OCR text, and disagreements between channels keep all values
 *   with their own provenance for review.
 */

/** Identity of the deterministic fixture provider path used in tests. */
export const DRAWING_VISION_PROFILE = "DRAWING_SEMANTICS" as const;

/**
 * Bounded drawing-specific observation vocabulary. Providers may emit only
 * these types; the normalizer drops anything else, including the 2A-3 general
 * visual types, so the two vision readings never blend.
 */
export const DRAWING_OBSERVATION_TYPES = [
  "DRAWING_TITLE",
  "DRAWING_NUMBER",
  "SHEET_NUMBER",
  "REVISION",
  "DISCIPLINE",
  "PRINTED_SCALE",
  "DRAWING_TYPE",
  "PROJECT_NAME",
  "TITLE_BLOCK_PARTY",
  "LEGEND_ENTRY",
  "NOTE",
  "EQUIPMENT_REFERENCE",
  "ROOM_OR_ZONE",
  "DETAIL_REFERENCE",
  "SECTION_REFERENCE",
  "ELEVATION_REFERENCE",
  "SYMBOL_CANDIDATE",
] as const;

export type DrawingObservationType = (typeof DRAWING_OBSERVATION_TYPES)[number];

const DRAWING_TYPE_SET = new Set<string>(DRAWING_OBSERVATION_TYPES);

export function isDrawingObservationType(value: string): value is DrawingObservationType {
  return DRAWING_TYPE_SET.has(value);
}

/** Bounded hint vocabulary for DRAWING_TYPE (section D): a semantic hint only. */
export const DRAWING_TYPE_HINTS = ["plan", "elevation", "section", "detail", "schematic", "schedule", "unknown"] as const;
export type DrawingTypeHint = (typeof DRAWING_TYPE_HINTS)[number];

const DRAWING_TYPE_HINT_ALIASES: Record<string, DrawingTypeHint> = {
  plan: "plan",
  floor: "plan",
  "floor plan": "plan",
  "site plan": "plan",
  layout: "plan",
  "reflected ceiling plan": "plan",
  rcp: "plan",
  elevation: "elevation",
  "elevation view": "elevation",
  section: "section",
  "section view": "section",
  detail: "detail",
  "detail view": "detail",
  schematic: "schematic",
  "schematic diagram": "schematic",
  diagram: "schematic",
  schedule: "schedule",
  "schedule sheet": "schedule",
  unknown: "unknown",
};

/**
 * Maps a free-form provider hint onto the bounded vocabulary. Anything
 * unrecognized becomes `unknown` — the safer direction, never a guess.
 */
export function normalizeDrawingTypeHint(raw: string): { hint: DrawingTypeHint; coerced: boolean } {
  const cleaned = raw.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
  const direct = DRAWING_TYPE_HINT_ALIASES[cleaned];
  if (direct) return { hint: direct, coerced: cleaned !== direct };
  for (const hint of DRAWING_TYPE_HINTS) {
    if (hint !== "unknown" && cleaned.includes(hint)) return { hint, coerced: true };
  }
  return { hint: "unknown", coerced: true };
}

// ---------------------------------------------------------------------------
// Bounds. Provider output is untrusted until bounded here.
// ---------------------------------------------------------------------------

/** Upper bound of drawing observations kept per page. */
export const MAX_DRAWING_OBSERVATIONS_PER_PAGE = 10;
/** Upper bound of drawing observations kept per document (all qualified pages). */
export const MAX_DRAWING_OBSERVATIONS = 40;
/** Upper bound of a bounded literal value taken from the drawing. */
export const MAX_DRAWING_VALUE = 200;
const MAX_DRAWING_DRAFT_LIMITATIONS = 4;
const MAX_DRAWING_DRAFT_LIMITATION = 200;

function clip(value: string, max: number): { text: string; clipped: boolean } {
  const trimmed = value.trim();
  return trimmed.length > max ? { text: `${trimmed.slice(0, max)}…`, clipped: true } : { text: trimmed, clipped: false };
}

/**
 * Limitations stamped per observation type. They are structural: the consumer
 * can never read a drawing observation as anything beyond a literal,
 * non-approved visual reading.
 */
const DRAWING_TYPE_LIMITATIONS: Record<DrawingObservationType, string> = {
  DRAWING_TITLE: "drawing title observed from the title block as printed; it was not verified against any register",
  DRAWING_NUMBER: "drawing number observed as printed; it was not linked to a drawing register or revision state",
  SHEET_NUMBER: "sheet number observed as printed; the physical sheet order was not verified",
  REVISION: "revision text observed as printed; it is not an approved revision state",
  DISCIPLINE: "discipline observed as printed; no engineering scope was inferred from it",
  PRINTED_SCALE: "printed scale is literal text only; no geometric measurement or scale conversion was performed",
  DRAWING_TYPE: "drawing type is a bounded semantic hint only; no geometry, topology, or completeness was inferred",
  PROJECT_NAME: "project name observed from the title block as printed; no project commercial fact was created from it",
  TITLE_BLOCK_PARTY: "title-block party text is observed text only; it is not a supplier, not a company relationship, and not a selected manufacturer",
  LEGEND_ENTRY: "legend entry observed as printed; it is not an engineering approval and not a selected product",
  NOTE: "note text copied as printed; it is not a verified specification",
  EQUIPMENT_REFERENCE: "equipment reference observed as printed; it is not a BOM line and no quantity was counted",
  ROOM_OR_ZONE: "room or zone label observed as printed; it is an observation only",
  DETAIL_REFERENCE: "detail callout observed as printed; the referenced detail was not located or verified",
  SECTION_REFERENCE: "section callout observed as printed; the referenced section was not located or verified",
  ELEVATION_REFERENCE: "elevation callout observed as printed; the referenced elevation was not located or verified",
  SYMBOL_CANDIDATE: "candidate symbol description; symbols were not counted and no quantity was derived",
};

/** Baseline limitation every drawing observation carries. */
export const DRAWING_OBSERVATION_BASELINE_LIMITATION =
  "observed by drawing vision from a rendered page image; it is a bounded visual reading, not verified fact, not a measurement, not a count, and not an approval";

// ---------------------------------------------------------------------------
// The conservative drawing inspection gate
// ---------------------------------------------------------------------------

/** Which inspection the gate serves: an explicit drawing request or a general one. */
export type DrawingGateIntent = "DRAWING_INSPECTION" | "ATTACHMENT";

export type DrawingGateDecision = {
  requested: boolean;
  /** Strength of the qualifying evidence; null whenever the gate did not open. */
  reliability: "HIGH" | "MEDIUM" | "LOW" | null;
  reason: string;
  /** Verbatim classification evidence details backing the decision (reviewability). */
  evidence: string[];
};

function gateEvidence(classification: PageClassification | null): string[] {
  if (!classification) return [];
  return classification.evidence
    .filter((item) => item.kind === "TEXT_MARKER" && /drawing identifier|title-block/iu.test(item.detail))
    .map((item) => item.detail);
}

/**
 * Decide whether one page may be sent to drawing semantic vision.
 *
 * Qualified evidence (section A of the slice):
 * - page classified DRAWING by the accepted 2A-1B classifier with MEDIUM or
 *   HIGH reliability — the classification itself only ever comes from
 *   explicit drawing/sheet/scale/revision markers in native or OCR text;
 * - page classified DRAWING with LOW reliability (a single explicit marker)
 *   only when the caller has an explicit DRAWING_INSPECTION intent;
 * - a standalone input without page classification (an image) only when the
 *   caller has an explicit DRAWING_INSPECTION intent.
 *
 * Never qualified:
 * - UNKNOWN pages, including pages whose drawing and schedule evidence
 *   conflict (weak/conflicting evidence means review, not vision);
 * - TEXT_DOCUMENT, BOQ_OR_SCHEDULE, SCANNED_OR_IMAGE_ONLY pages — image or
 *   vector density alone is never drawing evidence;
 * - any page for a reason the classifier did not prove.
 */
export function shouldInspectDrawingPage(input: { intent: DrawingGateIntent; classification: PageClassification | null }): DrawingGateDecision {
  const { classification, intent } = input;
  const evidence = gateEvidence(classification);
  if (!classification) {
    if (intent === "DRAWING_INSPECTION") {
      return {
        requested: true,
        reliability: "MEDIUM",
        reason: "a standalone image was explicitly requested as a drawing inspection",
        evidence: ["explicit DRAWING_INSPECTION intent"],
      };
    }
    return { requested: false, reliability: null, reason: "no drawing evidence exists for this input", evidence: [] };
  }
  if (classification.value === "DRAWING") {
    if (classification.reliability === "LOW" && intent !== "DRAWING_INSPECTION") {
      return {
        requested: false,
        reliability: null,
        reason: "a single drawing marker is weak evidence on its own and no drawing inspection was explicitly requested",
        evidence,
      };
    }
    const intentNote = intent === "DRAWING_INSPECTION" ? ", corroborated by the explicit drawing inspection request" : "";
    return {
      requested: true,
      reliability: classification.reliability,
      reason: `the page carries explicit drawing markers (${classification.reliability.toLowerCase()} reliability from the accepted classifier)${intentNote}`,
      evidence,
    };
  }
  if (classification.value === "UNKNOWN") {
    const conflicting = classification.limitations.some((item) => /conflicting evidence/iu.test(item));
    return {
      requested: false,
      reliability: null,
      reason: conflicting
        ? "the page carries conflicting drawing and schedule evidence, so it needs review instead of drawing vision"
        : "the page could not be classified with credible drawing evidence, so it stays UNKNOWN and needs review",
      evidence,
    };
  }
  return {
    requested: false,
    reliability: null,
    reason: `the page was classified ${classification.value}, which is not drawing evidence; drawing vision not requested`,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Provider-output normalization: bounded, governed drawing observations
// ---------------------------------------------------------------------------

/**
 * Turn provider drafts into bounded drawing observations.
 *
 * Enforcement is structural, not advisory:
 * - unknown observation types (including the general 2A-3 visual types) are
 *   dropped, never coerced into a drawing type or vice versa;
 * - DRAWING_TYPE values are mapped onto the bounded hint vocabulary;
 *   anything unrecognized becomes `unknown`;
 * - empty descriptions are dropped; over-long ones are clipped with a note;
 * - at most MAX_DRAWING_OBSERVATIONS_PER_PAGE survive per page;
 * - the page number and attribution are taken from the caller's proven
 *   values, never from the provider echo: an unproven page keeps null.
 */
export function normalizeDrawingDrafts(
  drafts: VisualObservationDraft[],
  input: {
    providerId: string;
    artifactId: string;
    pageNumber: number | null;
    attribution: PageAttribution;
    /** "IMAGE" for a standalone drawing image; "PAGE" for a rasterized PDF page. */
    surface: "PAGE" | "IMAGE";
  },
): { observations: ObservedFact[]; dropped: number; limitations: string[] } {
  const observations: ObservedFact[] = [];
  const limitations: string[] = [];
  let dropped = 0;
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]!;
    if (!draft || !isDrawingObservationType(draft.type)) {
      dropped += 1;
      continue;
    }
    let clippedValue = clip(draft.description ?? "", MAX_DRAWING_VALUE);
    if (!clippedValue.text) {
      dropped += 1;
      continue;
    }
    const extra: string[] = [];
    if (draft.type === "DRAWING_TYPE") {
      const hint = normalizeDrawingTypeHint(clippedValue.text);
      clippedValue = { text: hint.hint, clipped: false };
      if (hint.coerced) extra.push("the reported drawing type was mapped onto the bounded hint vocabulary; unrecognized wording became 'unknown'");
    }
    const region = normalizeVisualRegion(draft.region);
    const locatorBase = input.surface === "IMAGE"
      ? "drawing image"
      : input.pageNumber === null
        ? "unattributed drawing page"
        : `drawing page ${input.pageNumber}`;
    const locator = region ? `${locatorBase}, ${region}` : locatorBase;
    const draftLimitations = (Array.isArray(draft.limitations) ? draft.limitations : [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_DRAWING_DRAFT_LIMITATIONS)
      .map((item) => clip(item, MAX_DRAWING_DRAFT_LIMITATION).text);
    observations.push({
      type: draft.type,
      value: clippedValue.text,
      status: OBSERVATION_STATUS,
      pageNumber: input.pageNumber,
      attribution: input.attribution,
      reliability: visualReliabilityFor(draft.confidence),
      evidence: { snippet: clippedValue.text, locator, lineNumber: null },
      visualOrigin: { source: "VISION", providerId: input.providerId },
      artifactId: input.artifactId,
      limitations: [
        DRAWING_OBSERVATION_BASELINE_LIMITATION,
        DRAWING_TYPE_LIMITATIONS[draft.type as DrawingObservationType],
        ...extra,
        ...draftLimitations,
        ...(clippedValue.clipped ? [`value was truncated to ${MAX_DRAWING_VALUE} characters`] : []),
      ],
    });
    if (observations.length >= MAX_DRAWING_OBSERVATIONS_PER_PAGE) {
      dropped += drafts.length - (index + 1);
      break;
    }
  }
  if (dropped > 0) {
    limitations.push(`${dropped} drawing observation(s) were dropped because they fell outside the bounded drawing vocabulary or the ${MAX_DRAWING_OBSERVATIONS_PER_PAGE}-per-page limit`);
  }
  return { observations, dropped, limitations };
}

// ---------------------------------------------------------------------------
// Native / OCR / drawing-vision separation (conflict surfacing, never resolution)
// ---------------------------------------------------------------------------

/** Comparable text-channel observation types for each drawing observation type. */
export const DRAWING_CHANNEL_CONFLICT_PAIRS: Partial<Record<DrawingObservationType, readonly ObservationType[]>> = {
  DRAWING_NUMBER: ["DRAWING_OR_SHEET_NUMBER"],
  SHEET_NUMBER: ["DRAWING_OR_SHEET_NUMBER"],
  REVISION: ["REVISION"],
  DISCIPLINE: ["DISCIPLINE"],
  DRAWING_TITLE: ["DOCUMENT_TITLE"],
  PROJECT_NAME: ["PROJECT_TITLE"],
};

const MAX_CHANNEL_CONFLICT_NOTES = 10;
const MAX_VALUE_IN_NOTE = 80;

function normalizeKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "unattributed drawing page" : `page ${pageNumber}`;
}

function clipNote(value: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  return trimmed.length > MAX_VALUE_IN_NOTE ? `${trimmed.slice(0, MAX_VALUE_IN_NOTE)}…` : trimmed;
}

function textChannelRef(observation: ObservedFact): string {
  return observation.origin?.textSource === "OCR" ? "OCR text" : "native text";
}

/**
 * Merge drawing-vision observations under the text readings without choosing
 * a winner:
 * - a drawing observation that agrees exactly with a comparable text
 *   observation on the same page is kept once (as the text observation) and
 *   counted in a limitation, never merged or overwritten;
 * - a drawing observation that disagrees keeps BOTH values, and a reviewable
 *   conflict note names both readings with their channels;
 * - everything without a comparable text observation is kept as is.
 */
export function mergeDrawingObservations(
  textObservations: ObservedFact[],
  drawingObservations: ObservedFact[],
): { observations: ObservedFact[]; conflictNotes: string[]; agreements: number } {
  if (!drawingObservations.length) return { observations: textObservations, conflictNotes: [], agreements: 0 };
  const observations = [...textObservations];
  const conflictNotes: string[] = [];
  let agreements = 0;
  for (const drawing of drawingObservations) {
    const comparableTypes = DRAWING_CHANNEL_CONFLICT_PAIRS[drawing.type as DrawingObservationType];
    const comparable = comparableTypes
      ? textObservations.filter((candidate) => comparableTypes.includes(candidate.type) && (candidate.pageNumber ?? null) === (drawing.pageNumber ?? null))
      : [];
    const agreeing = comparable.find((candidate) => normalizeKey(candidate.value) === normalizeKey(drawing.value));
    if (agreeing) {
      agreements += 1;
      continue;
    }
    observations.push(drawing);
    const disagreeing = comparable[0];
    if (disagreeing && conflictNotes.length < MAX_CHANNEL_CONFLICT_NOTES) {
      conflictNotes.push(
        `${pageRef(drawing.pageNumber)}: the ${textChannelRef(disagreeing)} reading and the drawing-vision reading disagree and both values were kept for review (${textChannelRef(disagreeing)} "${clipNote(disagreeing.value)}" vs drawing vision "${clipNote(drawing.value)}")`,
      );
    }
  }
  return { observations, conflictNotes, agreements };
}
