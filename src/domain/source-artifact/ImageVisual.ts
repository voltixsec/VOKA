import { OBSERVATION_STATUS, type ObservedFact, type ObservationReliability } from "./PdfObservations";
import type { NormalizedBox } from "./DrawingGeometry";

/**
 * Phase 2A-3: visual (image/screenshot) semantic inspection boundary.
 *
 * This module owns the visual-inspection *data model*, the *request gate*,
 * and the *normalization* of provider output into bounded observations. It
 * holds no provider implementation, no network calls, and no business rules
 * about what an observation means commercially: a vision provider turns image
 * bytes into candidate descriptions, and the accepted governed pipeline
 * (candidates, projection, brief) treats them as non-approved observations.
 *
 * This is NOT OCR. OCR owns readable text; vision owns semantic visual
 * content. The two readings are never merged and stay separately attributed.
 *
 * Hard rules:
 * - a provider can only emit the bounded `VISUAL_OBSERVATION_TYPES`
 *   vocabulary; anything else is dropped, never coerced;
 * - descriptions are literal and bounded; they are never completed into a
 *   product, a quantity, a supplier, or engineering truth;
 * - exact model/brand identity is observed only when the marking is actually
 *   legible; resemblance is described generically, never as an identity;
 * - visual observations stay OBSERVED_NOT_APPROVED with no promotion path;
 * - `pageNumber` stays null for standalone images; providers echo it, never
 *   invent one.
 */

/** Identity of the deterministic fixture provider used in tests. It never claims real inspection. */
export const DETERMINISTIC_VISION_PROVIDER_ID = "deterministic-vision-test-double";

/** Identity reported when no vision provider exists in the runtime. */
export const UNAVAILABLE_VISION_PROVIDER_ID = "vision-unavailable";

/**
 * Conservative visual observation vocabulary. Providers may emit only these
 * types; the normalizer drops anything else.
 */
export const VISUAL_OBSERVATION_TYPES = [
  "VISIBLE_OBJECT",
  "VISIBLE_PRODUCT",
  "VISIBLE_BRAND",
  "VISIBLE_MODEL_REFERENCE",
  "IMAGE_TYPE_HINT",
  "VISIBLE_CONDITION",
  "VISUAL_CONTEXT",
] as const;

export type VisualObservationType = (typeof VISUAL_OBSERVATION_TYPES)[number];

const VISUAL_TYPE_SET = new Set<string>(VISUAL_OBSERVATION_TYPES);

export function isVisualObservationType(value: string): value is VisualObservationType {
  return VISUAL_TYPE_SET.has(value);
}

/**
 * Outcome of a visual inspection, as reported by the provider.
 * These tokens are provenance metadata; they are never printed verbatim in
 * assistant-facing briefs.
 */
export type VisualInspectionStatus =
  | "COMPLETED"
  | "NO_USABLE_OBSERVATIONS"
  | "FAILED"
  | "UNAVAILABLE";

/**
 * Which reading a visual observation was taken from. Visual observations
 * always carry this and never carry a text `origin`, so OCR/native text and
 * visual content stay separately attributed.
 */
export type VisualOrigin = {
  source: "VISION";
  /** Provider identity; null when unknown. */
  providerId: string | null;
};

/**
 * Which bounded task a vision request asks for. `GENERAL_IMAGE` is the 2A-3
 * image-description reading (the default when absent); `DRAWING_SEMANTICS`
 * (2A-4) asks for the drawing observation vocabulary instead. Providers treat
 * a missing profile as `GENERAL_IMAGE` so the accepted behavior is unchanged.
 */
export type VisualAnalysisProfile = "GENERAL_IMAGE" | "DRAWING_SEMANTICS";

/**
 * What a vision provider receives for one image. `pageNumber` is always null
 * for standalone images in 2A-3 (it exists so PDF raster pages can reuse this
 * boundary later); providers must echo it.
 */
export type VisualInspectionRequest = {
  artifactId: string;
  imageBytes: Uint8Array;
  mimeType: string;
  pageNumber: number | null;
  /** Gate explanation: why visual inspection was requested for this image. */
  reason: string;
  /** 2A-4: bounded drawing-semantics reading instead of the general image reading. */
  analysisProfile?: VisualAnalysisProfile;
};

/**
 * Raw provider output for one observation, before vocabulary/bound validation.
 *
 * The 2A-5 fields at the bottom were added without touching any earlier one,
 * so the accepted 2A-3 image reading and the 2A-4 drawing reading behave
 * exactly as before when a provider does not supply them. They are hints from
 * the vision channel only: a box is a reported region, never a measured
 * coordinate, and a similarity is the provider's own number.
 */
export type VisualObservationDraft = {
  type: string;
  description: string;
  confidence?: number | null;
  /** Image region hint such as "upper-left"; null/unknown means the whole image. */
  region?: string | null;
  limitations?: string[];
  /** 2A-5: normalized 0..1 page-space box (origin bottom-left) reported for this reading. */
  geometryBox?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** 2A-5: printed dimension text observed in this region, e.g. "1200 mm". */
  dimensionText?: string | null;
  /** 2A-5: legend code or label this candidate appears consistent with. */
  legendRef?: string | null;
  /** 2A-5: equipment or tag reference observed near this candidate. */
  equipmentRef?: string | null;
  /** 2A-5: provider-reported visual similarity in 0..1. */
  similarity?: number | null;
};

/**
 * Clamps a provider-reported normalized box into the page-space contract.
 * A box that is not finite, or whose corners are not ordered, carries no
 * usable position at all: it is rejected rather than silently repaired into a
 * plausible-looking region.
 */
export function normalizeGeometryBox(box: { x0: number; y0: number; x1: number; y1: number } | null | undefined): NormalizedBox | null {
  if (!box) return null;
  const values = [box.x0, box.y0, box.x1, box.y1];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1);
  const y1 = Math.max(box.y0, box.y1);
  return { x0: Math.max(0, Math.min(1, x0)), y0: Math.max(0, Math.min(1, y0)), x1: Math.max(0, Math.min(1, x1)), y1: Math.max(0, Math.min(1, y1)) };
}

export type VisualInspectionResult = {
  /** Echo of the request page number. Providers never invent one. */
  pageNumber: number | null;
  observations: VisualObservationDraft[];
  status: VisualInspectionStatus;
  confidence: number | null;
  reliability: ObservationReliability;
  providerId: string;
  limitations: string[];
  error: string | null;
};

export const MAX_VISUAL_OBSERVATIONS = 12;
export const MAX_VISUAL_DESCRIPTION = 200;
const MAX_VISUAL_DRAFT_LIMITATIONS = 4;
const MAX_VISUAL_LIMITATION = 200;

/** Image MIME types the visual gate accepts. Mirrors the ingest allowlist. */
const VISUAL_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Bounded region vocabulary for the image locator. */
const VISUAL_REGIONS = new Set([
  "upper-left",
  "upper-right",
  "center",
  "lower-left",
  "lower-right",
  "left",
  "right",
  "top",
  "bottom",
]);

const VISUAL_REGION_ALIASES: Record<string, string> = {
  "top-left": "upper-left",
  "top-right": "upper-right",
  "bottom-left": "lower-left",
  "bottom-right": "lower-right",
  middle: "center",
};

export function normalizeVisualRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const cleaned = region.trim().toLocaleLowerCase().replace(/[\s_]+/gu, "-");
  if (!cleaned || cleaned === "full-image" || cleaned === "whole-image" || cleaned === "image") return null;
  if (VISUAL_REGIONS.has(cleaned)) return cleaned;
  return VISUAL_REGION_ALIASES[cleaned] ?? null;
}

export type VisionGateDecision = { requested: boolean; reason: string };

/**
 * Conservative gate: vision runs only for supported image MIME types within
 * the configured byte cap. Oversized or non-image bytes are never sent to a
 * provider; the reason is kept as a limitation.
 */
export function shouldRequestVision(input: { mimeType: string; byteLength: number; maxImageBytes: number }): VisionGateDecision {
  if (!VISUAL_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    return { requested: false, reason: `MIME type "${input.mimeType}" is not a supported image type; visual inspection not requested` };
  }
  if (!Number.isInteger(input.byteLength) || input.byteLength <= 0) {
    return { requested: false, reason: "the image has no readable bytes; visual inspection not requested" };
  }
  if (input.byteLength > input.maxImageBytes) {
    return { requested: false, reason: `the image (${input.byteLength} bytes) exceeds the ${input.maxImageBytes}-byte vision limit; visual inspection not requested` };
  }
  return { requested: true, reason: `supported ${input.mimeType} image (${input.byteLength} bytes); visual inspection requested` };
}

/** Maps a provider-reported 0..1 confidence onto the ordinal reliability band. */
export function visualReliabilityFor(confidence: number | null | undefined): ObservationReliability {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return "MEDIUM";
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.5) return "MEDIUM";
  return "LOW";
}

function clip(value: string, max: number): { text: string; clipped: boolean } {
  const trimmed = value.trim();
  return trimmed.length > max ? { text: `${trimmed.slice(0, max)}…`, clipped: true } : { text: trimmed, clipped: false };
}

/**
 * Turns raw provider drafts into bounded, governed observations.
 *
 * Enforcement (structural, not advisory):
 * - unknown observation types are dropped, never coerced into a known type;
 * - empty descriptions are dropped; over-long ones are clipped with a note;
 * - at most MAX_VISUAL_OBSERVATIONS survive; the rest are dropped with a note;
 * - every observation keeps `pageNumber: null` and UNATTRIBUTED attribution
 *   for standalone images; the provider cannot invent page provenance.
 */
export function normalizeVisualDrafts(
  drafts: VisualObservationDraft[],
  input: { providerId: string; pageNumber?: number | null },
): { observations: ObservedFact[]; dropped: number; limitations: string[] } {
  const observations: ObservedFact[] = [];
  const limitations: string[] = [];
  let dropped = 0;
  for (const draft of drafts) {
    if (observations.length >= MAX_VISUAL_OBSERVATIONS) {
      dropped += 1;
      continue;
    }
    if (!draft || !isVisualObservationType(draft.type)) {
      dropped += 1;
      continue;
    }
    const clipped = clip(draft.description ?? "", MAX_VISUAL_DESCRIPTION);
    if (!clipped.text) {
      dropped += 1;
      continue;
    }
    const region = normalizeVisualRegion(draft.region);
    const locator = region ? `image, ${region}` : "image";
    const draftLimitations = (Array.isArray(draft.limitations) ? draft.limitations : [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_VISUAL_DRAFT_LIMITATIONS)
      .map((item) => clip(item, MAX_VISUAL_LIMITATION).text);
    observations.push({
      type: draft.type,
      value: clipped.text,
      status: OBSERVATION_STATUS,
      pageNumber: input.pageNumber ?? null,
      attribution: "UNATTRIBUTED",
      reliability: visualReliabilityFor(draft.confidence),
      evidence: { snippet: clipped.text, locator, lineNumber: null },
      visualOrigin: { source: "VISION", providerId: input.providerId },
      limitations: [
        "visual observation from image inspection; it is not a verified fact, an approved quantity, a selected product, or an engineering assessment",
        ...draftLimitations,
        ...(clipped.clipped ? [`description was truncated to ${MAX_VISUAL_DESCRIPTION} characters`] : []),
      ],
    });
  }
  if (dropped > 0) {
    limitations.push(`${dropped} visual observation(s) were dropped because they fell outside the bounded visual vocabulary or safety limits`);
  }
  return { observations, dropped, limitations };
}
