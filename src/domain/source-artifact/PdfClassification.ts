import type { ArtifactPage, PageAttribution, PdfDocumentFacts } from "./index";

/**
 * Conservative, evidence-driven classification of inspected PDF pages.
 *
 * This layer sits above the low-level PDF parser. It reads only what the
 * inspection already proved (visible page text, annotation text included in
 * page text, and raw page metrics) and never touches bytes, objects, fonts, or
 * content streams.
 *
 * Guarantees:
 * - every class is backed by explicit, enumerable evidence;
 * - image-only pages never become DRAWING;
 * - vector/path/image counts are never drawing evidence on their own;
 * - weak or conflicting evidence degrades to UNKNOWN (page) / MIXED or UNKNOWN
 *   (document) instead of a best guess;
 * - classification is a document-handling hint, not engineering understanding.
 */

export const DOCUMENT_CLASSIFICATION_VALUES = [
  "TEXT_DOCUMENT",
  "BOQ_OR_SCHEDULE",
  "DRAWING",
  "MIXED",
  "SCANNED_OR_IMAGE_ONLY",
  "UNKNOWN",
] as const;

export type DocumentClassificationValue = (typeof DOCUMENT_CLASSIFICATION_VALUES)[number];

/** `MIXED` is a document-level decision only; a single page is never "mixed". */
export type PageClassificationValue = Exclude<DocumentClassificationValue, "MIXED">;

/**
 * Ordinal reliability of the evidence behind a class: how explicit and how
 * complete the supporting evidence is. It is an engineering-review signal, not
 * a probability and not a statistical confidence.
 */
export type ClassificationReliability = "HIGH" | "MEDIUM" | "LOW";

export type ClassificationEvidenceKind =
  | "TEXT_MARKER"
  | "COLUMN_STRUCTURE"
  | "ROW_STRUCTURE"
  | "PAGE_TEXT_VOLUME"
  | "PAGE_METRIC"
  | "AGGREGATION"
  | "LIMITATION";

export type ClassificationEvidence = {
  kind: ClassificationEvidenceKind;
  /** What was actually observed. Human readable, always traceable to a page. */
  detail: string;
  pageNumber: number | null;
};

export type PageClassification = {
  pageNumber: number | null;
  attribution: PageAttribution;
  value: PageClassificationValue;
  reliability: ClassificationReliability;
  /** Relative evidence weight in 0..1. It is not a probability and must not be used as one. */
  confidence: number;
  evidence: ClassificationEvidence[];
  limitations: string[];
};

export type DocumentClassification = {
  value: DocumentClassificationValue;
  reliability: ClassificationReliability;
  confidence: number;
  evidence: ClassificationEvidence[];
  limitations: string[];
  pages: PageClassification[];
};

/** Always-reported boundaries so a consumer can never read a class as understanding. */
export const CLASSIFICATION_BASELINE_LIMITATIONS: readonly string[] = [
  "classification is based only on observed visible page text and raw page metrics; it is not engineering understanding",
  "vector, path, and image counts are never treated as drawing evidence on their own",
  "no OCR, image interpretation, or geometry interpretation was performed",
];

const RELIABILITY_ORDER: Record<ClassificationReliability, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function weaker(a: ClassificationReliability, b: ClassificationReliability): ClassificationReliability {
  return RELIABILITY_ORDER[a] >= RELIABILITY_ORDER[b] ? a : b;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Evidence strength on a bounded 0..1 scale, derived deterministically from the
 * reliability band plus the number of independent evidence items.
 *
 * It is explicitly NOT a probability, NOT a model score, and NOT a measure of
 * correctness: it only says how much explicit evidence was found. UNKNOWN
 * carries zero strength by definition.
 */
export function classificationConfidence(value: DocumentClassificationValue, reliability: ClassificationReliability, evidenceCount: number) {
  if (value === "UNKNOWN") return 0;
  const base = reliability === "HIGH" ? 0.85 : reliability === "MEDIUM" ? 0.6 : 0.35;
  return round2(Math.min(0.95, base + Math.min(0.1, 0.03 * Math.max(0, evidenceCount - 1))));
}

// ---------------------------------------------------------------------------
// Text reliability inherited from the 2A-1A inspection
// ---------------------------------------------------------------------------

export type PageTextReliability = { reliability: ClassificationReliability; limitations: string[] };

/**
 * Derives how trustworthy the visible text of a page is, from inspection
 * limitations only. Weak text lowers the reliability of anything derived from it
 * and surfaces the reason instead of silently trusting the text.
 */
export function assessPageTextReliability(page: ArtifactPage): PageTextReliability {
  const limitations: string[] = [];
  let reliability: ClassificationReliability = "HIGH";
  const lower = (next: ClassificationReliability, reason: string) => {
    reliability = weaker(reliability, next);
    limitations.push(reason);
  };
  const metrics = page.metrics;
  if (metrics && metrics.undecodableGlyphs > 0) lower("LOW", `${metrics.undecodableGlyphs} glyph(s) had no Unicode mapping, so the visible text is incomplete`);
  if (page.limitations?.some((item) => /truncated/u.test(item))) lower("MEDIUM", "page text was truncated by inspection limits");
  if (page.limitations?.some((item) => /missing font|ASCII-only/iu.test(item))) lower("MEDIUM", "a font resource was missing and text was decoded with a fallback");
  if (page.limitations?.some((item) => /right-to-left/iu.test(item))) lower("MEDIUM", "right-to-left text was reordered by heuristic; wording must be verified against the original");
  if (page.extractionMethods?.includes("ANNOTATION_TEXT")) lower("MEDIUM", "page text includes annotation text, which is not distinguished from body text");
  if (page.attribution !== "PAGE_TREE") lower("MEDIUM", "page attribution is unproven, so page evidence is not tied to a page number");
  // Phase 2A-2: OCR-derived readings flow through this same function so they
  // can never masquerade as native text. OCR caps reliability and always
  // carries a review limitation; native text supplemented by OCR keeps its own
  // reliability while the OCR reading stays separately reviewable.
  const ocr = page.ocr;
  const ocrTextPresent = typeof page.ocrText === "string" && page.ocrText.trim().length > 0;
  if (page.textSource === "OCR") {
    const low = ocr?.status === "LOW_CONFIDENCE" || ocr?.reliability === "LOW";
    lower(
      low ? "LOW" : "MEDIUM",
      low
        ? "page text was recovered by OCR from a scanned page with low confidence and must be verified against the original"
        : "page text was recovered by OCR from a scanned page and may require review",
    );
    if (typeof ocr?.confidence === "number" && Number.isFinite(ocr.confidence)) {
      limitations.push(`OCR engine-reported confidence ${ocr.confidence.toFixed(2)} on a 0..1 scale`);
    }
  } else if (page.textSource === "NATIVE_AND_OCR") {
    limitations.push("page also carries OCR-recovered text, analyzed separately; the native text analyzed here stays primary");
  } else if (ocr?.requested && !ocrTextPresent) {
    if (ocr.status === "UNAVAILABLE") limitations.push("OCR was requested for this page but no OCR engine is available in this runtime");
    else if (ocr.status === "FAILED") limitations.push(`OCR was attempted for this page but failed${ocr.error ? `: ${ocr.error}` : ""}; native text, if any, stays primary`);
    else limitations.push("OCR was attempted for this page but recovered no usable text");
  }
  return { reliability, limitations };
}

// ---------------------------------------------------------------------------
// Evidence detection
// ---------------------------------------------------------------------------

/** Collapses the reading-order separator inserted by the text assembler. */
function flattenLine(line: string) {
  return line.replace(/\s*\|\s*/gu, " ").replace(/\s+/gu, " ").trim();
}

const BOQ_HEADING_PATTERNS: RegExp[] = [
  /\bbill\s+of\s+quantities\b/iu,
  /\bschedule\s+of\s+quantities\b/iu,
  /\bschedule\s+of\s+(?:rates|prices|works)\b/iu,
  /\bquantity\s+schedule\b/iu,
  /\bpriced\s+(?:bill|schedule)\b/iu,
  /\bboq\b/iu,
];

const COLUMN_TOKENS: Array<{ token: string; pattern: RegExp }> = [
  { token: "item", pattern: /\bitem\b/iu },
  { token: "description", pattern: /\bdescription\b/iu },
  { token: "qty", pattern: /\bqty\b/iu },
  { token: "quantity", pattern: /\bquantit(?:y|ies)\b/iu },
  { token: "unit", pattern: /\bunit\b/iu },
  { token: "rate", pattern: /\brate\b/iu },
  { token: "amount", pattern: /\bamount\b/iu },
  { token: "total", pattern: /\btotal\b/iu },
  { token: "unit price", pattern: /\bunit\s+price\b/iu },
  { token: "remarks", pattern: /\bremarks?\b/iu },
];

const UNIT_TOKENS = "nos?|no\\.?|each|ea|pcs?|pieces?|units?|sets?|lots?|m|m2|m²|m3|m³|sqm|cum|lm|kg|ton|tonne|kgs|ltr|l";

/** An explicit schedule row: item number, description, quantity, unit. */
const SCHEDULE_ROW = new RegExp(`^(\\d{1,4}(?:[.\\-]\\d{1,4})*)[.)]?\\s+(.+?)\\s+(\\d[\\d,]*(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s*$`, "iu");

type Marker = { id: string; primary: boolean; label: string; pattern: RegExp };

/** Primary markers are explicit drawing/sheet identifiers. Supporting markers only corroborate them. */
const DRAWING_MARKERS: Marker[] = [
  { id: "DRAWING_NUMBER", primary: true, label: "drawing number label", pattern: /\b(?:drawing|dwg)\s*(?:no|number|num|#)\b/iu },
  { id: "SHEET_NUMBER", primary: true, label: "sheet number label", pattern: /\bsheet\s*(?:no|number|num|#)\b/iu },
  { id: "SHEET_OF", primary: true, label: "sheet x of y marker", pattern: /\bsheet\s+\d+\s*(?:of|\/)\s*\d+\b/iu },
  { id: "SCALE", primary: true, label: "scale marker", pattern: /\bscale\s*[:=]?\s*\d+\s*:\s*\d+\b/iu },
  { id: "DRAWING_TITLE", primary: false, label: "drawing/sheet title label", pattern: /\b(?:drawing|sheet)\s+title\b/iu },
  // Revision-shaped value only: a revision-schedule header such as "REV DATE DESCRIPTION" must not count as a revision.
  { id: "REVISION", primary: false, label: "revision marker", pattern: /\brev(?:ision)?\b\s*[:.#]?\s*(?:\d{1,3}[A-Za-z0-9]?|[A-Za-z]{1,2}\d{0,3})(?![A-Za-z0-9])/iu },
  { id: "TITLE_BLOCK_PARTY", primary: false, label: "title-block-like label", pattern: /\b(?:client|consultant|contractor|drawn\s+by|checked\s+by|approved\s+by|designed\s+by|job\s+no|contract\s+no|project\s+no)\s*[:#]/iu },
];

type BoqEvidence = {
  reliability: ClassificationReliability | null;
  headings: string[];
  columns: string[];
  rows: number;
};

function detectBoqEvidence(lines: string[]): BoqEvidence {
  const headings: string[] = [];
  const columns = new Set<string>();
  let rows = 0;
  for (const raw of lines) {
    const line = flattenLine(raw);
    if (!line) continue;
    if (line.length <= 120) {
      for (const pattern of BOQ_HEADING_PATTERNS) {
        const match = line.match(pattern);
        if (match) headings.push(match[0]);
      }
      for (const column of COLUMN_TOKENS) if (column.pattern.test(line)) columns.add(column.token);
    }
    if (SCHEDULE_ROW.test(line)) rows += 1;
  }
  let reliability: ClassificationReliability | null = null;
  if (headings.length) reliability = "HIGH";
  else if (columns.size >= 3 && rows >= 1) reliability = "MEDIUM";
  else if (rows >= 3) reliability = "MEDIUM";
  else if (columns.size >= 3) reliability = "LOW";
  return { reliability, headings: [...new Set(headings)], columns: [...columns], rows };
}

type DrawingEvidence = { primary: string[]; supporting: string[] };

function detectDrawingEvidence(lines: string[]): DrawingEvidence {
  const primary = new Set<string>();
  const supporting = new Set<string>();
  for (const raw of lines) {
    const line = flattenLine(raw);
    if (!line) continue;
    for (const marker of DRAWING_MARKERS) {
      if (!marker.pattern.test(line)) continue;
      (marker.primary ? primary : supporting).add(marker.id);
    }
  }
  return { primary: [...primary], supporting: [...supporting] };
}

function classifyPage(page: ArtifactPage): PageClassification {
  // A page number is only claimable when the page tree proved the attribution.
  // Unattributed recovered content keeps pageNumber null.
  const pageNumber = page.attribution === "PAGE_TREE" ? page.pageNumber ?? null : null;
  const attribution: PageAttribution = page.attribution ?? "UNATTRIBUTED";
  const evidence: ClassificationEvidence[] = [];
  const limitations: string[] = [];
  const add = (kind: ClassificationEvidenceKind, detail: string) => evidence.push({ kind, detail, pageNumber });
  const text = page.text ?? "";
  const lines = text.split(/\r?\n/u);
  const visibleChars = page.metrics?.visibleTextCharacters ?? text.replace(/\s/gu, "").length;
  const lineCount = lines.filter((line) => line.trim()).length;
  const hasVisibleText = visibleChars > 0;
  const hiddenChars = page.metrics?.invisibleTextCharacters ?? 0;
  const imageCount = page.metrics?.imageCount ?? 0;
  const imageCoverage = page.metrics?.imageCoverage ?? 0;
  const textReliability = assessPageTextReliability(page);
  limitations.push(...textReliability.limitations);

  if (!hasVisibleText) {
    if (hiddenChars > 0) {
      add("LIMITATION", "an invisible text layer was detected; it is probably OCR output and is not treated as confirmed page text");
      limitations.push("an invisible text layer was detected but is not treated as confirmed evidence; OCR text was not verified against the page image");
    }
    if (imageCount > 0) {
      add("PAGE_METRIC", `${imageCount} image XObject(s) covering about ${Math.round(imageCoverage * 100)}% of the page with no machine-readable text`);
      limitations.push("page content is image-only; OCR is not available, so the page may be a scan, a raster drawing, or a photograph");
      const reliability = weaker(imageCoverage >= 0.5 ? "MEDIUM" : "LOW", textReliability.reliability);
      return { pageNumber, attribution, value: "SCANNED_OR_IMAGE_ONLY", reliability, confidence: classificationConfidence("SCANNED_OR_IMAGE_ONLY", reliability, evidence.length), evidence, limitations };
    }
    add("LIMITATION", "page has no machine-readable text and no image evidence");
    limitations.push("page has no machine-readable text and no image evidence; its type cannot be determined without OCR or vision");
    return { pageNumber, attribution, value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence, limitations };
  }

  const boq = detectBoqEvidence(lines);
  const drawing = detectDrawingEvidence(lines);
  if (boq.headings.length) add("TEXT_MARKER", `schedule heading(s): ${boq.headings.join(", ")}`);
  if (boq.columns.length) add("COLUMN_STRUCTURE", `schedule column header token(s): ${boq.columns.join(", ")}`);
  if (boq.rows) add("ROW_STRUCTURE", `${boq.rows} line(s) match an explicit item-number/description/quantity/unit row`);
  for (const id of drawing.primary) add("TEXT_MARKER", `drawing identifier: ${DRAWING_MARKERS.find((marker) => marker.id === id)?.label ?? id}`);
  for (const id of drawing.supporting) add("TEXT_MARKER", `supporting title-block text: ${DRAWING_MARKERS.find((marker) => marker.id === id)?.label ?? id}`);
  add("PAGE_TEXT_VOLUME", `${visibleChars} visible character(s) across ${lineCount} line(s)`);

  const boqReliability = boq.reliability;
  let drawingReliability: ClassificationReliability | null = null;
  if (drawing.primary.length >= 2) drawingReliability = "HIGH";
  else if (drawing.primary.length === 1 && drawing.supporting.length >= 1) drawingReliability = "MEDIUM";
  else if (drawing.primary.length === 1) drawingReliability = "LOW";

  if (boqReliability && drawingReliability) {
    limitations.push("conflicting evidence: the page carries both schedule/BOQ structure and drawing identifiers, so no single class was chosen");
    return { pageNumber, attribution, value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence, limitations };
  }

  if (boqReliability) {
    const reliability = weaker(boqReliability, textReliability.reliability);
    if (boqReliability === "LOW") limitations.push("only a column header was found without item rows; the schedule interpretation is weak");
    return { pageNumber, attribution, value: "BOQ_OR_SCHEDULE", reliability, confidence: classificationConfidence("BOQ_OR_SCHEDULE", reliability, evidence.length), evidence, limitations };
  }

  if (drawingReliability) {
    const reliability = weaker(drawingReliability, textReliability.reliability);
    limitations.push("drawing classification comes from explicit textual identifiers only; no geometry, symbol, or dimension was interpreted");
    if (drawingReliability === "LOW") limitations.push("a single drawing identifier was found; a lone marker is weak evidence on its own");
    return { pageNumber, attribution, value: "DRAWING", reliability, confidence: classificationConfidence("DRAWING", reliability, evidence.length), evidence, limitations };
  }

  if (drawing.supporting.length >= 2) {
    limitations.push("title-block-like labels were found without any explicit drawing or sheet identifier, so the page was not classified as a drawing");
    return { pageNumber, attribution, value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence, limitations };
  }

  if (visibleChars >= 400 && lineCount >= 5) {
    const reliability = textReliability.reliability;
    return { pageNumber, attribution, value: "TEXT_DOCUMENT", reliability, confidence: classificationConfidence("TEXT_DOCUMENT", reliability, evidence.length), evidence, limitations };
  }
  if (visibleChars >= 80 && lineCount >= 3) {
    const reliability = weaker("MEDIUM", textReliability.reliability);
    limitations.push("only a small amount of text was found and it carries no schedule or drawing marker");
    return { pageNumber, attribution, value: "TEXT_DOCUMENT", reliability, confidence: classificationConfidence("TEXT_DOCUMENT", reliability, evidence.length), evidence, limitations };
  }

  limitations.push("insufficient visible text and no schedule or drawing marker; the page type cannot be determined");
  return { pageNumber, attribution, value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence, limitations };
}

/**
 * Classifies inspected pages and then the document.
 *
 * Document rules, in order:
 * - encrypted PDF or no pages                         -> UNKNOWN (nothing was read)
 * - every page resolves to the same class             -> that class
 * - pages resolve to two or more real classes         -> MIXED
 * - exactly one real class plus UNKNOWN pages         -> UNKNOWN
 *   (UNKNOWN is absence of knowledge, not a page type: the document is not
 *   proven uniform, so no single class is asserted over the whole file. The
 *   per-page classes stay available in `pages`.)
 */
export function classifyPdfInspection(input: { pages: ArtifactPage[]; document: PdfDocumentFacts }): DocumentClassification {
  const { pages, document } = input;
  const pageClassifications = pages.map(classifyPage);
  const limitations: string[] = [...CLASSIFICATION_BASELINE_LIMITATIONS, ...document.limitations.map((item) => `pdf inspection: ${item}`)];

  if (document.encrypted) {
    return { value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence: [{ kind: "LIMITATION", detail: "the PDF is encrypted and its content was not read", pageNumber: null }], limitations: [...limitations, "encrypted PDFs are not classified"], pages: [] };
  }
  if (!pages.length) {
    return { value: "UNKNOWN", reliability: "LOW", confidence: 0, evidence: [{ kind: "LIMITATION", detail: "no pages were available for classification", pageNumber: null }], limitations: [...limitations, "no pages were available for classification"], pages: [] };
  }

  const values = new Set(pageClassifications.map((page) => page.value));
  if (values.size === 1) {
    const value = [...values][0]!;
    const reliability = pageClassifications.reduce<ClassificationReliability>((acc, page) => weaker(acc, page.reliability), "HIGH");
    const evidence: ClassificationEvidence[] = [{ kind: "AGGREGATION", detail: `all ${pages.length} inspected page(s) resolved to ${value}`, pageNumber: null }];
    const documentLimitations = [...limitations, ...uniqueLimitations(pageClassifications)];
    return { value, reliability, confidence: classificationConfidence(value, reliability, evidenceCountOf(pageClassifications)), evidence, limitations: documentLimitations, pages: pageClassifications };
  }

  const counts = new Map<string, number>();
  for (const page of pageClassifications) counts.set(page.value, (counts.get(page.value) ?? 0) + 1);
  const summary = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => `${value} x${count}`).join(", ");
  const meaningful = [...values].filter((value) => value !== "UNKNOWN");
  const evidence: ClassificationEvidence[] = [
    { kind: "AGGREGATION", detail: `page classes observed in the document: ${summary}`, pageNumber: null },
  ];
  const conflicting = meaningful.length > 1;
  const value: DocumentClassificationValue = conflicting ? "MIXED" : "UNKNOWN";
  const reliability = pageClassifications.reduce<ClassificationReliability>((acc, page) => weaker(acc, page.reliability), "HIGH");
  const documentLimitations = [...limitations, ...uniqueLimitations(pageClassifications)];
  if (conflicting) documentLimitations.push("the document contains more than one kind of page, so a single document class does not describe it");
  else documentLimitations.push("pages resolved to a single class plus unclassifiable pages, so no uniform document class was asserted");
  return {
    value,
    reliability: conflicting ? reliability : "LOW",
    confidence: classificationConfidence(value, conflicting ? reliability : "LOW", evidence.length),
    evidence,
    limitations: documentLimitations,
    pages: pageClassifications,
  };
}

function evidenceCountOf(pages: PageClassification[]) {
  return pages.reduce((total, page) => total + page.evidence.filter((item) => item.kind !== "LIMITATION").length, 0);
}

function uniqueLimitations(pages: PageClassification[]) {
  return [...new Set(pages.flatMap((page) => page.limitations))].filter((item) => !CLASSIFICATION_BASELINE_LIMITATIONS.includes(item));
}
