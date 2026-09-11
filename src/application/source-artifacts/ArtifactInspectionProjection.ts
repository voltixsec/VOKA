import type { DocumentClassification, ObservedFact, ObservationReliability, ObservationType, PdfInspection } from "@/src/domain/source-artifact";
import { proposeArtifactCandidates, renderArtifactConflict, type ArtifactCandidateFact, type ArtifactFactConflict, type GovernedFactRef } from "./ArtifactCandidateFacts";

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
};

export type ProjectedClassification = {
  value: string;
  reliability: string;
  confidence: number;
  limitations: string[];
};

/** Structural input so the application layer never imports the infrastructure analyzer. */
export type ArtifactAnalysisInput = {
  inspection: PdfInspection;
  classification: DocumentClassification;
  observations: ObservedFact[];
  limitations: string[];
};

export type ArtifactInspectionSummary = {
  artifactId: string;
  filename: string;
  kind: "PDF" | "IMAGE";
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
};

const GOVERNANCE_STATEMENTS = [
  "observed values are not approved, verified, or selected",
  "document classification is a document-handling hint, not engineering understanding",
  "no OCR, image interpretation, or geometry interpretation was performed",
];

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
    };
  }

  const { inspection, classification, observations, limitations } = analysis;
  const proposed = proposeArtifactCandidates({
    artifactId: input.artifactId,
    observations,
    governedFacts: input.governedFacts,
    existing: input.existingCandidates,
  });
  const text = inspection.text.trim();
  return {
    artifactId: input.artifactId,
    filename: input.filename,
    kind: input.kind,
    status,
    pageCount: inspection.document.pageCount,
    classification: {
      value: classification.value,
      reliability: classification.reliability,
      confidence: classification.confidence,
      limitations: classification.limitations.slice(0, MAX_PROJECTED_LIMITATIONS),
    },
    pageClassifications: classification.pages.slice(0, MAX_PROJECTED_PAGES).map((page) => ({ pageNumber: page.pageNumber, value: page.value })),
    observations: observations.slice(0, MAX_PROJECTED_OBSERVATIONS).map((observation) => ({
      type: observation.type,
      value: observation.value,
      pageNumber: observation.pageNumber,
      locator: observation.evidence.locator,
      reliability: observation.reliability,
      status: observation.status,
    })),
    observationCount: observations.length,
    candidates: proposed.candidates.slice(0, MAX_PROJECTED_CANDIDATES),
    conflicts: proposed.conflicts,
    limitations: [...new Set([...limitations, ...(input.failure ? [input.failure] : [])])].slice(0, MAX_PROJECTED_LIMITATIONS),
    excerpt: text ? text.slice(0, MAX_EXCERPT_CHARACTERS) : null,
    excerptTruncated: text.length > MAX_EXCERPT_CHARACTERS,
    governance: [...GOVERNANCE_STATEMENTS],
  };
}

/**
 * Renders the concise, truthful brief the assistant may say out loud.
 * It never claims approval, selection, or completeness, and it states plainly
 * when the content could not be read.
 */
export function renderInspectionBrief(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
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
    const pages = summary.pageCount == null ? "" : ar ? ` (${summary.pageCount} صفحة)` : ` (${summary.pageCount} page(s))`;
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
  if (summary.observations.length) {
    const listed = summary.observations.slice(0, 6).map((observation) => {
      const page = observation.pageNumber == null ? (ar ? "صفحة غير منسوبة" : "unattributed page") : (ar ? `ص ${observation.pageNumber}` : `p${observation.pageNumber}`);
      return `${label(OBSERVATION_LABEL, observation.type, locale)}: ${observation.value} (${page})`;
    });
    const more = summary.observationCount > summary.observations.length ? (ar ? ` + المزيد` : " + more") : "";
    parts.push(ar ? `ما رُصد نصياً: ${listed.join("؛ ")}${more}.` : `Observed in text: ${listed.join("; ")}${more}.`);
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
