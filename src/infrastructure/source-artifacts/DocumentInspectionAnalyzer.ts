import type { DocumentClassification, ObservedFact, PdfInspection } from "@/src/domain/source-artifact";
import { classifyPdfInspection, extractObservations } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "./PdfTextExtractor";

/**
 * Thin orchestrator for Phase 2A-1B.
 *
 * Pipeline: real PDF inspection (2A-1A) -> conservative classification ->
 * observed facts. It holds no PDF knowledge and no business rules: the parser
 * owns bytes/pages/text/metrics, and the domain modules own the analysis.
 *
 * Nothing here approves, verifies, completes, or selects anything.
 */
export type AnalyzedPdfInspection = {
  format: "PDF";
  /** Untouched 2A-1A inspection result, so callers keep the underlying evidence. */
  inspection: PdfInspection;
  classification: DocumentClassification;
  observations: ObservedFact[];
  /** Union of inspection, classification, and observation limitations. */
  limitations: string[];
};

/** Composes classification and observations over an already-produced inspection. */
export function analyzePdfInspection(inspection: PdfInspection): AnalyzedPdfInspection {
  const classification = classifyPdfInspection({ pages: inspection.pages, document: inspection.document });
  const observed = extractObservations(inspection.pages);
  const limitations = [
    ...inspection.document.limitations.map((item) => `pdf inspection: ${item}`),
    ...classification.limitations,
    ...observed.limitations,
  ];
  return {
    format: "PDF",
    inspection,
    classification,
    observations: observed.observations,
    limitations: [...new Set(limitations)],
  };
}

/** Inspects real PDF bytes and analyzes the result in one call. */
export function analyzePdfBytes(bytes: Uint8Array): AnalyzedPdfInspection {
  return analyzePdfInspection(inspectPdfBytes(bytes));
}
