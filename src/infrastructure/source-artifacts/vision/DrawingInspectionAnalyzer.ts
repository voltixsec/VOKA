import type { ArtifactAnalysisInput } from "@/src/application/source-artifacts";
import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import type { AnalyzedPdfInspection } from "../DocumentInspectionAnalyzer";
import {
  UNAVAILABLE_VISION_PROVIDER_ID,
  shouldRequestVision,
  shouldInspectDrawingPage,
  mergeDrawingObservations,
  normalizeDrawingDrafts,
  DRAWING_VISION_PROFILE,
  MAX_DRAWING_OBSERVATIONS,
  type ArtifactPage,
  type DrawingGateIntent,
  type ObservedFact,
  type PageAttribution,
  type VisualObservationDraft,
} from "@/src/domain/source-artifact";
import { pdfJsPageRasterizer, type PageRasterizerPort, type RasterizedPage } from "../ocr/PageRasterizer";

/**
 * Phase 2A-4 drawing inspection pipeline: the single place where the drawing
 * gate, the real page rasterizer (2A-2), the production vision port (2A-3),
 * and the bounded drawing vocabulary meet the accepted governed pipeline.
 *
 * Flow: accepted analysis (native + OCR) -> conservative drawing gate ->
 * rasterize ONLY qualified pages -> provider with the drawing-specific bounded
 * profile -> `normalizeDrawingDrafts` -> merge under the text readings so
 * every disagreement stays reviewable.
 *
 * Hard rules:
 * - pages that fail the gate are never rasterized and never sent anywhere;
 * - the general unavailable-provider double is consulted for its reason, not
 *   fed raster bytes: qualifying pages are recorded as attempted-but-skipped;
 * - raster or provider failure is isolated per page: one bad page never
 *   aborts the pass and never becomes a claim that inspection succeeded;
 * - page provenance is enforced here: the observation's page number and
 *   attribution are the caller's proven values, never a provider echo;
 * - nothing here approves, counts, measures, or selects: this module turns
 *   bytes into bounded observations and limitations only.
 */

export type DrawingVisionLimits = {
  /** Maximum drawing pages rasterized and sent to vision per inspection. */
  maxPages: number;
  /** Rasterized pages above this byte size are never sent to the provider. */
  maxImageBytes: number;
  /** Render scale for drawing pages (1.0 = 72 DPI). */
  rasterScale: number;
  /** Longest rendered edge in pixels; larger pages are downscaled to bound memory. */
  rasterMaxDimensionPx: number;
};

/** Conservative default: a drawing set must not explode provider calls or cost. */
export const DRAWING_DEFAULT_MAX_PAGES = 4;
export const DRAWING_DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DRAWING_DEFAULT_RASTER_SCALE = 2.5;
export const DRAWING_DEFAULT_RASTER_MAX_DIMENSION_PX = 5000;

/** Minimal environment surface the resolver reads; `process.env` satisfies it. */
export type DrawingVisionEnv = Record<string, string | undefined>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat((raw ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Operational limits follow the accepted OCR/vision config pattern:
 * env-overridable, defaulted conservative, and clamped so one large drawing
 * set cannot explode memory, provider calls, or response size.
 */
export function resolveDrawingVisionLimits(env: DrawingVisionEnv = process.env): DrawingVisionLimits {
  return {
    maxPages: Math.min(10, positiveInt(env.VOKA_DRAWING_MAX_PAGES, DRAWING_DEFAULT_MAX_PAGES)),
    maxImageBytes: positiveInt(env.VOKA_DRAWING_MAX_IMAGE_BYTES, DRAWING_DEFAULT_MAX_IMAGE_BYTES),
    rasterScale: positiveNumber(env.VOKA_DRAWING_RASTER_SCALE, DRAWING_DEFAULT_RASTER_SCALE),
    rasterMaxDimensionPx: Math.min(8000, positiveInt(env.VOKA_DRAWING_RASTER_MAX_DIMENSION_PX, DRAWING_DEFAULT_RASTER_MAX_DIMENSION_PX)),
  };
}

/**
 * Structured reason tokens for the brief. They are never printed verbatim;
 * the projector maps each one to a plain EN/AR sentence.
 */
export type DrawingVisionOutcome = "RAN" | "NO_QUALIFIED_PAGES" | "NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE";

/**
 * Phase 2A-5: the raw bounded drafts a provider returned for one page, kept
 * verbatim so the geometry pass can derive dimension, legend, and symbol
 * evidence from the SAME reading instead of calling vision a second time.
 * They are provider output and stay untrusted until bounded downstream.
 */
export type DrawingVisionDraftPage = {
  pageNumber: number | null;
  attribution: PageAttribution;
  providerId: string;
  drafts: VisualObservationDraft[];
};

/** Upper bound of raw drafts retained per page for downstream 2A-5 evidence. */
export const MAX_DRAWING_DRAFTS_PER_PAGE = 40;

export type DrawingPassSummary = {
  attempted: boolean;
  used: boolean;
  outcome: DrawingVisionOutcome;
  /** Proven page numbers (null = unattributed page, never invented). */
  requestedPages: (number | null)[];
  usedPages: (number | null)[];
  providers: string[];
  limitations: string[];
  /** Phase 2A-5: raw provider drafts per page, for the geometry pass. */
  drafts: DrawingVisionDraftPage[];
};

export type DrawingAugmentedAnalysis = {
  analysis: ArtifactAnalysisInput;
  pass: DrawingPassSummary;
};

/** A page number is only claimable when the page tree proved the attribution. */
function provenPageNumber(page: ArtifactPage): number | null {
  return page.attribution === "PAGE_TREE" ? (page.pageNumber ?? null) : null;
}

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "an unattributed page" : `page ${pageNumber}`;
}

export type DrawingPassContext = {
  artifactId: string;
  pdfBytes: Uint8Array;
  vision: VisualInspectionPort | null;
  intent: DrawingGateIntent;
  limits: DrawingVisionLimits;
  /** Injectable for tests; production uses the real 2A-2 rasterizer at drawing limits. */
  rasterizer?: PageRasterizerPort | null;
};

/**
 * Runs the gated drawing pass over an already-completed PDF analysis and
 * returns the extended analysis input the governed projector consumes.
 * This function never throws for provider or rasterizer reasons: every
 * failure becomes an isolated, truthfully reported limitation.
 */
export async function analyzeDrawingPages(
  analyzed: AnalyzedPdfInspection,
  context: DrawingPassContext,
): Promise<DrawingAugmentedAnalysis> {
  const base = {
    attempted: false,
    used: false,
    outcome: "NO_QUALIFIED_PAGES" as DrawingVisionOutcome,
    requestedPages: [] as (number | null)[],
    usedPages: [] as (number | null)[],
    providers: [] as string[],
    limitations: [] as string[],
    drafts: [] as DrawingVisionDraftPage[],
  } satisfies DrawingPassSummary;
  const { pages } = analyzed.inspection;
  const pageClassifications = analyzed.classification?.pages ?? [];
  if (!pages.length) {
    return {
      analysis: {
        inspection: analyzed.inspection,
        classification: analyzed.classification,
        observations: analyzed.observations,
        limitations: analyzed.limitations,
        drawing: { attempted: false, pages: [], outcome: "NO_QUALIFIED_PAGES" },
      },
      pass: base,
    };
  }

  // 1. Gate every page against the accepted classification. Only explicit,
  //    reviewable evidence opens the gate; rasterization is never even
  //    attempted for pages that do not pass.
  const eligible: { index: number; page: ArtifactPage; reason: string }[] = [];
  const gateNotes: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const classification = pageClassifications[index] ?? null;
    const decision = shouldInspectDrawingPage({ intent: context.intent, classification });
    if (decision.requested) eligible.push({ index, page, reason: decision.reason });
    else if (classification?.value === "UNKNOWN") gateNotes.push(`${pageRef(provenPageNumber(page))}: ${decision.reason}`);
  }
  if (!eligible.length) {
    const note = context.intent === "DRAWING_INSPECTION"
      ? "no page carried credible drawing evidence, so drawing vision was not requested for this artifact and the pages need review"
      : null;
    return {
      analysis: {
        inspection: analyzed.inspection,
        classification: analyzed.classification,
        observations: analyzed.observations,
        limitations: note ? [...analyzed.limitations, note] : analyzed.limitations,
        drawing: { attempted: false, pages: [], outcome: "NO_QUALIFIED_PAGES" },
      },
      pass: { ...base, limitations: note ? [note] : [] },
    };
  }

  // 2. Bound the cost: cap qualified pages before anything is rendered.
  const capped = eligible.slice(0, Math.max(0, context.limits.maxPages));
  const cappedOut = eligible.length - capped.length;
  const limitations: string[] = [];
  if (cappedOut > 0) {
    limitations.push(`drawing vision was limited to the first ${capped.length} qualified page(s); ${cappedOut} further qualified page(s) were not inspected`);
  }
  for (const note of gateNotes.slice(0, 3)) limitations.push(note);

  // 3. No usable provider: record the skip truthfully. Qualified pages are
  //    NOT rasterized for a provider that cannot answer.
  const unavailableReason = !context.vision
    ? "drawing semantic vision is not configured in this runtime, so qualified drawing pages were not read visually"
    : context.vision.providerId === UNAVAILABLE_VISION_PROVIDER_ID
      ? "the drawing vision provider is unavailable, so qualified drawing pages were not read visually"
      : null;
  if (!context.vision || unavailableReason) {
    const outcome: DrawingVisionOutcome = context.vision ? "PROVIDER_UNAVAILABLE" : "NOT_CONFIGURED";
    return {
      analysis: {
        inspection: analyzed.inspection,
        classification: analyzed.classification,
        observations: analyzed.observations,
        limitations: [...analyzed.limitations, unavailableReason ?? "drawing semantic vision is not configured in this runtime"],
        drawing: { attempted: false, pages: capped.map((item) => provenPageNumber(item.page)), outcome },
      },
      pass: {
        ...base,
        attempted: false,
        outcome,
        requestedPages: capped.map((item) => provenPageNumber(item.page)),
        limitations: [...limitations, unavailableReason ?? "drawing semantic vision is not configured in this runtime"],
      },
    };
  }

  const rasterizer = context.rasterizer ?? pdfJsPageRasterizer({
    scale: context.limits.rasterScale,
    maxDimensionPx: context.limits.rasterMaxDimensionPx,
  });
  const drawingObservations: ObservedFact[] = [];
  const requestedPages: (number | null)[] = [];
  const usedPages: (number | null)[] = [];
  const providers = new Set<string>();
  // Phase 2A-5: keep the raw bounded drafts per page so the geometry pass can
  // reuse this reading instead of sending the page to vision again.
  const drafts: DrawingVisionDraftPage[] = [];
  for (const item of capped) {
    const page = item.page;
    const pageNumber = provenPageNumber(page);
    requestedPages.push(pageNumber);
    // 4. Rasterize exactly one qualified page; a render failure is isolated.
    let raster: RasterizedPage;
    try {
      raster = await rasterizer.rasterize(context.pdfBytes, item.index);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown rasterizer failure";
      limitations.push(`${pageRef(pageNumber)} could not be rasterized (${detail.slice(0, 200)}); drawing vision skipped for this page`);
      continue;
    }
    // 5. Byte bound before transport: oversized rasters are never sent.
    const sizeGate = shouldRequestVision({ mimeType: "image/png", byteLength: raster.png.byteLength, maxImageBytes: context.limits.maxImageBytes });
    if (!sizeGate.requested) {
      limitations.push(`${pageRef(pageNumber)} was not sent to drawing vision: ${sizeGate.reason}`);
      continue;
    }
    // 6. One provider call, bounded and isolated.
    try {
      const result = await context.vision.inspect({
        artifactId: context.artifactId,
        imageBytes: raster.png,
        mimeType: "image/png",
        pageNumber,
        reason: item.reason,
        analysisProfile: DRAWING_VISION_PROFILE,
      });
      providers.add(result.providerId);
      if (result.status !== "COMPLETED") {
        const detail = result.status === "UNAVAILABLE"
          ? `${pageRef(pageNumber)}: the vision provider is unavailable; this page was not read visually`
          : result.status === "NO_USABLE_OBSERVATIONS"
            ? `${pageRef(pageNumber)}: the vision provider returned no usable drawing observations`
            : `${pageRef(pageNumber)}: drawing vision failed${result.error ? `: ${String(result.error).slice(0, 200)}` : ""}`;
        limitations.push(detail);
        continue;
      }
      // Provider output is normalized against the bounded drawing vocabulary.
      // Provenance is enforced from the caller, never from the provider echo.
      const normalized = normalizeDrawingDrafts(result.observations, {
        providerId: result.providerId,
        artifactId: context.artifactId,
        pageNumber,
        attribution: page.attribution === "PAGE_TREE" ? "PAGE_TREE" : "UNATTRIBUTED",
        surface: "PAGE",
      });
      if (normalized.observations.length) {
        usedPages.push(pageNumber);
        providers.add(result.providerId);
      }
      if (result.observations.length) {
        drafts.push({
          pageNumber,
          attribution: page.attribution === "PAGE_TREE" ? "PAGE_TREE" : "UNATTRIBUTED",
          providerId: result.providerId,
          drafts: result.observations.slice(0, MAX_DRAWING_DRAFTS_PER_PAGE),
        });
      }
      for (const observation of normalized.observations) {
        if (drawingObservations.length >= MAX_DRAWING_OBSERVATIONS) {
          limitations.push(`the drawing observation total was capped at ${MAX_DRAWING_OBSERVATIONS} for this artifact; further qualified content was not listed`);
          break;
        }
        drawingObservations.push(observation);
      }
      limitations.push(...normalized.limitations);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown provider failure";
      limitations.push(`drawing vision failed for ${pageRef(pageNumber)} (${detail.slice(0, 200)}); this page is reported as not inspected visually`);
    }
  }

  // 7. Merge under the text readings: disagreements keep both values and are
  //    surfaced as review notes; agreements are kept once, reported, never
  //    silently merged with the native/OCR channel.
  const merged = mergeDrawingObservations(analyzed.observations, drawingObservations);
  if (merged.agreements > 0) {
    limitations.push(`${merged.agreements} drawing observation(s) agreed exactly with a text reading and were kept once as text observations`);
  }
  limitations.unshift(...merged.conflictNotes);

  const attempted = requestedPages.length > 0;
  const used = drawingObservations.length > 0;
  return {
    analysis: {
      inspection: analyzed.inspection,
      classification: analyzed.classification,
      observations: merged.observations,
      limitations: [...new Set([...analyzed.limitations, ...limitations])],
      vision: { attempted, providerId: [...providers][0] ?? null },
      drawing: { attempted, pages: used ? usedPages : requestedPages, outcome: "RAN" },
    },
    pass: {
      attempted,
      used,
      outcome: "RAN",
      requestedPages,
      usedPages,
      providers: [...providers],
      limitations,
      drafts,
    },
  };
}

/**
 * Standalone drawing image (section J): the accepted 2A-3 vision boundary is
 * reused with the drawing profile. Runs only when the image was explicitly
 * requested as a drawing and passes the accepted size/type gate; the page
 * number stays null because an image has no page structure to attribute to.
 */
export async function analyzeImageBytesAsDrawing(
  imageBytes: Uint8Array,
  mimeType: string,
  vision: VisualInspectionPort | null,
  options: { artifactId: string; maxImageBytes: number },
): Promise<DrawingAugmentedAnalysis> {
  const inspection: ArtifactAnalysisInput["inspection"] = {
    format: "IMAGE",
    mimeType,
    sizeBytes: imageBytes.byteLength,
    text: "",
    pages: [],
    document: { pageCount: null, pageAttributionReliable: false, encrypted: false, limitations: [] },
  };
  const empty = (limitations: string[], attempted: boolean, outcome: DrawingVisionOutcome, pages: (number | null)[] = [], providers: string[] = [], drafts: DrawingVisionDraftPage[] = []): DrawingAugmentedAnalysis => ({
    analysis: { inspection, classification: null, observations: [], limitations, vision: { attempted, providerId: providers[0] ?? null }, drawing: { attempted, pages, outcome } },
    pass: { attempted, used: false, outcome, requestedPages: pages, usedPages: [], providers, limitations, drafts },
  });
  const gate = shouldRequestVision({ mimeType, byteLength: imageBytes.byteLength, maxImageBytes: options.maxImageBytes });
  if (!gate.requested) {
    return empty([`drawing vision was not run on this image: ${gate.reason}`], false, "NO_QUALIFIED_PAGES");
  }
  const unavailableReason = !vision
    ? "drawing semantic vision is not configured in this runtime, so this drawing image was stored but not read visually"
    : vision.providerId === UNAVAILABLE_VISION_PROVIDER_ID
      ? "the drawing vision provider is unavailable, so this drawing image was not read visually"
      : null;
  if (!vision || unavailableReason) return empty([unavailableReason ?? "drawing semantic vision is not configured in this runtime"], false, vision ? "PROVIDER_UNAVAILABLE" : "NOT_CONFIGURED");
  try {
    const result = await vision.inspect({
      artifactId: options.artifactId,
      imageBytes,
      mimeType,
      pageNumber: null,
      reason: "standalone image explicitly requested as a drawing inspection",
      analysisProfile: DRAWING_VISION_PROFILE,
    });
    if (result.status !== "COMPLETED") {
      const detail = result.status === "UNAVAILABLE"
        ? "the vision provider is unavailable; this drawing image was not read visually"
        : result.status === "NO_USABLE_OBSERVATIONS"
          ? "the vision provider returned no usable drawing observations for this image"
          : `drawing vision failed${result.error ? `: ${String(result.error).slice(0, 200)}` : ""}`;
      return empty([detail], true, "RAN", [null], [result.providerId]);
    }
    const normalized = normalizeDrawingDrafts(result.observations, {
      providerId: result.providerId,
      artifactId: options.artifactId,
      pageNumber: null,
      attribution: "UNATTRIBUTED",
      surface: "IMAGE",
    });
    const used = normalized.observations.length > 0;
    const imageDrafts: DrawingVisionDraftPage[] = result.observations.length
      ? [{ pageNumber: null, attribution: "UNATTRIBUTED", providerId: result.providerId, drafts: result.observations.slice(0, MAX_DRAWING_DRAFTS_PER_PAGE) }]
      : [];
    return {
      analysis: {
        inspection,
        classification: null,
        observations: normalized.observations,
        limitations: [
          "drawing observations were produced by an AI vision model reading this image; they are bounded visual readings, not verified facts, measurements, counts, or approvals",
          ...result.limitations,
          ...normalized.limitations,
        ],
        vision: { attempted: true, providerId: result.providerId },
        drawing: { attempted: true, pages: used ? [null] : [], outcome: "RAN" },
      },
      pass: {
        attempted: true,
        used,
        outcome: "RAN",
        requestedPages: [null],
        usedPages: used ? [null] : [],
        providers: [result.providerId],
        limitations: normalized.limitations,
        drafts: imageDrafts,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown provider failure";
    return empty([`drawing vision failed for this image (${detail.slice(0, 200)}); it is reported as not inspected visually`], true, "RAN", [null], [vision.providerId]);
  }
}
