import type { ExtractedPdf, PdfInspection } from "@/src/domain/source-artifact";
import { inspectPdf } from "./pdf/PdfInspector";

/**
 * Page-aware PDF inspection entry point.
 *
 * Text is attributed to the page whose content stream produced it when the page
 * tree could be walked reliably; otherwise `pageNumber` remains null. The result
 * never contains OCR, rendered output, or geometry interpretation.
 */
export function inspectPdfBytes(bytes: Uint8Array): PdfInspection {
  return inspectPdf(bytes);
}

/** Backwards-compatible text projection of {@link inspectPdfBytes}. */
export function extractPdfText(bytes: Uint8Array): ExtractedPdf {
  const inspection = inspectPdf(bytes);
  return { text: inspection.text, pages: inspection.pages };
}
