import type { OcrPort } from "@/src/application/source-artifacts/ports";
import { UNAVAILABLE_OCR_ENGINE_ID, type OcrPageRequest, type OcrPageResult } from "@/src/domain/source-artifact";

/**
 * Honest default when the runtime has no OCR capability.
 *
 * It never fabricates text: every request resolves to UNAVAILABLE with the
 * reason carried as the limitation and the error. OCR-gated pages keep their
 * native analysis, and the merged limitations say plainly that scanned content
 * was not read.
 */

export const OCR_UNAVAILABLE_REASON =
  "no OCR engine is available in this runtime: no local OCR engine is installed and no OCR provider is configured, so scanned pages were not read";

export function unavailableOcrEngine(reason: string = OCR_UNAVAILABLE_REASON): OcrPort {
  return {
    engineId: UNAVAILABLE_OCR_ENGINE_ID,
    async recognize(request: OcrPageRequest): Promise<OcrPageResult> {
      return {
        pageNumber: request.pageNumber,
        text: "",
        status: "UNAVAILABLE",
        confidence: null,
        reliability: "LOW",
        engineId: UNAVAILABLE_OCR_ENGINE_ID,
        limitations: [reason],
        error: reason,
      };
    },
  };
}
