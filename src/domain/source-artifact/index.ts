/** Phase 2A-6: the canonical MIME type for an OOXML (non-macro) workbook. */
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Phase 2A-7: MIME types seen for an ASCII DXF drawing.
 *
 * DXF has no single registered type, so every common one is accepted here and
 * the real decision is made from the bytes: `validateSourceArtifactBytes`
 * requires DXF group-code structure, and the drawing inspector re-checks it and
 * names the format it actually found. A DWG renamed to `.dxf` is rejected as a
 * DWG, never parsed as text.
 */
export const DXF_MIME_TYPE = "image/vnd.dxf";
export const DXF_MIME_TYPES: readonly string[] = ["image/vnd.dxf", "application/dxf", "application/x-dxf", "image/x-dxf"];

/**
 * Phase 2A-8: MIME types seen for a textual IFC STEP file.
 *
 * IFC has no single registered type, so every common one is accepted here and
 * the real decision is made from the bytes: `validateSourceArtifactBytes`
 * requires ISO-10303-21 structure, and the IFC inspector re-checks it and
 * names the format it actually found. An RVT renamed to `.ifc` is rejected as
 * Revit, never parsed as STEP.
 */
export const IFC_MIME_TYPE = "application/x-step";
export const IFC_MIME_TYPES: readonly string[] = [
  "application/x-step",
  "application/step",
  "model/ifc",
  "application/ifc",
  "application/x-ifc",
  "model/vnd.ifc",
];

// Phase 2A-9: proprietary originals join the attachable set so they can enter
// the governed derivation workflow. The declared type only routes the upload:
// a DWG needs a recognized release signature, and an RVT needs the OLE2
// compound signature plus the Revit BasicFileInfo marker, both checked from
// the bytes downstream. The bytes still decide what every file is.
import { DWG_MIME_TYPES, DWG_MIME_TYPE, looksLikeDwgOriginal, looksLikeRvtOriginal, RVT_MIME_TYPES, RVT_MIME_TYPE } from "./ProprietaryArtifact";

export const SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  XLSX_MIME_TYPE,
  ...DXF_MIME_TYPES,
  ...IFC_MIME_TYPES,
  ...DWG_MIME_TYPES,
  ...RVT_MIME_TYPES,
]);

export type SourceArtifactContext = "SALES_ASSISTANT" | "TAKEOFF" | "ENGINEERING_TENDER";
export type SourceArtifactKind = "PDF" | "IMAGE" | "XLSX" | "DXF" | "IFC" | "DWG" | "RVT";

const UNSUPPORTED_TYPE_MESSAGE = "Only PDF, PNG, JPG/JPEG, WebP, XLSX, ASCII DXF, textual IFC, DWG, and RVT files are supported.";

export class SourceArtifactPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SourceArtifactPolicyError";
  }
}

export function artifactKindForMime(mimeType: string): SourceArtifactKind {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === XLSX_MIME_TYPE) return "XLSX";
  // Phase 2A-7: any of the DXF types browsers report resolves to one kind. The
  // type only routes the file; whether it really is an ASCII DXF is decided
  // later from its bytes.
  if (DXF_MIME_TYPES.includes(mimeType)) return "DXF";
  if (IFC_MIME_TYPES.includes(mimeType)) return "IFC";
  // Phase 2A-9: proprietary originals route by any type a browser may report.
  // The type only routes the file; whether it really is a DWG (release
  // signature) or an RVT (OLE2 + Revit marker) is decided later from its bytes.
  if (DWG_MIME_TYPES.includes(mimeType)) return "DWG";
  if (RVT_MIME_TYPES.includes(mimeType)) return "RVT";
  if (mimeType.startsWith("image/")) return "IMAGE";
  throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", UNSUPPORTED_TYPE_MESSAGE);
}

/**
 * Resolves the artifact kind from the declared MIME type.
 *
 * A browser sometimes hands over a workbook or a drawing with an empty or
 * generic `application/octet-stream` type. The file extension is accepted as
 * corroborating evidence for those two cases, and the real decision is made
 * later from the bytes: `validateSourceArtifactBytes` checks the container
 * signature or the DXF group-code shape, and the format-specific inspector
 * verifies the structure, so a renamed file still cannot talk its way into a
 * parser.
 */
function resolveKind(file: File): { mimeType: string; kind: SourceArtifactKind } {
  const mimeType = file.type.toLowerCase();
  if (SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES.has(mimeType)) return { mimeType, kind: artifactKindForMime(mimeType) };
  const extension = /\.([A-Za-z0-9]{1,8})$/u.exec(file.name.trim().toLowerCase())?.[1];
  if (mimeType === "" || mimeType === "application/octet-stream") {
    if (extension === "xlsx") return { mimeType: XLSX_MIME_TYPE, kind: "XLSX" };
    if (extension === "dxf") return { mimeType: DXF_MIME_TYPE, kind: "DXF" };
    if (extension === "ifc") return { mimeType: IFC_MIME_TYPE, kind: "IFC" };
    // Phase 2A-9: proprietary originals a browser reported generically. The
    // extension routes the upload; the bytes decide whether the file is one.
    if (extension === "dwg") return { mimeType: DWG_MIME_TYPE, kind: "DWG" };
    if (extension === "rvt") return { mimeType: RVT_MIME_TYPE, kind: "RVT" };
  }
  throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", UNSUPPORTED_TYPE_MESSAGE);
}

export function validateSourceArtifactInput(file: File, contextValue: unknown) {
  // Phase 2A-9: a Revit family definition is named truthfully and rejected
  // before any generic "unsupported type" answer can hide what it is.
  if (/\.rfa$/iu.test(file.name.trim())) {
    throw new SourceArtifactPolicyError(
      "SOURCE_ARTIFACT_RFA_UNSUPPORTED",
      "This is a Revit family definition (.rfa), not a supported project/model artifact in this phase. Export the project that uses it as IFC and attach the exported model.",
    );
  }
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
      : kind === "DXF"
        // Phase 2A-7: a drawing must carry DXF group-code structure. This is a
        // cheap first gate only — the drawing inspector re-checks it and names
        // the format it actually found, so a DWG renamed to .dxf is rejected as
        // a DWG with a truthful message rather than parsed as text.
        ? looksLikeAsciiDxf(bytes)
        : kind === "IFC"
          // Phase 2A-8: a model must carry ISO-10303-21 STEP structure. This is
          // a cheap first gate only — the IFC inspector re-checks it and names
          // the format it actually found, so an RVT renamed to .ifc is rejected
          // as Revit rather than parsed as STEP.
          ? looksLikeIfcStep(bytes)
        // Phase 2A-9: a proprietary DWG original must carry a recognized AC10xx
        // release signature. A renamed random file, an OLE compound document, or
        // any other binary is rejected here instead of being stored as a DWG.
        : kind === "DWG"
          ? looksLikeDwgOriginal(bytes)
        // Phase 2A-9: a Revit original must carry the OLE2 compound signature
        // AND the Revit BasicFileInfo structural marker. The container
        // signature alone proves nothing — OLE2 is a generic container.
        : kind === "RVT"
          ? looksLikeRvtOriginal(bytes)
        : kind === "IMAGE" && (
        (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        || (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
      );
  if (!valid) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_CONTENT_INVALID", "The attachment content does not match its declared file type.");
}

/**
 * Phase 2A-7: cheap upload-time gate for an ASCII DXF drawing.
 *
 * This is deliberately not the real check. It confirms the file is text and
 * begins with DXF group-code pair structure — a numeric group code followed by
 * a value, repeated — which is enough to reject a binary DWG, a PDF, or a text
 * file at upload. The authoritative decision belongs to the drawing inspector,
 * which reads the sections and names the format it actually found.
 *
 * The domain layer cannot import the infrastructure reader, so this stays a
 * small structural test rather than a second parser.
 */
function looksLikeAsciiDxf(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  // Binary DWG releases start with their version string; binary DXF starts with
  // its own banner. Neither is an ASCII DXF and neither should reach the parser.
  const head = String.fromCharCode(...bytes.slice(0, Math.min(20, bytes.length)));
  if (/^AC10\d{2}/u.test(head) || head.startsWith("AutoCAD Binary DXF")) return false;
  // An OLE2 compound document (Revit) or a ZIP is not a drawing either.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
  const sample = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 4_096)));
  if (sample.includes("\u0000")) return false;
  const lines = sample.split(/\r\n|\r|\n/);
  let pairs = 0;
  let sawSection = false;
  let sawEnd = false;
  for (let index = 0; index + 1 < lines.length && index < 1_024; index += 2) {
    const codeLine = (lines[index] ?? "").trim();
    if (!/^-?\d{1,4}$/u.test(codeLine)) break;
    pairs += 1;
    const value = (lines[index + 1] ?? "").trim();
    if (codeLine === "0" && value === "SECTION") sawSection = true;
    if (codeLine === "0" && (value === "ENDSEC" || value === "EOF")) sawEnd = true;
  }
  // Section framing, or a run of pairs long enough that only a DXF could hold
  // it. Matches the inspector's own decision so the two gates cannot disagree.
  return pairs >= 3 && ((sawSection && sawEnd) || pairs >= 64);
}

/**
 * Phase 2A-8: cheap upload-time gate for a textual IFC STEP file.
 *
 * This is deliberately not the real check. It confirms the file is text and
 * begins with ISO-10303-21 plus HEADER/DATA framing — enough to reject a
 * binary RVT, a DWG, a ZIP/IFCZIP, or a prose file at upload. The
 * authoritative decision belongs to the IFC inspector.
 */
function looksLikeIfcStep(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const head = String.fromCharCode(...bytes.slice(0, Math.min(24, bytes.length)));
  if (/^AC10\d{2}/u.test(head) || head.startsWith("AutoCAD Binary DXF")) return false;
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
  const sample = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 8_192)));
  if (sample.includes("\u0000")) return false;
  const upper = sample.toUpperCase();
  return upper.includes("ISO-10303-21") && /HEADER\s*;/u.test(upper) && /DATA\s*;/u.test(upper);
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
// Phase 2A-7: ASCII DXF / CAD drawing evidence.
export * from "./DxfInspection";
// Phase 2A-8: textual IFC / BIM evidence.
export * from "./IfcInspection";
// Phase 2A-9: proprietary originals (DWG / RVT) and governed derivation lineage.
export * from "./ProprietaryArtifact";
export * from "./ArtifactDerivation";
