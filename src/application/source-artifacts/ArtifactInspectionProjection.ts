import { isDrawingObservationType } from "@/src/domain/source-artifact";
import type { DocumentClassification, DxfAnalysis, IfcAnalysis, ImageInspection, ObservationOrigin, ObservedFact, ObservationReliability, ObservationType, PdfInspection, SpreadsheetAnalysis, VisualOrigin } from "@/src/domain/source-artifact";
import { proposeArtifactCandidates, renderArtifactConflict, type ArtifactCandidateFact, type ArtifactFactConflict, type GovernedFactRef } from "./ArtifactCandidateFacts";
import {
  GOVERNANCE_STATEMENTS_SPREADSHEET,
  emptyProjectedSpreadsheet,
  projectSpreadsheetAnalysis,
  renderSpreadsheetBrief,
  type ProjectedSpreadsheet,
} from "./SpreadsheetInspectionProjection";
import {
  GOVERNANCE_STATEMENTS_DXF,
  emptyProjectedDxf,
  projectDxfAnalysis,
  renderDxfBrief,
  type ProjectedDxf,
} from "./DxfInspectionProjection";
import {
  GOVERNANCE_STATEMENTS_IFC,
  emptyProjectedIfc,
  projectIfcAnalysis,
  renderIfcBrief,
  type ProjectedIfc,
} from "./IfcInspectionProjection";
import {
  emptyProjectedProprietaryOriginal,
  renderDerivationLineageSentence,
  renderProprietaryOriginalGuidance,
  type ProjectedDerivationLineage,
  type ProjectedProprietaryOriginal,
} from "./DerivationProjection";

/**
 * Compact, governed projection of an inspected artifact for the assistant and
 * the runtime.
 *
 * Deliberately bounded: it carries identity, status, classification, a bounded
 * set of observed facts with page provenance, governed candidates, conflicts,
 * limitations, and a short excerpt. It never carries raw parser internals
 * (objects, fonts, streams), never dumps the full extracted text, and never
 * presents an observed value as approved, selected, or complete.
 */

export const MAX_PROJECTED_OBSERVATIONS = 12;
export const MAX_PROJECTED_CANDIDATES = 12;
export const MAX_PROJECTED_LIMITATIONS = 8;
export const MAX_PROJECTED_PAGES = 12;
export const MAX_EXCERPT_CHARACTERS = 400;

// Phase 2A-5: bounds for the projected drawing-geometry view. They exist so the
// assistant-facing record stays small and reviewable no matter how much
// geometry a sheet contains.
export const MAX_PROJECTED_GEOMETRY_PRIMITIVES = 24;
export const MAX_PROJECTED_DIMENSION_TEXTS = 12;
export const MAX_PROJECTED_DIMENSION_LINES = 12;
export const MAX_PROJECTED_DIMENSION_ASSOCIATIONS = 12;
export const MAX_PROJECTED_SCALE_CANDIDATES = 6;
export const MAX_PROJECTED_LEGENDS = 8;
export const MAX_PROJECTED_SYMBOL_CANDIDATES = 8;
export const MAX_PROJECTED_SYMBOL_RELATIONSHIPS = 12;
export const MAX_PROJECTED_GEOMETRY_CONFLICTS = 6;

/**
 * Phase 2A-5: bounded, governed view of drawing geometry evidence.
 *
 * Every record here is page-space evidence: it says where something sits on
 * the sheet and what was printed there. There is deliberately NO count of
 * symbols, no total, no quantity, and no aggregate of any kind — the individual
 * candidates are the whole output, and counting them is out of scope by design.
 */
export type ProjectedGeometryPrimitive = {
  id: string;
  /** Primitive type, carried structurally for rendering; the brief uses plain words. */
  type: string;
  source: "PDF_VECTOR" | "DRAWING_VISION";
  pageNumber: number | null;
  reliability: ObservationReliability;
  boundingBox: { x0: number; y0: number; x1: number; y1: number } | null;
  evidence: { locator: string; reason: string };
};

export type ProjectedDimensionText = {
  id: string;
  pageNumber: number | null;
  /** Which reading produced it; kept distinct so channels never silently merge. */
  channel: "NATIVE_TEXT" | "OCR_TEXT" | "DRAWING_VISION";
  /** Verbatim printed text, e.g. "1200 mm". Never converted. */
  raw: string;
  numericText: string | null;
  /** Present only when the sheet printed one; never inferred. */
  unit: string | null;
  kind: "LENGTH" | "DIAMETER" | "RADIUS" | "LEVEL" | "GRID" | "UNKNOWN";
  /** False for OCR readings, which carry no word positions. */
  positioned: boolean;
  region: string | null;
  reliability: ObservationReliability;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedDimensionLine = {
  id: string;
  pageNumber: number | null;
  /** Length as a fraction of the page, never a real-world distance. */
  length: number;
  horizontal: boolean;
  vertical: boolean;
};

export type ProjectedDimensionAssociation = {
  id: string;
  pageNumber: number | null;
  dimensionTextId: string;
  dimensionLineCandidateId: string;
  /** Distance in normalized page space, never a real-world distance. */
  distance: number;
  confidence: number;
  reliability: ObservationReliability;
  /** True when another line candidate was equally plausible; nothing was preferred. */
  ambiguous: boolean;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedScaleCandidate = {
  id: string;
  pageNumber: number | null;
  /** Verbatim printed scale, e.g. "1:100". */
  printed: string;
  /** Ratio metadata only. Never applied to any distance. */
  ratio: number | null;
  channel: "NATIVE_TEXT" | "OCR_TEXT" | "DRAWING_VISION";
  reliability: ObservationReliability;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedLegendDefinition = {
  id: string;
  pageNumber: number | null;
  label: string;
  code: string | null;
  reliability: ObservationReliability;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedSymbolCandidate = {
  id: string;
  pageNumber: number | null;
  description: string | null;
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  reliability: ObservationReliability;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedSymbolToLegend = {
  id: string;
  pageNumber: number | null;
  symbolId: string;
  legendId: string;
  method: string;
  confidence: number;
  reliability: ObservationReliability;
  ambiguous: boolean;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedSymbolToEquipment = {
  id: string;
  pageNumber: number | null;
  symbolId: string;
  equipmentReference: string;
  method: string;
  confidence: number;
  reliability: ObservationReliability;
  evidence: { locator: string; reason: string };
  limitations: string[];
};

export type ProjectedArtifactGeometry = {
  attempted: boolean;
  used: boolean;
  /** Proven page numbers the pass ran on; null entries are unattributed pages. */
  pages: (number | null)[];
  /** Always true. Every geometry record is normalized page space, never a measurement. */
  pageSpaceOnly: true;
  primitives: ProjectedGeometryPrimitive[];
  dimensionTexts: ProjectedDimensionText[];
  dimensionLines: ProjectedDimensionLine[];
  dimensionAssociations: ProjectedDimensionAssociation[];
  scaleCandidates: ProjectedScaleCandidate[];
  legends: ProjectedLegendDefinition[];
  symbolCandidates: ProjectedSymbolCandidate[];
  symbolToLegend: ProjectedSymbolToLegend[];
  symbolToEquipment: ProjectedSymbolToEquipment[];
  /** Plain-language review notes naming both sides of every disagreement. */
  conflicts: string[];
  limitations: string[];
  truncated: boolean;
};

/** Structural input so the application layer never imports the infrastructure analyzer. */
export type DrawingGeometryProjectionInput = {
  attempted: boolean;
  pages: (number | null)[];
  primitives: ProjectedGeometryPrimitive[];
  dimensionTexts: ProjectedDimensionText[];
  dimensionLines: ProjectedDimensionLine[];
  dimensionAssociations: ProjectedDimensionAssociation[];
  scaleCandidates: ProjectedScaleCandidate[];
  legends: ProjectedLegendDefinition[];
  symbolCandidates: ProjectedSymbolCandidate[];
  symbolToLegend: ProjectedSymbolToLegend[];
  symbolToEquipment: ProjectedSymbolToEquipment[];
  conflicts: string[];
  limitations: string[];
  truncated: boolean;
};

export function emptyProjectedGeometry(): ProjectedArtifactGeometry {
  return {
    attempted: false,
    used: false,
    pages: [],
    pageSpaceOnly: true,
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

/**
 * Projects the infrastructure geometry result into the bounded governed view.
 *
 * Bounding happens here, at the boundary, so nothing downstream can see an
 * unbounded primitive list. `used` is derived structurally from the records
 * themselves rather than trusted from the caller, so the brief can never claim
 * geometry that is not actually present.
 */
export function projectDrawingGeometry(input: DrawingGeometryProjectionInput | null | undefined): ProjectedArtifactGeometry {
  if (!input) return emptyProjectedGeometry();
  const used = Boolean(input.primitives.length || input.dimensionTexts.length || input.scaleCandidates.length || input.symbolCandidates.length);
  return {
    attempted: input.attempted,
    used,
    pages: input.pages.slice(0, MAX_PROJECTED_PAGES),
    pageSpaceOnly: true,
    primitives: input.primitives.slice(0, MAX_PROJECTED_GEOMETRY_PRIMITIVES),
    dimensionTexts: input.dimensionTexts.slice(0, MAX_PROJECTED_DIMENSION_TEXTS),
    dimensionLines: input.dimensionLines.slice(0, MAX_PROJECTED_DIMENSION_LINES),
    dimensionAssociations: input.dimensionAssociations.slice(0, MAX_PROJECTED_DIMENSION_ASSOCIATIONS),
    scaleCandidates: input.scaleCandidates.slice(0, MAX_PROJECTED_SCALE_CANDIDATES),
    legends: input.legends.slice(0, MAX_PROJECTED_LEGENDS),
    symbolCandidates: input.symbolCandidates.slice(0, MAX_PROJECTED_SYMBOL_CANDIDATES),
    symbolToLegend: input.symbolToLegend.slice(0, MAX_PROJECTED_SYMBOL_RELATIONSHIPS),
    symbolToEquipment: input.symbolToEquipment.slice(0, MAX_PROJECTED_SYMBOL_RELATIONSHIPS),
    conflicts: input.conflicts.slice(0, MAX_PROJECTED_GEOMETRY_CONFLICTS),
    limitations: input.limitations.slice(0, MAX_PROJECTED_LIMITATIONS),
    truncated: input.truncated,
  };
}

export type ArtifactInspectionStatus =
  | "INSPECTED"
  | "INSPECTED_NO_MACHINE_READABLE_TEXT"
  | "NOT_INSPECTED"
  | "UNAVAILABLE"
  | "ENCRYPTED";

export type ProjectedObservation = {
  type: ObservationType;
  value: string;
  pageNumber: number | null;
  locator: string;
  reliability: ObservationReliability;
  status: "OBSERVED_NOT_APPROVED";
  /** Present with `textSource: "OCR"` for OCR-derived observations; absent for native readings. */
  origin?: ObservationOrigin;
  /** Present with `source: "VISION"` for visual observations; they never carry a text `origin`. */
  visualOrigin?: VisualOrigin;
};

/**
 * Phase 2A-2 OCR summary. `attempted` means OCR was requested for at least one
 * page; `used` means OCR-derived text was actually analyzed. `pages` holds the
 * proven numbers of pages that contributed OCR-derived text; null entries are
 * unattributed pages and are never replaced with an invented number.
 */
export type ProjectedOcr = {
  attempted: boolean;
  used: boolean;
  pages: (number | null)[];
  engines: string[];
  /** Phase 2A-2B: true when any used OCR reading has low confidence/reliability. */
  lowConfidence: boolean;
};

export type ProjectedClassification = {
  value: string;
  reliability: string;
  confidence: number;
  limitations: string[];
};

/**
 * Phase 2A-3 vision summary. `attempted` means a vision provider was invoked;
 * `used` means visual observations were actually analyzed. Provider ids stay
 * structured; the brief only ever says that visual inspection was used, in
 * plain words.
 */
export type ProjectedVision = {
  attempted: boolean;
  used: boolean;
  providers: string[];
  /** Phase 2A-3: true when any used visual observation has low reliability. */
  lowConfidence: boolean;
};

/**
 * Phase 2A-4 drawing-vision summary. `attempted` means drawing pages passed
 * the gate and the provider path ran; `used` means bounded drawing
 * observations were actually produced. `pages` names the qualified pages the
 * reading ran on (proven numbers only). It is separate from `vision` so a
 * reader can always tell a general image description from a drawing reading.
 */
export type ProjectedDrawing = {
  attempted: boolean;
  used: boolean;
  pages: (number | null)[];
  providers: string[];
  lowConfidence: boolean;
  /** Structured outcome of the pass; drives the truthful "did it run?" sentences. */
  outcome: DrawingVisionOutcome | null;
};

/** Structural input so the application layer never imports the infrastructure analyzer. */
export type ArtifactAnalysisInput = {
  inspection: PdfInspection | ImageInspection;
  /** Null for images: 2A-3 performs no image classification, only bounded visual observations. */
  classification: DocumentClassification | null;
  observations: ObservedFact[];
  limitations: string[];
  /** Phase 2A-3: explicit vision-attempt record; images always provide it, PDFs omit it. */
  vision?: { attempted: boolean; providerId: string | null };
  /**
   * Phase 2A-4: explicit drawing-vision attempt record. `pages` holds the
   * proven page numbers of pages the drawing reading was requested for
   * (null entries are unattributed pages or the standalone image; a number
   * is never invented). `outcome` is the structured reason the pass ended as
   * it did; the brief maps it to plain words and never prints it verbatim.
   */
  drawing?: { attempted: boolean; pages: (number | null)[]; outcome?: DrawingVisionOutcome };
  /**
   * Phase 2A-5: bounded drawing geometry evidence (page space, printed
   * dimensions, scale candidates, and symbol/legend relationships).
   */
  geometry?: DrawingGeometryProjectionInput;
};

export type DrawingVisionOutcome = "RAN" | "NO_QUALIFIED_PAGES" | "NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE";

export type ArtifactInspectionSummary = {
  artifactId: string;
  filename: string;
  /**
   * Phase 2A-6: XLSX workbooks are a third artifact kind with their own
   * evidence channel. Phase 2A-7: ASCII DXF drawings are a fourth, with CAD
   * locators instead of page numbers. Phase 2A-9: DWG and RVT proprietary
   * originals carry identity and guidance only — never semantic evidence.
   */
  kind: "PDF" | "IMAGE" | "XLSX" | "DXF" | "IFC" | "DWG" | "RVT";
  status: ArtifactInspectionStatus;
  pageCount: number | null;
  classification: ProjectedClassification | null;
  pageClassifications: Array<{ pageNumber: number | null; value: string }>;
  observations: ProjectedObservation[];
  /** Total observations found, which may exceed the bounded list above. */
  observationCount: number;
  candidates: ArtifactCandidateFact[];
  conflicts: ArtifactFactConflict[];
  limitations: string[];
  /** Bounded excerpt of extracted text, never the whole document. */
  excerpt: string | null;
  excerptTruncated: boolean;
  /** Always-present boundary statements so no consumer reads this as approval or understanding. */
  governance: string[];
  /** Phase 2A-2: whether OCR was attempted/used and which pages it read. */
  ocr: ProjectedOcr;
  /** Phase 2A-3: whether visual inspection was attempted/used. */
  vision: ProjectedVision;
  /** Phase 2A-4: whether drawing semantic vision was attempted/used and on which pages. */
  drawing: ProjectedDrawing;
  /** Phase 2A-5: bounded page-space geometry, dimension, scale, and symbol evidence. */
  geometry: ProjectedArtifactGeometry;
  /** Phase 2A-6: bounded workbook evidence. Empty for PDF and image artifacts. */
  spreadsheet: ProjectedSpreadsheet;
  /** Phase 2A-7: bounded CAD evidence. Empty for PDF, image, and workbook artifacts. */
  dxf: ProjectedDxf;
  /** Phase 2A-8: bounded BIM evidence. Empty for PDF, image, workbook, and DXF artifacts. */
  ifc: ProjectedIfc;
  /** Phase 2A-9: identity + guidance for a proprietary original. Empty for every other kind. */
  proprietaryOriginal: ProjectedProprietaryOriginal;
  /** Phase 2A-9: bounded lineage when this artifact was DERIVED from an original. Null otherwise. */
  derivationLineage: ProjectedDerivationLineage | null;
};

const GOVERNANCE_STATEMENTS = [
  "observed values are not approved, verified, or selected",
  "document classification is a document-handling hint, not engineering understanding",
  "no OCR, image interpretation, or geometry interpretation was performed",
];

/** Phase 2A-2: stated instead of GOVERNANCE_STATEMENTS when OCR-derived text was analyzed. */
const GOVERNANCE_STATEMENTS_OCR = [
  "observed values are not approved, verified, or selected",
  "document classification is a document-handling hint, not engineering understanding",
  "OCR text recovery was performed on scanned pages; image interpretation and geometry interpretation were not performed",
];

/** Phase 2A-3: stated when visual observations were analyzed. */
const GOVERNANCE_STATEMENTS_VISION = [
  "observed values are not approved, verified, or selected",
  "visual inspection produced bounded visual observations; they are not verified facts, and geometry interpretation was not performed",
  "no OCR text recovery was performed on this image",
];

/** Phase 2A-3: stated when both OCR-derived text and visual observations were analyzed. */
const GOVERNANCE_STATEMENTS_OCR_VISION = [
  "observed values are not approved, verified, or selected",
  "OCR text recovery and visual inspection were both performed; neither reading is verified fact, and geometry interpretation was not performed",
];

/** Phase 2A-4: stated when drawing-semantic observations were produced. */
const GOVERNANCE_STATEMENTS_DRAWING = [
  "observed values are not approved, verified, or selected",
  "drawing vision produced bounded semantic observations from rendered pages: no measurement, no symbol counting, no quantity takeoff, and no geometry interpretation was performed",
  "title-block names are observed text only; no supplier, company, or product selection was created from them",
];

/** Phase 2A-4: stated when OCR-derived text and drawing observations were both analyzed. */
const GOVERNANCE_STATEMENTS_OCR_DRAWING = [
  "observed values are not approved, verified, or selected",
  "OCR text recovery and drawing vision were both performed; the readings stay separate and neither one is verified fact",
  "no measurement, symbol counting, quantity takeoff, or geometry interpretation was performed; title-block names are observed text only",
];

/**
 * Phase 2A-5: stated when drawing geometry was actually read.
 *
 * It replaces the 2A-4 wording rather than sitting beside it, because the 2A-4
 * promise that "no geometry interpretation was performed" stops being true the
 * moment this pass runs. The replacement states exactly what the pass did and
 * did not do: it read page-space positions, and it did not measure, count,
 * take off, or build a BOM.
 */
const GOVERNANCE_STATEMENTS_GEOMETRY = [
  "observed values are not approved, verified, or selected",
  "drawing geometry is normalized page-space position evidence only: no real-world measurement was derived, and any printed scale was captured as a calibration candidate and never applied",
  "printed dimensions are the literal text printed on the sheet; symbol candidates are individual observations that were not counted, and no quantity takeoff or BOM was produced",
];

const GOVERNANCE_STATEMENT_TITLE_BLOCK_PARTIES =
  "title-block names are observed text only; no supplier, company, or product selection was created from them";

const GOVERNANCE_STATEMENT_OCR_SEPARATION =
  "OCR readings carry no word positions, so they contribute page-level dimension evidence only and are never used to associate a dimension with a line";

/** User-facing labels: the brief never prints raw enum tokens. */
const CLASSIFICATION_LABEL: Record<string, { ar: string; en: string }> = {
  TEXT_DOCUMENT: { en: "text document", ar: "مستند نصي" },
  BOQ_OR_SCHEDULE: { en: "BOQ / schedule", ar: "جدول كميات" },
  DRAWING: { en: "drawing sheet", ar: "لوحة رسم" },
  MIXED: { en: "mixed document", ar: "مستند مختلط" },
  SCANNED_OR_IMAGE_ONLY: { en: "scanned / image-only", ar: "ممسوح ضوئياً / صور فقط" },
  UNKNOWN: { en: "undetermined type", ar: "نوع غير محدد" },
};

const RELIABILITY_LABEL: Record<string, { ar: string; en: string }> = {
  HIGH: { en: "high", ar: "عالية" },
  MEDIUM: { en: "medium", ar: "متوسطة" },
  LOW: { en: "low", ar: "منخفضة" },
};

const OBSERVATION_LABEL: Record<string, { ar: string; en: string }> = {
  PROJECT_TITLE: { en: "project", ar: "المشروع" },
  DOCUMENT_TITLE: { en: "title", ar: "العنوان" },
  DRAWING_OR_SHEET_NUMBER: { en: "drawing/sheet no.", ar: "رقم اللوحة" },
  REVISION: { en: "revision", ar: "المراجعة" },
  DISCIPLINE: { en: "discipline", ar: "التخصص" },
  SECTION_OR_DIVISION: { en: "section", ar: "القسم" },
  EQUIPMENT_TAG: { en: "equipment tag", ar: "رقم المعدة" },
  MODEL_OR_REFERENCE: { en: "model/reference", ar: "الموديل/المرجع" },
  ITEM_NUMBER: { en: "item", ar: "رقم البند" },
  QUANTITY: { en: "quantity", ar: "الكمية" },
  UNIT: { en: "unit", ar: "الوحدة" },
  DESCRIPTION_OR_SPEC_TEXT: { en: "description", ar: "الوصف" },
  VISIBLE_OBJECT: { en: "visible object", ar: "جسم ظاهر" },
  VISIBLE_PRODUCT: { en: "visible product", ar: "منتج ظاهر" },
  VISIBLE_BRAND: { en: "visible brand", ar: "علامة ظاهرة" },
  VISIBLE_MODEL_REFERENCE: { en: "visible model marking", ar: "علامة موديل ظاهرة" },
  IMAGE_TYPE_HINT: { en: "image type", ar: "نوع الصورة" },
  VISIBLE_CONDITION: { en: "visible condition", ar: "الحالة الظاهرة" },
  VISUAL_CONTEXT: { en: "visual context", ar: "السياق البصري" },
  DRAWING_TITLE: { en: "drawing title", ar: "عنوان اللوحة" },
  DRAWING_NUMBER: { en: "drawing no.", ar: "رقم اللوحة" },
  SHEET_NUMBER: { en: "sheet no.", ar: "رقم الورقة" },
  PRINTED_SCALE: { en: "printed scale", ar: "المقياس المطبوع" },
  DRAWING_TYPE: { en: "drawing type hint", ar: "تلميح نوع الرسم" },
  PROJECT_NAME: { en: "project (title block)", ar: "المشروع (إطار العنوان)" },
  TITLE_BLOCK_PARTY: { en: "title-block text", ar: "نص إطار العنوان" },
  LEGEND_ENTRY: { en: "legend entry", ar: "مدخل المفتاح" },
  NOTE: { en: "note", ar: "ملاحظة" },
  EQUIPMENT_REFERENCE: { en: "equipment reference", ar: "مرجع معدة" },
  ROOM_OR_ZONE: { en: "room/zone", ar: "غرفة/منطقة" },
  DETAIL_REFERENCE: { en: "detail ref.", ar: "مرجع تفصيلي" },
  SECTION_REFERENCE: { en: "section ref.", ar: "مرجع مقطع" },
  ELEVATION_REFERENCE: { en: "elevation ref.", ar: "مرجع واجهة" },
  SYMBOL_CANDIDATE: { en: "symbol candidate", ar: "مرشح رمز" },
};

function label(map: Record<string, { ar: string; en: string }>, value: string, locale: "ar" | "en") {
  return map[value]?.[locale] ?? value;
}

const STATUS_LABEL: Record<ArtifactInspectionStatus, { ar: string; en: string }> = {
  INSPECTED: { ar: "تم فحص الملف", en: "inspected" },
  INSPECTED_NO_MACHINE_READABLE_TEXT: { ar: "تم فحص بنية الملف بدون نص مقروء آلياً", en: "inspected with no machine-readable text" },
  NOT_INSPECTED: { ar: "لم يتم فحص المحتوى", en: "not inspected" },
  UNAVAILABLE: { ar: "الفحص غير متاح", en: "unavailable" },
  ENCRYPTED: { ar: "الملف مشفر ولم يُقرأ", en: "encrypted and not read" },
};

/**
 * Projects an inspection result into the bounded, governed view. Pass `analysis: null`
 * for an artifact that was uploaded or stored but never inspected: the result
 * says so instead of implying content was read.
 */
export function projectArtifactInspection(input: {
  artifactId: string;
  filename: string;
  kind: "PDF" | "IMAGE";
  analysis: ArtifactAnalysisInput | null;
  status?: ArtifactInspectionStatus;
  failure?: string | null;
  governedFacts?: GovernedFactRef[];
  existingCandidates?: ArtifactCandidateFact[];
}): ArtifactInspectionSummary {
  const analysis = input.analysis;
  const status: ArtifactInspectionStatus = input.status
    ?? (!analysis ? "NOT_INSPECTED" : analysis.inspection.document.encrypted ? "ENCRYPTED" : analysis.inspection.text.trim() ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT");

  if (!analysis) {
    return {
      artifactId: input.artifactId,
      filename: input.filename,
      kind: input.kind,
      status,
      pageCount: null,
      classification: null,
      pageClassifications: [],
      observations: [],
      observationCount: 0,
      candidates: [],
      conflicts: [],
      limitations: [input.failure ?? "the artifact was stored but its content was not inspected"],
      excerpt: null,
      excerptTruncated: false,
      governance: [...GOVERNANCE_STATEMENTS],
      ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
      vision: { attempted: false, used: false, providers: [], lowConfidence: false },
      drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
      geometry: emptyProjectedGeometry(),
      spreadsheet: emptyProjectedSpreadsheet(),
      dxf: emptyProjectedDxf(),
      ifc: emptyProjectedIfc(),
      proprietaryOriginal: emptyProjectedProprietaryOriginal(),
      derivationLineage: null,
    };
  }

  const { inspection, classification, observations, limitations } = analysis;
  const proposed = proposeArtifactCandidates({
    artifactId: input.artifactId,
    observations,
    governedFacts: input.governedFacts,
    existing: input.existingCandidates,
  });
  // Phase 2A-2: OCR usage is detected from page provenance, so the projection
  // stays truthful without any new input channel. Engine ids stay structured;
  // the brief only ever says that OCR was used, in plain words.
  const ocrPages = inspection.pages.filter((page) =>
    page.ocr?.requested && typeof page.ocrText === "string" && page.ocrText.trim().length > 0
    && (page.textSource === "OCR" || page.textSource === "NATIVE_AND_OCR"),
  );
  const ocr: ProjectedOcr = {
    attempted: inspection.pages.some((page) => page.ocr?.requested === true),
    used: ocrPages.length > 0,
    pages: ocrPages.map((page) => page.pageNumber ?? null),
    engines: [...new Set(ocrPages.map((page) => page.ocr?.engineId ?? "unknown"))],
    lowConfidence: ocrPages.some((page) => page.ocr?.status === "LOW_CONFIDENCE" || page.ocr?.reliability === "LOW"),
  };
  // Phase 2A-3: vision usage is detected from observation provenance, with the
  // explicit attempt record supplied by the image analyzer. Provider ids stay
  // structured; the brief only ever says that visual inspection was used, in
  // plain words.
  const visual = observations.filter((observation) => observation.visualOrigin);
  const vision: ProjectedVision = {
    attempted: analysis.vision?.attempted ?? visual.length > 0,
    used: visual.length > 0,
    providers: [...new Set(visual.map((observation) => observation.visualOrigin?.providerId ?? "unknown"))],
    lowConfidence: visual.some((observation) => observation.reliability === "LOW"),
  };
  // Phase 2A-4: drawing-semantic observations are projected under their own
  // record so a drawing reading is never conflated with a general image
  // description. The attempt record comes from the analyzer; the used flag is
  // derived structurally from the observations themselves.
  const drawingVisual = visual.filter((observation) => isDrawingObservationType(observation.type));
  const drawing: ProjectedDrawing = {
    attempted: analysis.drawing?.attempted === true || drawingVisual.length > 0,
    used: drawingVisual.length > 0,
    pages: analysis.drawing?.pages ?? [...new Set(drawingVisual.map((observation) => observation.pageNumber))],
    providers: [...new Set(drawingVisual.map((observation) => observation.visualOrigin?.providerId ?? "unknown"))],
    lowConfidence: drawingVisual.some((observation) => observation.reliability === "LOW"),
    outcome: analysis.drawing?.outcome ?? (drawingVisual.length > 0 ? "RAN" : null),
  };
  const text = inspection.text.trim();
  const geometry = projectDrawingGeometry(analysis.geometry);
  // Phase 2A-5: the 2A-4 promise that no geometry interpretation was performed
  // stops being true once this pass runs, so the geometry set replaces it and
  // restates the measurement, counting, and takeoff boundaries accurately.
  const governance: string[] = geometry.used
    ? [
      ...GOVERNANCE_STATEMENTS_GEOMETRY,
      ...(drawing.used ? [GOVERNANCE_STATEMENT_TITLE_BLOCK_PARTIES] : []),
      ...(ocr.used ? [GOVERNANCE_STATEMENT_OCR_SEPARATION] : []),
    ]
    : drawing.used && ocr.used
      ? [...GOVERNANCE_STATEMENTS_OCR_DRAWING]
      : drawing.used
        ? [...GOVERNANCE_STATEMENTS_DRAWING]
        : ocr.used && vision.used
          ? [...GOVERNANCE_STATEMENTS_OCR_VISION]
          : ocr.used
            ? [...GOVERNANCE_STATEMENTS_OCR]
            : vision.used
              ? [...GOVERNANCE_STATEMENTS_VISION]
              : [...GOVERNANCE_STATEMENTS];
  // A drawing-project-name observation never maps to a governed fact key, so it
  // cannot be promoted. It can still DISAGREE with governed state; the conflict
  // is recorded here with both chains so a reviewer sees it, and the governed
  // value stays untouched. No automatic resolution, ever.
  let conflicts = proposed.conflicts;
  const projectFromDrawing = drawingVisual.find((observation) => observation.type === "PROJECT_NAME");
  if (projectFromDrawing) {
    const governedProject = (input.governedFacts ?? []).find((fact) => fact.key === "project.name");
    if (governedProject && String(governedProject.value) !== projectFromDrawing.value
      && !conflicts.some((item) => item.key === "project.name" && item.observedValue === projectFromDrawing.value)) {
      conflicts = [...conflicts, {
        key: "project.name",
        governedValue: String(governedProject.value),
        governedProvenance: governedProject.provenance,
        observedValue: projectFromDrawing.value,
        candidateId: `${input.artifactId}:drawing-project-name`,
      }];
    }
  }
  return {
    artifactId: input.artifactId,
    filename: input.filename,
    kind: input.kind,
    status,
    pageCount: inspection.document.pageCount,
    classification: classification
      ? {
        value: classification.value,
        reliability: classification.reliability,
        confidence: classification.confidence,
        limitations: classification.limitations.slice(0, MAX_PROJECTED_LIMITATIONS),
      }
      : null,
    pageClassifications: (classification?.pages ?? []).slice(0, MAX_PROJECTED_PAGES).map((page) => ({ pageNumber: page.pageNumber, value: page.value })),
    observations: observations.slice(0, MAX_PROJECTED_OBSERVATIONS).map((observation) => ({
      type: observation.type,
      value: observation.value,
      pageNumber: observation.pageNumber,
      locator: observation.evidence.locator,
      reliability: observation.reliability,
      status: observation.status,
      ...(observation.origin ? { origin: observation.origin } : {}),
      ...(observation.visualOrigin ? { visualOrigin: observation.visualOrigin } : {}),
    })),
    observationCount: observations.length,
    candidates: proposed.candidates.slice(0, MAX_PROJECTED_CANDIDATES),
    conflicts,
    limitations: [...new Set([...limitations, ...(input.failure ? [input.failure] : [])])].slice(0, MAX_PROJECTED_LIMITATIONS),
    excerpt: text ? text.slice(0, MAX_EXCERPT_CHARACTERS) : null,
    excerptTruncated: text.length > MAX_EXCERPT_CHARACTERS,
    governance: [...governance],
    ocr,
    vision,
    drawing,
    geometry,
    spreadsheet: emptyProjectedSpreadsheet(),
    dxf: emptyProjectedDxf(),
    ifc: emptyProjectedIfc(),
    proprietaryOriginal: emptyProjectedProprietaryOriginal(),
    derivationLineage: null,
  };
}

/**
 * Phase 2A-6: projects an inspected XLSX workbook into the bounded governed
 * view the assistant and the runtime consume.
 *
 * A workbook has no pages and no extracted narrative text, so the page-shaped
 * fields stay empty rather than being filled with stand-ins: `pageCount` is
 * null and every citation carries a sheet and range locator instead of a page
 * number. The workbook channel states its own governance, because the generic
 * document promise ("no calculation was performed") is not the promise a
 * spreadsheet reading makes: it preserved formulas and never evaluated them,
 * and it kept units and currency exactly as the workbook wrote them.
 */
export function projectSpreadsheetInspection(input: {
  artifactId: string;
  filename: string;
  analysis: SpreadsheetAnalysis | null;
  status?: ArtifactInspectionStatus;
  failure?: string | null;
}): ArtifactInspectionSummary {
  const spreadsheet = projectSpreadsheetAnalysis(input.analysis);
  const status: ArtifactInspectionStatus = input.status ?? (input.analysis ? "INSPECTED" : "NOT_INSPECTED");
  const limitations = [...new Set([...spreadsheet.limitations, ...(input.failure ? [input.failure] : [])])].slice(0, MAX_PROJECTED_LIMITATIONS);
  return {
    artifactId: input.artifactId,
    filename: input.filename,
    kind: "XLSX",
    status,
    pageCount: null,
    classification: null,
    pageClassifications: [],
    observations: [],
    observationCount: 0,
    candidates: [],
    conflicts: [],
    limitations,
    excerpt: null,
    excerptTruncated: false,
    governance: [...GOVERNANCE_STATEMENTS_SPREADSHEET],
    ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
    vision: { attempted: false, used: false, providers: [], lowConfidence: false },
    drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
    geometry: emptyProjectedGeometry(),
    spreadsheet: { ...spreadsheet, limitations },
    dxf: emptyProjectedDxf(),
    ifc: emptyProjectedIfc(),
    proprietaryOriginal: emptyProjectedProprietaryOriginal(),
    derivationLineage: null,
  };
}

/**
 * Phase 2A-7: projects an inspected ASCII DXF drawing into the bounded governed
 * view the assistant and the runtime consume.
 *
 * A drawing has no pages and no extracted narrative text, so the page-shaped
 * fields stay empty rather than being filled with stand-ins: `pageCount` is
 * null and every citation carries a CAD locator — section, handle, layer,
 * block, layout, and space — instead of a page number. The CAD channel states
 * its own governance, because the generic document promise is not the promise a
 * drawing reading makes: it preserved coordinates and declared units exactly,
 * measured nothing, recalculated no dimension, and counted no equipment.
 */
export function projectDxfInspection(input: {
  artifactId: string;
  filename: string;
  analysis: DxfAnalysis | null;
  status?: ArtifactInspectionStatus;
  failure?: string | null;
}): ArtifactInspectionSummary {
  const dxf = projectDxfAnalysis(input.analysis);
  const status: ArtifactInspectionStatus = input.status ?? (input.analysis ? "INSPECTED" : "NOT_INSPECTED");
  const limitations = [...new Set([...dxf.limitations, ...(input.failure ? [input.failure] : [])])].slice(0, MAX_PROJECTED_LIMITATIONS);
  return {
    artifactId: input.artifactId,
    filename: input.filename,
    kind: "DXF",
    status,
    pageCount: null,
    classification: null,
    pageClassifications: [],
    observations: [],
    observationCount: 0,
    candidates: [],
    conflicts: [],
    limitations,
    excerpt: null,
    excerptTruncated: false,
    governance: [...GOVERNANCE_STATEMENTS_DXF],
    ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
    vision: { attempted: false, used: false, providers: [], lowConfidence: false },
    drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
    geometry: emptyProjectedGeometry(),
    spreadsheet: emptyProjectedSpreadsheet(),
    dxf: { ...dxf, limitations },
    ifc: emptyProjectedIfc(),
    proprietaryOriginal: emptyProjectedProprietaryOriginal(),
    derivationLineage: null,
  };
}

/**
 * Phase 2A-8: projects an inspected IFC model into the bounded governed view
 * the assistant and the runtime consume.
 *
 * A model has no pages, so `pageCount` is null and every citation carries a
 * STEP locator instead of a page number. The BIM channel states its own
 * governance: it preserved declared quantities and never calculated geometry,
 * never inferred units, and never counted equipment.
 */
export function projectIfcInspection(input: {
  artifactId: string;
  filename: string;
  analysis: IfcAnalysis | null;
  status?: ArtifactInspectionStatus;
  failure?: string | null;
}): ArtifactInspectionSummary {
  const ifc = projectIfcAnalysis(input.analysis);
  const status: ArtifactInspectionStatus = input.status ?? (input.analysis ? "INSPECTED" : "NOT_INSPECTED");
  const limitations = [...new Set([...ifc.limitations, ...(input.failure ? [input.failure] : [])])].slice(0, MAX_PROJECTED_LIMITATIONS);
  return {
    artifactId: input.artifactId,
    filename: input.filename,
    kind: "IFC",
    status,
    pageCount: null,
    classification: null,
    pageClassifications: [],
    observations: [],
    observationCount: 0,
    candidates: [],
    conflicts: [],
    limitations,
    excerpt: null,
    excerptTruncated: false,
    governance: [...GOVERNANCE_STATEMENTS_IFC],
    ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
    vision: { attempted: false, used: false, providers: [], lowConfidence: false },
    drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
    geometry: emptyProjectedGeometry(),
    spreadsheet: emptyProjectedSpreadsheet(),
    dxf: emptyProjectedDxf(),
    ifc: { ...ifc, limitations },
    proprietaryOriginal: emptyProjectedProprietaryOriginal(),
    derivationLineage: null,
  };
}

/**
 * Phase 2A-2: plain-words OCR sentence for the brief. It names the pages that
 * were read with OCR (proven numbers only; unattributed pages are said
 * plainly) and never prints engine ids or status tokens.
 */
function ocrUsedSentence(pages: (number | null)[], locale: "ar" | "en"): string {
  const proven = pages.filter((page): page is number => typeof page === "number");
  const unattributed = pages.length - proven.length;
  if (locale === "ar") {
    if (proven.length === 1 && unattributed === 0) {
      return `تمت قراءة الصفحة ${proven[0]} باستخدام التعرف الضوئي على الحروف (OCR). تم استخراج النص من صفحة ممسوحة ضوئياً وقد يحتاج إلى مراجعة.`;
    }
    if (proven.length > 1 && unattributed === 0) {
      return `تمت قراءة الصفحات ${proven.join("، ")} باستخدام التعرف الضوئي على الحروف (OCR). تم استخراج النص من صفحات ممسوحة ضوئياً وقد يحتاج إلى مراجعة.`;
    }
    if (proven.length === 0) {
      return `تمت قراءة صفحة غير منسوبة باستخدام التعرف الضوئي على الحروف (OCR). تم استخراج النص من صفحة ممسوحة ضوئياً وقد يحتاج إلى مراجعة.`;
    }
    return `تمت قراءة الصفحات ${proven.join("، ")} وصفحة غير منسوبة باستخدام التعرف الضوئي على الحروف (OCR). تم استخراج النص من صفحات ممسوحة ضوئياً وقد يحتاج إلى مراجعة.`;
  }
  if (proven.length === 1 && unattributed === 0) {
    return `Page ${proven[0]} was read using OCR. The text was extracted from a scanned page and may require review.`;
  }
  if (proven.length > 1 && unattributed === 0) {
    return `Pages ${proven.join(", ")} were read using OCR. The text was extracted from scanned pages and may require review.`;
  }
  if (proven.length === 0) {
    return `An unattributed page was read using OCR. The text was extracted from a scanned page and may require review.`;
  }
  return `Pages ${proven.join(", ")} and an unattributed page were read using OCR. The text was extracted from scanned pages and may require review.`;
}

/**
 * Phase 2A-4: plain-words disclosure of the drawing reading. Proven page
 * numbers only; the standalone-image wording says "drawing image", and an
 * unproven page is named plainly instead of receiving an invented number.
 */
function drawingInspectionSentence(summary: ArtifactInspectionSummary, ar: boolean): string {
  const proven = summary.drawing.pages.filter((page): page is number => typeof page === "number");
  const unattributed = summary.drawing.pages.some((page) => page === null);
  let pagesLabel: string;
  if (summary.kind === "IMAGE") pagesLabel = ar ? "صورة الرسم" : "the drawing image";
  else if (proven.length === 1 && !unattributed) pagesLabel = ar ? `صفحة الرسم ${proven[0]}` : `drawing page ${proven[0]}`;
  else if (proven.length > 1 && !unattributed) pagesLabel = ar ? `صفحات الرسم ${proven.join("، ")}` : `drawing pages ${proven.join(", ")}`;
  else if (proven.length === 1) pagesLabel = ar ? `صفحة الرسم ${proven[0]} وصفحة غير منسوبة` : `drawing page ${proven[0]} and an unattributed page`;
  else if (proven.length > 1) pagesLabel = ar ? `صفحات الرسم ${proven.join("، ")} وصفحة غير منسوبة` : `drawing pages ${proven.join(", ")} and an unattributed page`;
  else pagesLabel = ar ? "صفحة رسم غير منسوبة" : "an unattributed drawing page";
  return ar
    ? `فحصت ${pagesLabel} بصرياً لاستخلاص دلالات الرسم. ما يلي ملاحظات رسم محدودة، وليست قياسات ولا حصراً للكميات.`
    : `I inspected ${pagesLabel} visually for drawing semantics. The following are bounded drawing observations, not measurements and not a quantity takeoff.`;
}

/**
 * Renders the concise, truthful brief the assistant may say out loud.
 * It never claims approval, selection, or completeness, and it states plainly
 * when the content could not be read.
 */
export function renderInspectionBrief(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
  // Phase 2A-6: a workbook has its own evidence channel and its own vocabulary.
  // Routing it through the page-based brief would either invent page numbers or
  // describe cells in a language built for scanned pages, so it is rendered
  // separately for both languages.
  if (summary.kind === "XLSX") return renderSpreadsheetBrief(summary, locale);
  // Phase 2A-7: a drawing has its own evidence channel and its own vocabulary.
  // Routing it through the page-based brief would either invent page numbers or
  // describe CAD entities in a language built for scanned pages, so it is
  // rendered separately for both languages.
  if (summary.kind === "DXF") return renderDxfBrief(summary, locale);
  if (summary.kind === "IFC") return renderIfcBrief(summary, locale);
  // Phase 2A-9: a proprietary original was stored but never parsed. Its brief
  // is truthful bounded guidance, never a claim of inspection.
  if (summary.kind === "DWG" || summary.kind === "RVT") return renderProprietaryOriginalGuidance(summary, locale);
  const ar = locale === "ar";
  const status = STATUS_LABEL[summary.status][locale];
  if (summary.status === "NOT_INSPECTED" || summary.status === "UNAVAILABLE") {
    return ar
      ? `استلمت الملف "${summary.filename}"، لكن محتواه لم يُفحص بعد؛ لن أصف ما بداخله.`
      : `I received "${summary.filename}", but its content has not been inspected yet, so I will not describe what it contains.`;
  }
  if (summary.status === "ENCRYPTED") {
    return ar
      ? `الملف "${summary.filename}" مشفر ولم أتمكن من قراءة محتواه.`
      : `"${summary.filename}" is encrypted, so its content could not be read.`;
  }
  if (summary.status === "INSPECTED_NO_MACHINE_READABLE_TEXT") {
    // Phase 2A-3: images have no page structure to read; the brief says
    // plainly whether visual inspection ran or was unavailable.
    if (summary.kind === "IMAGE") {
      if (summary.vision.attempted) {
        return ar
          ? `نظرت إلى الصورة "${summary.filename}" لكن لم أتمكن من إنتاج ملاحظات بصرية قابلة للاستخدام.`
          : `I looked at the image "${summary.filename}" but could not produce usable visual observations.`;
      }
      return ar
        ? `استلمت الصورة "${summary.filename}"، لكن الفحص البصري غير متاح، لذلك لا أستطيع وصف ما يظهر فيها.`
        : `I received the image "${summary.filename}", but visual inspection is not available, so I cannot describe what it shows.`;
    }
    const pages = summary.pageCount == null ? "" : ar ? ` (${summary.pageCount} صفحة)` : ` (${summary.pageCount} page(s))`;
    // Phase 2A-2: when OCR was attempted but recovered nothing, the brief says
    // so truthfully instead of claiming OCR was never tried.
    if (summary.ocr.attempted) {
      return ar
        ? `قرأت بنية الملف "${summary.filename}"${pages} ولم أجد نصاً مقروءاً آلياً؛ حاولت أيضاً قراءة الصفحات الممسوحة باستخدام التعرف الضوئي (OCR) لكن لم أتمكن من استخراج نص قابل للاستخدام.`
        : `I read the structure of "${summary.filename}"${pages} and found no machine-readable text. I also tried reading the scanned pages with OCR but could not recover usable text.`;
    }
    return ar
      ? `قرأت بنية الملف "${summary.filename}"${pages} ولم أجد نصاً مقروءاً آلياً؛ فهم الصور والـ OCR غير متاح، لذلك لا أستطيع قراءة المحتوى.`
      : `I read the structure of "${summary.filename}"${pages} and found no machine-readable text. OCR and image understanding are not available, so I cannot read its content.`;
  }

  const parts: string[] = [];
  const pages = summary.pageCount == null ? "" : ar ? `، ${summary.pageCount} صفحة` : `, ${summary.pageCount} page(s)`;
  parts.push(ar ? `قرأت الملف "${summary.filename}"${pages} (${status}).` : `I read "${summary.filename}"${pages} (${status}).`);
  if (summary.classification) {
    const classLabel = label(CLASSIFICATION_LABEL, summary.classification.value, locale);
    const reliabilityLabel = label(RELIABILITY_LABEL, summary.classification.reliability, locale);
    parts.push(ar
      ? `التصنيف: ${classLabel} (موثوقية ${reliabilityLabel}، وهو تصنيف مستندي لا يعني فهماً هندسياً).`
      : `Classification: ${classLabel} (reliability ${reliabilityLabel}); this is a document-handling hint, not engineering understanding.`);
  }
  // Phase 2A-2: the brief always discloses OCR-derived readings in plain words.
  if (summary.ocr.used) {
    parts.push(ocrUsedSentence(summary.ocr.pages, locale));
  }
  // Phase 2A-2B: low-confidence OCR is surfaced as an explicit review limitation.
  if (summary.ocr.used && summary.ocr.lowConfidence) {
    parts.push(ar
      ? `بعض نتائج التعرف الضوئي منخفضة الثقة؛ تحقق من الصياغة مقابل الصفحات الأصلية.`
      : `Some OCR results have low confidence; verify the wording against the original pages.`);
  }
  // Phase 2A-3: visual inspection is always disclosed in plain words, and
  // low-confidence visual output is surfaced as an explicit review limitation.
  // Phase 2A-4: the general image wording fires only for general image
  // observations; drawing readings get their own wording below so the two
  // channels are never conflated.
  const generalVisualCount = summary.observations.filter((observation) => observation.visualOrigin && !isDrawingObservationType(observation.type)).length;
  if (summary.vision.used && generalVisualCount > 0) {
    parts.push(ar
      ? `فحصت الصورة بصرياً. ما يلي ملاحظات بصرية وليست حقائق مؤكدة.`
      : `I inspected the image visually. The following are visual observations, not verified facts.`);
  }
  if (summary.vision.used && generalVisualCount > 0 && summary.vision.lowConfidence) {
    parts.push(ar
      ? `بعض الملاحظات البصرية منخفضة الثقة؛ تحقق منها مقابل الصورة نفسها.`
      : `Some visual observations have low confidence; verify them against the image itself.`);
  }
  // Phase 2A-4: the brief says plainly whether drawing vision ran, what it
  // read, and what it did NOT do. A low-confidence reading and a run without
  // usable output are both disclosed; nothing here ever implies measurement
  // or takeoff.
  if (summary.drawing.used) {
    parts.push(drawingInspectionSentence(summary, ar));
    if (summary.drawing.lowConfidence) {
      parts.push(ar
        ? `بعض ملاحظات الرسم منخفضة الثقة؛ تحقق منها مقابل اللوحة نفسها.`
        : `Some drawing observations are low confidence; verify them against the sheet itself.`);
    }
  } else {
    // Why the drawing reading did not produce observations, in plain words.
    // The structured outcome token is never printed itself.
    if (summary.drawing.outcome === "NO_QUALIFIED_PAGES") {
      parts.push(ar
        ? `لم تحمل أي صفحة دلائل رسم موثوقة، لذلك لم يعمل الفحص البصري للرسوم؛ تحتاج الصفحات إلى مراجعة.`
        : `No page carried credible drawing evidence, so drawing vision was not run; the pages need review.`);
    } else if (summary.drawing.outcome === "NOT_CONFIGURED") {
      parts.push(ar
        ? `الفحص البصري للرسوم غير مُهيّأ في هذه البيئة، لذلك لم تُقرأ صفحات الرسم المؤهلة بصرياً.`
        : `Drawing vision is not configured in this runtime, so qualified drawing pages were not read visually.`);
    } else if (summary.drawing.outcome === "PROVIDER_UNAVAILABLE") {
      parts.push(ar
        ? `مزوّد الفحص البصري للرسوم غير متاح، لذلك لم تُقرأ صفحات الرسم المؤهلة بصرياً.`
        : `The drawing vision provider is unavailable, so qualified drawing pages were not read visually.`);
    } else if (summary.drawing.attempted) {
      parts.push(ar
        ? `جُرِبت قراءة الرسم بصرياً للصفحات المؤهلة لكنها لم تُنتج ملاحظات رسم قابلة للاستخدام.`
        : `The drawing reading was attempted on the qualified pages but produced no usable drawing observations.`);
    }
  }
/**
 * Phase 2A-5: plain-words page label for a geometry record. An unproven page
 * is named plainly instead of being given an invented number.
 */
function geometryPageLabel(pageNumber: number | null, ar: boolean): string {
  if (pageNumber === null) return ar ? "صفحة غير منسوبة" : "an unattributed page";
  return ar ? `الصفحة ${pageNumber}` : `page ${pageNumber}`;
}

/**
 * Phase 2A-5: the printed-dimension sentence. It quotes the literal characters
 * printed on the sheet and says plainly that nothing was converted, whether or
 * not the reading could be associated with a dimension line.
 */
function geometryDimensionSentence(geometry: ProjectedArtifactGeometry, ar: boolean): string | null {
  const association = geometry.dimensionAssociations[0];
  const record = association
    ? geometry.dimensionTexts.find((item) => item.id === association.dimensionTextId)
    : geometry.dimensionTexts[0];
  if (!record) return null;
  const where = geometryPageLabel(record.pageNumber, ar);
  if (ar) {
    return association
      ? `أستطيع قراءة بُعد مطبوع قيمته ${record.raw} بالقرب من مرشح خط أبعاد في ${where}. لم أحوّله إلى قياس حقيقي.`
      : `أستطيع قراءة بُعد مطبوع قيمته ${record.raw} في ${where}. لم أحوّله إلى قياس حقيقي.`;
  }
  return association
    ? `I can read a printed dimension of ${record.raw} near a dimension-line candidate on ${where}. I have not converted it into a real-world measurement.`
    : `I can read a printed dimension of ${record.raw} on ${where}. I have not converted it into a real-world measurement.`;
}

/** Phase 2A-5: the printed-scale sentence. A captured scale is never applied. */
function geometryScaleSentence(geometry: ProjectedArtifactGeometry, ar: boolean): string | null {
  const scale = geometry.scaleCandidates[0];
  if (!scale) return null;
  return ar
    ? `اللوحة تطبع مقياساً قدره ${scale.printed}. سجلته كمرشح معايرة فقط، ولم أستخدمه لقياس أي مسافة.`
    : `The sheet prints a scale of ${scale.printed}. I recorded it as a calibration candidate only, and I did not use it to measure any distance.`;
}

/**
 * Phase 2A-5: the symbol sentence. It names the legend entry the candidate is
 * consistent with and states plainly that nothing was counted.
 */
function geometrySymbolSentence(geometry: ProjectedArtifactGeometry, ar: boolean): string | null {
  const match = geometry.symbolToLegend[0];
  if (!match) return null;
  const legend = geometry.legends.find((item) => item.id === match.legendId);
  if (!legend) return null;
  return ar
    ? `وجدت مرشح رمز يبدو متوافقاً مع مدخل المفتاح «${legend.label}». لم أعدّ حالات الرمز.`
    : `I found a symbol candidate that appears consistent with the legend entry '${legend.label}'. I have not counted symbol instances.`;
}

/** Phase 2A-5: true when any retained geometry reading is low reliability. */
function geometryHasLowConfidence(geometry: ProjectedArtifactGeometry): boolean {
  return [
    ...geometry.primitives.map((item) => item.reliability),
    ...geometry.dimensionTexts.map((item) => item.reliability),
    ...geometry.dimensionAssociations.map((item) => item.reliability),
    ...geometry.scaleCandidates.map((item) => item.reliability),
    ...geometry.symbolCandidates.map((item) => item.reliability),
    ...geometry.symbolToLegend.map((item) => item.reliability),
  ].includes("LOW");
}

const GEOMETRY_PAGE_SPACE_SENTENCE = {
  en: "The geometry I read is page-space position only, from 0 to 1 across the sheet as displayed; it is not a measurement in millimetres, metres, or any other unit.",
  ar: "الهندسة التي قرأتها هي مواضع داخل مساحة الصفحة فقط، من 0 إلى 1 على اللوحة كما تُعرض؛ وليست قياساً بالمليمتر أو المتر أو أي وحدة أخرى.",
} as const;

const GEOMETRY_NO_TAKEOFF_SENTENCE = {
  en: "No symbol was counted and no quantity takeoff or bill of materials was produced from this geometry.",
  ar: "لم يُعَدّ أي رمز، ولم يُنتَج أي حصر كميات أو جدول مواد من هذه الهندسة.",
} as const;

const GEOMETRY_CONFLICT_SENTENCE = {
  en: "Some of these readings disagree with each other; every reading was kept for review and none was preferred.",
  ar: "بعض هذه القراءات تختلف عن بعضها؛ احتفظت بكل قراءة للمراجعة ولم أفضّل أياً منها.",
} as const;

const GEOMETRY_LOW_CONFIDENCE_SENTENCE = {
  en: "Some geometry, dimension, or symbol readings are low confidence; verify them against the sheet itself.",
  ar: "بعض قراءات الهندسة أو الأبعاد أو الرموز منخفضة الثقة؛ تحقق منها مقابل اللوحة نفسها.",
} as const;

  // Phase 2A-5: drawing geometry is disclosed in plain words, with the
  // page-space, no-measurement, no-counting, and no-takeoff boundaries stated
  // explicitly. Nothing here ever prints a raw type, channel, or status token.
  if (summary.geometry.used) {
    const dimensionSentence = geometryDimensionSentence(summary.geometry, ar);
    if (dimensionSentence) parts.push(dimensionSentence);
    const scaleSentence = geometryScaleSentence(summary.geometry, ar);
    if (scaleSentence) parts.push(scaleSentence);
    const symbolSentence = geometrySymbolSentence(summary.geometry, ar);
    if (symbolSentence) parts.push(symbolSentence);
    parts.push(GEOMETRY_PAGE_SPACE_SENTENCE[locale]);
    parts.push(GEOMETRY_NO_TAKEOFF_SENTENCE[locale]);
    if (summary.geometry.conflicts.length) parts.push(GEOMETRY_CONFLICT_SENTENCE[locale]);
    if (geometryHasLowConfidence(summary.geometry)) parts.push(GEOMETRY_LOW_CONFIDENCE_SENTENCE[locale]);
  }
  // Text and visual observations are listed under separate headings so the
  // two readings are never confused.
  const textObservations = summary.observations.filter((observation) => !observation.visualOrigin);
  const visualObservations = summary.observations.filter((observation) => observation.visualOrigin && !isDrawingObservationType(observation.type));
  const drawingObservations = summary.observations.filter((observation) => observation.visualOrigin && isDrawingObservationType(observation.type));
  if (textObservations.length) {
    const listed = textObservations.slice(0, 6).map((observation) => {
      const page = observation.pageNumber == null ? (ar ? "صفحة غير منسوبة" : "unattributed page") : (ar ? `ص ${observation.pageNumber}` : `p${observation.pageNumber}`);
      return `${label(OBSERVATION_LABEL, observation.type, locale)}: ${observation.value} (${page})`;
    });
    const more = summary.observationCount > summary.observations.length ? (ar ? ` + المزيد` : " + more") : "";
    parts.push(ar ? `ما رُصد نصياً: ${listed.join("؛ ")}${more}.` : `Observed in text: ${listed.join("; ")}${more}.`);
  }
  if (visualObservations.length) {
    const listed = visualObservations.slice(0, 6).map((observation) =>
      `${label(OBSERVATION_LABEL, observation.type, locale)}: ${observation.value} (${observation.locator})`);
    const more = summary.observationCount > summary.observations.length ? (ar ? ` + المزيد` : " + more") : "";
    parts.push(ar ? `ما رُصد بصرياً: ${listed.join("؛ ")}${more}.` : `Observed visually: ${listed.join("; ")}${more}.`);
  }
  if (drawingObservations.length) {
    const listed = drawingObservations.slice(0, 6).map((observation) => {
      const page = observation.pageNumber == null ? (ar ? "صفحة غير منسوبة" : "unattributed page") : (ar ? `ص ${observation.pageNumber}` : `p${observation.pageNumber}`);
      return `${label(OBSERVATION_LABEL, observation.type, locale)}: ${observation.value} (${page})`;
    });
    const more = summary.observationCount > summary.observations.length ? (ar ? ` + المزيد` : " + more") : "";
    parts.push(ar ? `ما رُصد في الرسومات: ${listed.join("؛ ")}${more}.` : `Observed on drawings: ${listed.join("; ")}${more}.`);
    parts.push(ar
      ? `مراجع المعدات ومداخل المفتاح والمرشحين الرمزية مرصودة فقط؛ لم يُعَدّ أي رمز ولم يُنتَج حصر كميات أو جدول مواد.`
      : `Equipment references, legend entries, and symbol candidates are observations only: no symbol was counted and no quantity takeoff or BOM was produced.`);
  }
  if (summary.conflicts.length) parts.push(renderArtifactConflict(summary.conflicts[0]!, locale));
  const promotable = summary.candidates.filter((candidate) => candidate.factKey);
  if (promotable.length) {
    parts.push(ar
      ? `القيم المرصودة غير معتمدة؛ أحتاج موافقتك الصريحة قبل إضافتها إلى مساحة الحل.`
      : `Observed values are not approved; I need your explicit approval before adding them to the governed workspace.`);
  } else if (summary.observations.length) {
    parts.push(ar ? `هذه قيم مرصودة فقط، وليست كميات معتمدة أو منتجات مختارة.` : `These are observed values only, not approved quantities and not selected products.`);
  }
  const limitation = summary.limitations[0];
  if (limitation) parts.push(ar ? `قيود: ${limitation}` : `Limitation: ${limitation}`);
  return parts.join(" ");
}
