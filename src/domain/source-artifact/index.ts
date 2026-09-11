/** Phase 2A-6: the canonical MIME type for an OOXML (non-macro) workbook. */
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  XLSX_MIME_TYPE,
]);

export type SourceArtifactContext = "SALES_ASSISTANT" | "TAKEOFF" | "ENGINEERING_TENDER";
export type SourceArtifactKind = "PDF" | "IMAGE" | "XLSX";

const UNSUPPORTED_TYPE_MESSAGE = "Only PDF, PNG, JPG/JPEG, WebP, and XLSX files are supported.";

export class SourceArtifactPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SourceArtifactPolicyError";
  }
}

export function artifactKindForMime(mimeType: string): SourceArtifactKind {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === XLSX_MIME_TYPE) return "XLSX";
  if (mimeType.startsWith("image/")) return "IMAGE";
  throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", UNSUPPORTED_TYPE_MESSAGE);
}

/**
 * Resolves the artifact kind from the declared MIME type.
 *
 * A browser sometimes hands over a workbook with an empty or generic
 * `application/octet-stream` type. The `.xlsx` extension is accepted as
 * corroborating evidence for that one case, and the real decision is made
 * later from the bytes: `validateSourceArtifactBytes` checks the ZIP container
 * signature and the workbook inspector verifies the OOXML structure, so a
 * renamed file still cannot talk its way into the parser.
 */
function resolveKind(file: File): { mimeType: string; kind: SourceArtifactKind } {
  const mimeType = file.type.toLowerCase();
  if (SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES.has(mimeType)) return { mimeType, kind: artifactKindForMime(mimeType) };
  const extension = /\.([A-Za-z0-9]{1,8})$/u.exec(file.name.trim().toLowerCase())?.[1];
  if ((mimeType === "" || mimeType === "application/octet-stream") && extension === "xlsx") {
    return { mimeType: XLSX_MIME_TYPE, kind: "XLSX" };
  }
  throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", UNSUPPORTED_TYPE_MESSAGE);
}

export function validateSourceArtifactInput(file: File, contextValue: unknown) {
  const { mimeType, kind } = resolveKind(file);
  const maxBytes = 25 * 1024 * 1024;
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > maxBytes) {
    throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_SIZE_INVALID", "The attachment must be between 1 byte and 25 MB.");
  }
  const context = contextValue === "TAKEOFF" || contextValue === "ENGINEERING_TENDER" ? contextValue : "SALES_ASSISTANT";
  return { mimeType, kind, context } as const;
}

export function validateSourceArtifactBytes(kind: SourceArtifactKind, bytes: Uint8Array) {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  // Phase 2A-6: a workbook is a ZIP container (PK\x03\x04, or PK\x05\x06 for an
  // empty archive). The full OOXML structure check belongs to the workbook
  // inspector, which reports exactly what it found instead of failing the
  // upload with a generic message.
  const hasZipContainer = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  const valid = kind === "PDF"
    ? ascii(0, 5) === "%PDF-"
    : kind === "XLSX"
      ? hasZipContainer
      : kind === "IMAGE" && (
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    );
  if (!valid) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_CONTENT_INVALID", "The attachment content does not match its declared file type.");
}

// ---------------------------------------------------------------------------
// Page model (truthful, page-aware inspection result)
// ---------------------------------------------------------------------------

/** How the text on a page was obtained. `NONE` means no machine-readable text was found. */
export type PdfTextExtractionMethod = "CONTENT_STREAM_TEXT" | "ANNOTATION_TEXT" | "OCR_TEXT" | "NONE";

/**
 * `PAGE_TREE`: the page was reached by traversing the PDF catalog page tree, so its
 * page number is proven. `UNATTRIBUTED`: content was read but could not be tied to
 * an ordered page object, so `pageNumber` stays null.
 */
export type PageAttribution = "PAGE_TREE" | "UNATTRIBUTED";

export type ArtifactPageMetrics = {
  visibleTextCharacters: number;
  invisibleTextCharacters: number;
  annotationCharacters: number;
  textLines: number;
  vectorPathSegments: number;
  imageCount: number;
  /** Fraction (0..1) of the page area covered by image XObjects, capped at 1. */
  imageCoverage: number;
  formXObjectCount: number;
  fontCount: number;
  undecodableGlyphs: number;
};

export type ArtifactPage = {
  pageNumber: number | null;
  /**
   * Primary analysis text. Normally the visible content-stream text plus
   * annotation text in reading order; for OCR-primary pages (`textSource`
   * "OCR") it is the OCR-recovered text, always marked as such and never
   * silently merged with native text.
   */
  text: string;
  characterCount: number;
  /** Text drawn with an invisible render mode (typically an OCR layer). Unverified against the page image. */
  hiddenText?: string;
  /** Verbatim OCR output for the page. Present only when OCR produced usable text; never merged into `text` silently. */
  ocrText?: string;
  /** OCR attempt provenance. Present only when OCR was requested for the page. */
  ocr?: import("./PdfOcr").PageOcrProvenance;
  /** What `text` contains. Absent on legacy/2A-1A pages, which are native readings. */
  textSource?: import("./PdfOcr").PdfTextSource;
  attribution?: PageAttribution;
  widthPt?: number | null;
  heightPt?: number | null;
  rotation?: number;
  /** Matched standard paper size such as "A1 landscape"; null when no standard size matches. */
  paperSize?: string | null;
  extractionMethods?: PdfTextExtractionMethod[];
  metrics?: ArtifactPageMetrics;
  limitations?: string[];
};

export type PdfDocumentFacts = {
  pageCount: number | null;
  pageAttributionReliable: boolean;
  encrypted: boolean;
  producer: string | null;
  creator: string | null;
  title: string | null;
  limitations: string[];
};

export type ExtractedPdf = { text: string; pages: ArtifactPage[] };

export type PdfInspection = ExtractedPdf & { format: "PDF"; document: PdfDocumentFacts };

/**
 * Phase 2A-3 image inspection. Images carry no machine-readable text and no
 * pages in this slice: `text` is always "" and `pages` always [], so the
 * governed projector reads the same structural shape without PDF-only
 * assumptions. Visual observations arrive separately, never as page text.
 */
export type ImageDocumentFacts = {
  pageCount: null;
  pageAttributionReliable: false;
  encrypted: false;
  limitations: string[];
};

export type ImageInspection = {
  format: "IMAGE";
  mimeType: string;
  sizeBytes: number;
  text: string;
  pages: ArtifactPage[];
  document: ImageDocumentFacts;
};

/** JSON persisted in SourceArtifact.extractedPages since Phase 2A block 1. Legacy rows hold a bare page array. */
export type StoredPdfPageModel = { version: 2; document: PdfDocumentFacts; pages: ArtifactPage[] };

export function isStoredPdfPageModel(value: unknown): value is StoredPdfPageModel {
  const candidate = value as Partial<StoredPdfPageModel> | null;
  return Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate) && candidate.version === 2 && Array.isArray(candidate.pages) && candidate.document && typeof candidate.document === "object");
}

export function legacyPagesFrom(value: unknown): ArtifactPage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const page = item as Partial<ArtifactPage> | null;
    if (!page || typeof page !== "object" || typeof page.text !== "string") return [];
    return [{ pageNumber: typeof page.pageNumber === "number" ? page.pageNumber : null, text: page.text, characterCount: typeof page.characterCount === "number" ? page.characterCount : page.text.length, attribution: typeof page.pageNumber === "number" ? "PAGE_TREE" : "UNATTRIBUTED" }];
  });
}

// ---------------------------------------------------------------------------
// Phase 2A-1B: analysis layers that sit ABOVE the page model.
// They are pure: they consume an inspection result and produce review-only
// classification and observed facts. No approval, no inference, no BOM.
// ---------------------------------------------------------------------------

export * from "./PdfClassification";
export * from "./PdfObservations";
export * from "./PdfOcr";
export * from "./ImageVisual";
export * from "./DrawingSemantics";
// Phase 2A-5: drawing geometry / printed dimension / symbol-legend evidence.
export * from "./DrawingGeometry";
export * from "./DrawingDimensions";
export * from "./DrawingSymbols";
// Phase 2A-6: Excel / structured BOQ workbook evidence.
export * from "./SpreadsheetInspection";
