import type { ArtifactPage } from "./index";

/**
 * Phase 2A-2: OCR / scanned-image text recovery boundary.
 *
 * This module owns the OCR *data model* and the *request gate* only. It holds
 * no engine implementation, no rasterization, no recognition, and no business
 * rules about what recognized text means: an OCR engine turns page images into
 * candidate text, and the accepted 2A-1B analysis path (classification and
 * observations) interprets that text with explicit reliability downgrades.
 *
 * Hard rules (carried over from the accepted pipeline):
 * - OCR text is not verified text; it never masquerades as native text;
 * - OCR output never invents a page number: the engine echoes the proven page
 *   number it was given, or null for unattributed content;
 * - OCR-derived observations stay OBSERVED_NOT_APPROVED;
 * - OCR quantity is not approved quantity, OCR model text is not a selected
 *   product, OCR equipment text is not engineering truth;
 * - a scanned drawing that was OCR-read is still not an understood drawing.
 */

/** Identity of the deterministic fixture engine used in tests. It never claims real recognition. */
export const DETERMINISTIC_OCR_ENGINE_ID = "deterministic-test-double";

/** Identity reported when no OCR engine exists in the runtime. */
export const UNAVAILABLE_OCR_ENGINE_ID = "ocr-unavailable";

/**
 * Outcome of an OCR attempt for one page, as reported by the engine.
 * These tokens are provenance metadata; they are never printed verbatim in
 * assistant-facing briefs.
 */
export type OcrStatus =
  | "NOT_REQUESTED"
  | "COMPLETED"
  | "PARTIAL"
  | "LOW_CONFIDENCE"
  | "NO_TEXT_FOUND"
  | "FAILED"
  | "UNAVAILABLE";

/**
 * Ordinal reliability of OCR output. It is an engineering-review signal, not a
 * probability. Statuses that yield usable text map onto this band; absence or
 * failure carries LOW by definition.
 */
export type OcrReliability = "HIGH" | "MEDIUM" | "LOW";

/**
 * What `ArtifactPage.text` contains. `NONE` means no text from any source.
 * `NATIVE_AND_OCR` means `text` holds the native visible text and the page
 * additionally carries `ocrText`, which was analyzed separately so the two
 * readings are never silently merged.
 */
export type PdfTextSource = "NATIVE" | "OCR" | "NATIVE_AND_OCR" | "NONE";

/**
 * Provenance of an OCR attempt attached to a page. Present only when OCR was
 * requested for the page.
 */
export type PageOcrProvenance = {
  status: OcrStatus;
  /** Engine/provider identity, e.g. "deterministic-test-double" or a real provider id. */
  engineId: string;
  requested: boolean;
  /** Engine-reported confidence in 0..1 when the engine reports one; null otherwise. */
  confidence: number | null;
  reliability: OcrReliability;
  limitations: string[];
  /** Engine-reported failure detail; null unless status is FAILED. */
  error: string | null;
};

/**
 * Which reading an observation was taken from. Native observations carry no
 * `origin` key at all (legacy shape preserved); OCR-derived observations
 * always carry `{ textSource: "OCR", engineId }`.
 */
export type ObservationOrigin = {
  textSource: "NATIVE" | "OCR";
  /** Engine identity for OCR-derived observations; null when unknown. */
  engineId: string | null;
};

/**
 * What an OCR engine receives for one page. Real engines rasterize the page
 * from `pdfBytes`; fixture/test engines key canned output off the page
 * identity. `pageNumber` is the proven number or null; engines must echo it.
 */
export type OcrPageRequest = {
  artifactId: string;
  pageNumber: number | null;
  /** Zero-based position of the page in the inspected page list. */
  pageIndex: number;
  /** Source PDF bytes. Test engines ignore these; real engines rasterize from them. */
  pdfBytes: Uint8Array;
  /** Gate explanation: why OCR was requested for this page. */
  reason: string;
};

export type OcrPageResult = {
  /** Echo of the request page number. Engines never invent one. */
  pageNumber: number | null;
  /** Verbatim recognized text, or "" when nothing usable was recognized. */
  text: string;
  status: OcrStatus;
  confidence: number | null;
  reliability: OcrReliability;
  engineId: string;
  limitations: string[];
  error: string | null;
};

/**
 * Native text at or above this many visible characters is trustworthy as the
 * primary reading, so OCR is never requested for the page. It aligns with the
 * classifier's "small amount of text" floor (80 chars): below it, text alone
 * cannot carry a confident reading, so a scanned page may be re-read with OCR.
 */
export const OCR_MIN_TRUSTWORTHY_NATIVE_CHARS = 80;

export type OcrGateDecision = { requested: boolean; reason: string };

/**
 * Conservative gate: OCR runs only when the page shows image/scanned evidence
 * AND the native text is below the trustworthy threshold.
 *
 * - trustworthy native text  -> never OCR (native stays primary);
 * - sparse/empty native text with image evidence -> OCR (supplement or only reading);
 * - sparse/empty native text without image evidence -> never OCR (nothing to re-read).
 */
export function shouldRequestOcr(page: ArtifactPage): OcrGateDecision {
  const metrics = page.metrics;
  const visibleChars = metrics?.visibleTextCharacters ?? page.text.replace(/\s/gu, "").length;
  const imageCount = metrics?.imageCount ?? 0;
  const imageCoverage = metrics?.imageCoverage ?? 0;
  if (visibleChars >= OCR_MIN_TRUSTWORTHY_NATIVE_CHARS) {
    return { requested: false, reason: `native text is trustworthy as primary (${visibleChars} visible characters); OCR not requested` };
  }
  if (imageCount <= 0 && imageCoverage <= 0) {
    return { requested: false, reason: "no image evidence on the page; OCR not requested" };
  }
  if (visibleChars <= 0 && !page.text.trim()) {
    return { requested: true, reason: `page has no usable native text and carries image content (${imageCount} image(s)); OCR requested` };
  }
  return { requested: true, reason: `page has only ${visibleChars} native text characters with image content; OCR requested to supplement the sparse native text` };
}

/** Maps an engine-reported 0..1 confidence onto the ordinal reliability band. */
export function ocrReliabilityFor(confidence: number | null): OcrReliability {
  if (confidence === null || !Number.isFinite(confidence)) return "MEDIUM";
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.5) return "MEDIUM";
  return "LOW";
}

/** Statuses whose text (when non-empty) is usable as an analysis reading. */
export function ocrStatusYieldsText(status: OcrStatus): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "LOW_CONFIDENCE";
}
