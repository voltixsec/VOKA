import type { OcrPort } from "@/src/application/source-artifacts/ports";
import {
  MAX_OBSERVATIONS,
  classifyPdfInspection,
  extractObservations,
  ocrStatusYieldsText,
  shouldRequestOcr,
  type ArtifactPage,
  type ArtifactPageMetrics,
  type ObservedFact,
  type OcrPageResult,
  type OcrStatus,
  type PageOcrProvenance,
  type PdfInspection,
  type PdfTextExtractionMethod,
} from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "../PdfTextExtractor";
import type { AnalyzedPdfInspection } from "../DocumentInspectionAnalyzer";

/**
 * Phase 2A-2 OCR orchestration.
 *
 * Pipeline: 2A-1A inspection -> conservative OCR gate -> OCR engine (page
 * images to candidate text) -> the SAME 2A-1B classification and observation
 * path with explicit reliability downgrades -> governed projection.
 *
 * There is deliberately no second classifier and no second observation
 * extractor here: OCR-derived readings are analyzed by `classifyPdfInspection`
 * and `extractObservations`, which recognize OCR provenance and cap
 * reliability accordingly. This module only gates, augments, and merges.
 *
 * Native/OCR coexistence:
 * - OCR-only pages (empty native text): the OCR text becomes the primary
 *   reading, marked `textSource: "OCR"`;
 * - supplement pages (sparse native text + OCR text): native stays primary
 *   (`textSource: "NATIVE_AND_OCR"`); the OCR reading is analyzed separately
 *   and merged so disagreements stay reviewable instead of silently merged;
 * - exact native/OCR duplicates keep the native observation once.
 */

export type OcrPassSummary = {
  attempted: boolean;
  /** Pages OCR was requested for (null = unattributed position, never invented). */
  requestedPages: (number | null)[];
  /** Pages whose OCR-derived text was actually analyzed. */
  usedPages: (number | null)[];
  engines: string[];
  limitations: string[];
};

export type OcrAugmentedAnalysis = AnalyzedPdfInspection & { ocr: OcrPassSummary };

/** Default cap on OCR-eligible pages per analysis; recognition is expensive, so unbounded documents stay bounded. */
export const OCR_DEFAULT_MAX_PAGES = 25;

/**
 * Phase 2A-2B: a persisted OCR result from an earlier run (ingest) for one
 * page. Reuse is only valid for identical bytes; callers must verify the
 * content hash first (the inspection path already does). Only results that
 * yielded usable text are ever reused: failures and absences always re-run.
 */
export type PriorOcrPage = {
  pageIndex: number;
  pageNumber: number | null;
  text: string;
  status: Parameters<typeof ocrStatusYieldsText>[0];
  confidence: number | null;
  reliability: OcrPageResult["reliability"];
  engineId: string;
  limitations: string[];
  error: OcrPageResult["error"];
};

/** Extracts reusable prior OCR results from persisted pages. Anything unusable is dropped, never trusted. */
export function priorOcrFromStoredPages(pages: ArtifactPage[] | undefined): PriorOcrPage[] {
  if (!pages) return [];
  const prior: PriorOcrPage[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex]!;
    const text = typeof page.ocrText === "string" ? page.ocrText : "";
    const ocr = page.ocr;
    if (!ocr || !text.trim() || !ocrStatusYieldsText(ocr.status)) continue;
    prior.push({
      pageIndex,
      pageNumber: page.attribution === "PAGE_TREE" ? (page.pageNumber ?? null) : null,
      text,
      status: ocr.status,
      confidence: ocr.confidence,
      reliability: ocr.reliability,
      engineId: ocr.engineId,
      limitations: [...ocr.limitations],
      error: ocr.error,
    });
  }
  return prior;
}

const NO_OCR_BASELINE = "no OCR, image interpretation, or geometry interpretation was performed";
const MAX_CONFLICT_NOTES = 10;
const MAX_VALUE_IN_NOTE = 80;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

/** A page number is only claimable when the page tree proved the attribution. */
function provenPageNumber(page: ArtifactPage): number | null {
  return page.attribution === "PAGE_TREE" ? (page.pageNumber ?? null) : null;
}

function pageRef(pageNumber: number | null): string {
  return pageNumber === null ? "unattributed page" : `page ${pageNumber}`;
}

function clipNote(value: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  return trimmed.length > MAX_VALUE_IN_NOTE ? `${trimmed.slice(0, MAX_VALUE_IN_NOTE)}…` : trimmed;
}

/**
 * Text metrics for an OCR-primary reading. Native metrics stay untouched on
 * every other page; here they describe the OCR-derived analysis text (the
 * native reading was empty), which the page limitations disclose.
 */
function withOcrTextMetrics(page: ArtifactPage, ocrText: string): ArtifactPageMetrics {
  const base = page.metrics;
  return {
    visibleTextCharacters: ocrText.replace(/\s/gu, "").length,
    invisibleTextCharacters: base?.invisibleTextCharacters ?? 0,
    annotationCharacters: base?.annotationCharacters ?? 0,
    textLines: ocrText.split(/\r?\n/u).length,
    vectorPathSegments: base?.vectorPathSegments ?? 0,
    imageCount: base?.imageCount ?? 0,
    imageCoverage: base?.imageCoverage ?? 0,
    formXObjectCount: base?.formXObjectCount ?? 0,
    fontCount: base?.fontCount ?? 0,
    undecodableGlyphs: base?.undecodableGlyphs ?? 0,
  };
}

function ocrPrimaryNotes(result: OcrPageResult): string[] {
  const notes = ["page was re-read with OCR; recovered text is marked as OCR-derived and may require review"];
  if (result.status === "LOW_CONFIDENCE") notes.push("OCR confidence is low; verify wording against the original page");
  if (result.status === "PARTIAL") notes.push("OCR recovered only part of the page");
  return notes;
}

function ocrAttemptNote(result: OcrPageResult): string {
  if (result.status === "UNAVAILABLE") return "OCR was requested but no OCR engine is available in this runtime";
  if (result.status === "FAILED") return `OCR was attempted but failed${result.error ? `: ${result.error}` : ""}`;
  return "OCR was attempted but recovered no usable text";
}

/**
 * Merges supplement OCR observations under native-primary precedence: exact
 * duplicates keep the native observation once, while disagreements keep both
 * values with a reviewable conflict note. No raw enum tokens are used.
 */
function mergeObservations(main: ObservedFact[], supplement: ObservedFact[]): { observations: ObservedFact[]; mergeLimitations: string[] } {
  if (!supplement.length) return { observations: main, mergeLimitations: [] };
  const mainKeys = new Set(
    main.map((item) => `${item.type}|${normalize(item.value)}|${item.pageNumber ?? "null"}|${item.evidence.lineNumber ?? "na"}`),
  );
  const merged = [...main];
  const conflictNotes: string[] = [];
  let agreements = 0;
  for (const item of supplement) {
    const exact = `${item.type}|${normalize(item.value)}|${item.pageNumber ?? "null"}|${item.evidence.lineNumber ?? "na"}`;
    if (mainKeys.has(exact)) {
      agreements += 1;
      continue;
    }
    merged.push(item);
    const disagreeing = main.find(
      (candidate) => candidate.type === item.type && (candidate.pageNumber ?? "null") === (item.pageNumber ?? "null") && normalize(candidate.value) !== normalize(item.value),
    );
    if (disagreeing && conflictNotes.length < MAX_CONFLICT_NOTES) {
      conflictNotes.push(
        `${pageRef(item.pageNumber)}: the native text and the OCR text disagree and both values were kept for review (native "${clipNote(disagreeing.value)}" vs OCR "${clipNote(item.value)}")`,
      );
    }
  }
  const mergeLimitations = [...conflictNotes];
  if (agreements > 0) {
    mergeLimitations.push(
      `${agreements} OCR-derived observation(s) matched the native text exactly and were kept once as native observations`,
    );
  }
  const observations = merged.slice(0, MAX_OBSERVATIONS);
  if (merged.length > MAX_OBSERVATIONS) {
    mergeLimitations.push("observation extraction was truncated by safety limits; the document contains more observed text than is listed");
  }
  return { observations, mergeLimitations };
}

/** Rewrites the stale "no OCR was performed" baseline once OCR was attempted. It is exact-match only. */
function replaceNoOcrBaseline(limitations: string[], note: string | null): string[] {
  if (!note) return limitations;
  return limitations.map((item) => (item === NO_OCR_BASELINE ? note : item));
}

/** OCR-derived locators name the OCR line sequence so they cannot be confused with native line numbers. */
function markOcrLocators(observations: ObservedFact[]): void {
  for (const item of observations) {
    if (item.origin?.textSource === "OCR") {
      item.evidence.locator = item.evidence.locator.replace(", line ", ", OCR line ");
    }
  }
}

export async function analyzePdfInspectionWithOcr(
  inspection: PdfInspection,
  ocr: OcrPort,
  context: { artifactId: string; pdfBytes: Uint8Array; priorOcr?: PriorOcrPage[]; maxOcrPages?: number },
): Promise<OcrAugmentedAnalysis> {
  // 1. Gate each page, then recognize in page order so runs are deterministic.
  // Eligible pages are capped (recognition is expensive); pages with a usable
  // persisted result reuse it without calling the engine; an engine that throws
  // degrades that page to FAILED instead of aborting the whole analysis.
  const maxOcrPages = context.maxOcrPages ?? OCR_DEFAULT_MAX_PAGES;
  const priorByIndex = new Map((context.priorOcr ?? []).map((prior) => [prior.pageIndex, prior]));
  const eligible: number[] = [];
  for (let index = 0; index < inspection.pages.length; index += 1) {
    if (shouldRequestOcr(inspection.pages[index]!).requested) eligible.push(index);
  }
  const gated = eligible.slice(0, Math.max(0, maxOcrPages));
  const cappedOut = eligible.length - gated.length;
  const results = new Map<number, OcrPageResult>();
  const requested: (number | null)[] = [];
  for (const index of gated) {
    const page = inspection.pages[index]!;
    const gate = shouldRequestOcr(page);
    const pageNumber = provenPageNumber(page);
    requested.push(pageNumber);
    const prior = priorByIndex.get(index);
    if (prior && (prior.pageNumber ?? null) === pageNumber) {
      results.set(index, {
        pageNumber,
        text: prior.text,
        status: prior.status,
        confidence: prior.confidence,
        reliability: prior.reliability,
        engineId: prior.engineId,
        limitations: [...prior.limitations, "reused persisted OCR result from ingest; recognition was not re-run"],
        error: prior.error,
      });
      continue;
    }
    let result: OcrPageResult;
    try {
      result = await ocr.recognize({
        artifactId: context.artifactId,
        pageNumber,
        pageIndex: index,
        pdfBytes: context.pdfBytes,
        reason: gate.reason,
      });
    } catch (error) {
      const detail = `OCR engine failed: ${error instanceof Error ? error.message : String(error)}`.replace(/\s+/gu, " ").slice(0, 240);
      result = {
        pageNumber,
        text: "",
        status: "FAILED",
        confidence: null,
        reliability: "LOW",
        engineId: ocr.engineId,
        limitations: [detail],
        error: detail,
      };
    }
    // Defensive: the engine must echo the page number; an invented one is never accepted.
    results.set(index, { ...result, pageNumber });
  }

  // 2. Build the analysis pages. Native text is never overwritten: OCR-only
  // pages adopt the OCR reading as primary (marked), supplement pages keep
  // native primary with a separately analyzed OCR view.
  const analysisPages: ArtifactPage[] = [];
  const supplementViews: ArtifactPage[] = [];
  const used: (number | null)[] = [];
  for (let index = 0; index < inspection.pages.length; index += 1) {
    const page = inspection.pages[index]!;
    const pageNumber = provenPageNumber(page);
    const result = results.get(index);
    if (!result) {
      analysisPages.push({ ...page, pageNumber, textSource: page.text.trim() ? "NATIVE" : "NONE" });
      continue;
    }
    const provenance: PageOcrProvenance = {
      status: result.status,
      engineId: result.engineId,
      requested: true,
      confidence: result.confidence,
      reliability: result.reliability,
      limitations: [...result.limitations],
      error: result.error,
    };
    const usable = result.text.trim().length > 0 && ocrStatusYieldsText(result.status);
    const nativePresent = page.text.trim().length > 0;
    const methods: PdfTextExtractionMethod[] = usable
      ? [...new Set([...(page.extractionMethods ?? []), "OCR_TEXT" as const])]
      : [...(page.extractionMethods ?? [])];
    if (!usable) {
      analysisPages.push({
        ...page,
        pageNumber,
        ocr: provenance,
        textSource: nativePresent ? "NATIVE" : "NONE",
        extractionMethods: methods,
        limitations: [...(page.limitations ?? []), ocrAttemptNote(result)],
      });
      continue;
    }
    used.push(pageNumber);
    if (!nativePresent) {
      analysisPages.push({
        ...page,
        pageNumber,
        text: result.text,
        characterCount: result.text.length,
        ocrText: result.text,
        ocr: provenance,
        textSource: "OCR",
        extractionMethods: methods,
        metrics: withOcrTextMetrics(page, result.text),
        limitations: [...(page.limitations ?? []), ...ocrPrimaryNotes(result)],
      });
    } else {
      analysisPages.push({
        ...page,
        pageNumber,
        ocrText: result.text,
        ocr: provenance,
        textSource: "NATIVE_AND_OCR",
        extractionMethods: methods,
        limitations: [
          ...(page.limitations ?? []),
          "page was also read with OCR; the OCR reading was analyzed separately and is kept reviewable alongside the native text",
        ],
      });
      supplementViews.push({
        ...page,
        pageNumber,
        text: result.text,
        characterCount: result.text.length,
        ocrText: result.text,
        ocr: provenance,
        textSource: "OCR",
        extractionMethods: methods,
        metrics: withOcrTextMetrics(page, result.text),
        limitations: [...(page.limitations ?? []), ...ocrPrimaryNotes(result)],
      });
    }
  }

  // 3. The same 2A-1B analysis path. No second classifier, no second extractor.
  const classification = classifyPdfInspection({ pages: analysisPages, document: inspection.document });
  const main = extractObservations(analysisPages);
  const supplement = supplementViews.length
    ? extractObservations(supplementViews)
    : { observations: [] as ObservedFact[], limitations: [] as string[], truncated: false };

  // 4. Merge under native-primary precedence; disagreements stay reviewable.
  const { observations, mergeLimitations } = mergeObservations(main.observations, supplement.observations);
  if (cappedOut > 0) {
    mergeLimitations.unshift(
      `OCR was limited to the first ${gated.length} eligible page(s); ${cappedOut} further page(s) were not re-read`,
    );
  }
  markOcrLocators(observations);

  // 5. Limitations. The OCR outcome leads; the stale "no OCR" baseline is
  // replaced only when OCR was actually attempted.
  const attempted = requested.length > 0;
  const usedList = used.map(pageRef).join(", ");
  const unavailableOnly = attempted && used.length === 0 && [...results.values()].every((result) => result.status === "UNAVAILABLE");
  const ocrNote = !attempted
    ? null
    : used.length > 0
      ? `OCR text recovery was performed on ${used.length} page(s) (${usedList}); image interpretation and geometry interpretation were not performed`
      : unavailableOnly
        ? `OCR was requested for ${requested.length} page(s) but no OCR engine is available in this runtime, so scanned content was not read; image interpretation and geometry interpretation were not performed`
        : `OCR was attempted on ${requested.length} page(s) but recovered no usable text; image interpretation and geometry interpretation were not performed`;
  const classificationLimitations = replaceNoOcrBaseline(classification.limitations, ocrNote);
  const observationLimitations = replaceNoOcrBaseline([...main.limitations, ...supplement.limitations], ocrNote);
  const limitations = [
    ...new Set([
      ...(ocrNote ? [ocrNote] : []),
      ...mergeLimitations,
      ...inspection.document.limitations.map((item) => `pdf inspection: ${item}`),
      ...classificationLimitations,
      ...observationLimitations,
    ]),
  ];

  const text = analysisPages.map((page) => page.text).filter(Boolean).join("\n").trim();
  const engines = [...new Set([...results.values()].map((result) => result.engineId))];
  return {
    format: "PDF",
    inspection: { format: "PDF", text, pages: analysisPages, document: inspection.document },
    classification: { ...classification, limitations: classificationLimitations },
    observations,
    limitations,
    ocr: {
      attempted,
      requestedPages: requested,
      usedPages: used,
      engines,
      limitations: [...(ocrNote ? [ocrNote] : []), ...mergeLimitations],
    },
  };
}

/** Inspects real PDF bytes and analyzes the result with OCR in one call. */
export async function analyzePdfBytesWithOcr(
  bytes: Uint8Array,
  ocr: OcrPort,
  context: { artifactId: string; priorOcr?: PriorOcrPage[]; maxOcrPages?: number },
): Promise<OcrAugmentedAnalysis> {
  return analyzePdfInspectionWithOcr(inspectPdfBytes(bytes), ocr, {
    artifactId: context.artifactId,
    pdfBytes: bytes,
    priorOcr: context.priorOcr,
    maxOcrPages: context.maxOcrPages,
  });
}
