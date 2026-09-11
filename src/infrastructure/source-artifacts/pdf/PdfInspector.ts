import type { ArtifactPage, ArtifactPageMetrics, PdfDocumentFacts, PdfInspection, PdfTextExtractionMethod } from "@/src/domain/source-artifact";
import { PdfDocumentParser, type PdfPageRecord } from "./PdfDocument";
import { PdfContentInterpreter, assembleText } from "./PdfContentInterpreter";
import { containsRtl, normalizeVisualRtlLine } from "./PdfTextNormalization";

const PAPER_SIZES: Array<[string, number, number]> = [
  ["A0", 2384, 3370], ["A1", 1684, 2384], ["A2", 1191, 1684], ["A3", 842, 1191], ["A4", 595, 842], ["A5", 420, 595],
  ["ANSI E", 2448, 3168], ["ANSI D", 1584, 2448], ["ANSI C", 1224, 1584], ["Tabloid/ANSI B", 792, 1224], ["Letter", 612, 792], ["Legal", 612, 1008],
  ["Arch E", 2592, 3456], ["Arch D", 1728, 2592], ["Arch C", 1296, 1728], ["Arch B", 864, 1296], ["Arch A", 648, 864],
];

export function paperSizeFor(widthPt: number | null, heightPt: number | null) {
  if (!widthPt || !heightPt) return null;
  const short = Math.min(widthPt, heightPt);
  const long = Math.max(widthPt, heightPt);
  for (const [name, w, h] of PAPER_SIZES) {
    if (Math.abs(short - w) <= Math.max(6, w * 0.012) && Math.abs(long - h) <= Math.max(6, h * 0.012)) return `${name} ${widthPt >= heightPt ? "landscape" : "portrait"}`;
  }
  return null;
}

export const MAX_INSPECTED_PAGES = 400;
export const MAX_TEXT_PER_PAGE = 200_000;

/**
 * Real page-aware PDF inspection. Reads the page tree, interprets content streams
 * (text operators, path and image operators), maps glyphs through embedded font
 * encodings/ToUnicode CMaps, and reports per-page metrics and limitations.
 *
 * It does NOT render pages, run OCR, decode image pixels, or interpret geometry.
 */
export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.subarray(0, 1024).indexOf("%PDF-", 0, "latin1") === -1) throw new Error("PDF_CONTENT_INVALID");
  const parser = new PdfDocumentParser(buffer);
  const model = parser.parse();
  const limitations = [...model.limitations];
  const document: PdfDocumentFacts = { pageCount: model.pageCount, pageAttributionReliable: model.pageTreeReliable, encrypted: model.encrypted, producer: model.info.producer, creator: model.info.creator, title: model.info.title, limitations };
  if (model.encrypted) return { format: "PDF", text: "", pages: [], document };
  const interpreter = new PdfContentInterpreter(parser);
  const pages: ArtifactPage[] = [];
  const inspected = model.pages.slice(0, MAX_INSPECTED_PAGES);
  if (model.pages.length > MAX_INSPECTED_PAGES) limitations.push(`only the first ${MAX_INSPECTED_PAGES} of ${model.pages.length} pages were inspected`);
  for (const record of inspected) pages.push(inspectPage(record, interpreter, model.pageTreeReliable));
  if (!model.pageTreeReliable) {
    // Damaged structure: content streams may exist without a reachable page. Read them
    // as unattributed content rather than silently dropping real text.
    const referenced = new Set(model.pages.flatMap((page) => page.contents));
    const orphans = parser.orphanContentStreams(referenced);
    let recovered = 0;
    for (const stream of orphans) {
      const data = parser.decode(stream);
      if (!data || !/\bBT\b[\s\S]*?\bET\b/u.test(data.toString("latin1"))) continue;
      const page = inspectPage({ pageNumber: 0, ref: null, dict: new Map(), mediaBox: null, rotation: 0, resources: null, contents: [stream], annotations: [], inheritedFromParent: false }, interpreter, false);
      if (!page.text.trim()) continue;
      page.limitations = [...(page.limitations ?? []), "content stream was not linked to a page object; attribution is unknown"];
      pages.push(page);
      recovered += 1;
    }
    if (recovered) limitations.push(`${recovered} content stream(s) were recovered without page attribution`);
    // Drop empty placeholder pages produced by structure scanning when real content was recovered elsewhere.
    if (recovered) { const kept = pages.filter((page) => page.text.trim() || page.hiddenText || (page.metrics?.imageCount ?? 0) > 0); pages.splice(0, pages.length, ...kept); }
  }
  const text = pages.map((page) => page.text).filter(Boolean).join("\n").trim();
  if (!pages.length && !limitations.length) limitations.push("no pages could be inspected");
  const undecodable = pages.reduce((total, page) => total + (page.metrics?.undecodableGlyphs ?? 0), 0);
  if (undecodable > 0) limitations.push(`${undecodable} glyph(s) had no Unicode mapping and were dropped`);
  if (!text && pages.some((page) => page.hiddenText)) limitations.push("only an invisible text layer was found; it is probably OCR output and is not verified against the page images");
  else if (!text && pages.some((page) => (page.metrics?.imageCount ?? 0) > 0)) limitations.push("no machine-readable text; page content is image-based and OCR is not available");
  return { format: "PDF", text, pages, document };
}

function inspectPage(record: PdfPageRecord, interpreter: PdfContentInterpreter, reliable: boolean): ArtifactPage {
  const limitations: string[] = [];
  let stats;
  try { stats = interpreter.interpretPage(record); } catch { stats = null; limitations.push("content stream could not be interpreted"); }
  const widthPt = record.mediaBox ? round(record.mediaBox[2] - record.mediaBox[0]) : null;
  const heightPt = record.mediaBox ? round(record.mediaBox[3] - record.mediaBox[1]) : null;
  const pageArea = widthPt && heightPt ? widthPt * heightPt : 0;
  const visible = stats ? assembleText(stats.chunks.filter((chunk) => !chunk.invisible)) : { text: "", lines: 0, visibleCharacters: 0 };
  const invisible = stats ? assembleText(stats.chunks.filter((chunk) => chunk.invisible)) : { text: "", lines: 0, visibleCharacters: 0 };
  const annotationText = stats?.annotationTexts.join("\n") ?? "";
  const methods: PdfTextExtractionMethod[] = [];
  if (visible.text || invisible.text) methods.push("CONTENT_STREAM_TEXT");
  if (annotationText) methods.push("ANNOTATION_TEXT");
  if (!methods.length) methods.push("NONE");
  let text = [visible.text, annotationText].filter(Boolean).join("\n");
  let hiddenText = invisible.text;
  if (containsRtl(text) || containsRtl(hiddenText)) {
    const reorder = (value: string) => value.split("\n").map(normalizeVisualRtlLine).join("\n");
    const reorderedText = reorder(text);
    const reorderedHidden = reorder(hiddenText);
    if (reorderedText !== text || reorderedHidden !== hiddenText) { text = reorderedText; hiddenText = reorderedHidden; limitations.push("right-to-left text was reordered from visual to logical order; verify Arabic wording against the original"); }
  }
  if (text.length > MAX_TEXT_PER_PAGE) { text = text.slice(0, MAX_TEXT_PER_PAGE); limitations.push(`page text truncated to ${MAX_TEXT_PER_PAGE} characters`); }
  if (hiddenText.length > MAX_TEXT_PER_PAGE) hiddenText = hiddenText.slice(0, MAX_TEXT_PER_PAGE);
  const metrics: ArtifactPageMetrics = {
    visibleTextCharacters: visible.visibleCharacters,
    invisibleTextCharacters: invisible.visibleCharacters,
    annotationCharacters: annotationText.replace(/\s/gu, "").length,
    textLines: visible.lines + invisible.lines,
    vectorPathSegments: stats?.vectorPathSegments ?? 0,
    imageCount: stats?.imageCount ?? 0,
    imageCoverage: pageArea && stats ? Math.min(1, round(stats.imageArea / pageArea, 3)) : 0,
    formXObjectCount: stats?.formXObjectCount ?? 0,
    fontCount: stats?.fontKeys.size ?? 0,
    undecodableGlyphs: stats?.undecodableGlyphs ?? 0,
  };
  if (!record.contents.length) limitations.push("page has no content stream");
  if (stats?.unsupportedFilters) limitations.push(`${stats.unsupportedFilters} stream(s) used an unsupported or corrupt filter`);
  if (stats?.truncated) limitations.push("content interpretation was truncated by safety limits");
  if (stats?.missingFontResources) limitations.push("text referenced a font resource that is missing; ASCII-only fallback decoding was used");
  if (metrics.undecodableGlyphs > 0) limitations.push(`${metrics.undecodableGlyphs} glyph(s) had no Unicode mapping`);
  if (metrics.invisibleTextCharacters > 0) limitations.push("invisible text layer detected (render mode 3/7); it is probably OCR output and is not verified against the image");
  if (metrics.imageCount > 0 && metrics.visibleTextCharacters === 0 && metrics.invisibleTextCharacters === 0) limitations.push("page content is image-only; OCR is not available");
  if (record.inheritedFromParent) limitations.push("page attributes were inherited from the page tree");
  if (!record.mediaBox) limitations.push("page dimensions unavailable");
  const rotation = record.rotation;
  const rotated = rotation === 90 || rotation === 270;
  return {
    pageNumber: reliable ? record.pageNumber : null,
    attribution: reliable ? "PAGE_TREE" : "UNATTRIBUTED",
    text,
    characterCount: text.length,
    ...(hiddenText ? { hiddenText } : {}),
    widthPt: rotated ? heightPt : widthPt,
    heightPt: rotated ? widthPt : heightPt,
    rotation,
    paperSize: paperSizeFor(rotated ? heightPt : widthPt, rotated ? widthPt : heightPt),
    extractionMethods: methods,
    metrics,
    limitations,
  };
}

function round(value: number, digits = 2) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
