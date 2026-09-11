import type { OcrPort } from "@/src/application/source-artifacts/ports";
import {
  DETERMINISTIC_OCR_ENGINE_ID,
  ocrReliabilityFor,
  type OcrPageRequest,
  type OcrPageResult,
  type OcrStatus,
} from "@/src/domain/source-artifact";

/**
 * Deterministic fixture engine for tests and local development.
 *
 * It returns canned text keyed by page identity and NEVER performs real
 * recognition: every result carries the engine id "deterministic-test-double"
 * plus a limitation saying so, and pages without a fixture honestly return
 * NO_TEXT_FOUND. Production code must never mistake its output for OCR truth.
 */

export type DeterministicOcrFixture = {
  text?: string;
  status?: Extract<OcrStatus, "COMPLETED" | "PARTIAL" | "LOW_CONFIDENCE" | "NO_TEXT_FOUND" | "FAILED">;
  /** Engine-reported confidence in 0..1; null means "not reported". */
  confidence?: number | null;
  /** Failure detail, used only with status FAILED. */
  error?: string | null;
};

export type DeterministicOcrFixtures = Record<string, string | DeterministicOcrFixture>;

/**
 * Fixture key for a request: `page:<n>` for proven pages,
 * `index:<i>` for unattributed content (position, never an invented number).
 */
export function fixtureKeyFor(request: Pick<OcrPageRequest, "pageNumber" | "pageIndex">): string {
  return request.pageNumber === null ? `index:${request.pageIndex}` : `page:${request.pageNumber}`;
}

export function deterministicOcrEngine(fixtures: DeterministicOcrFixtures = {}): OcrPort {
  return {
    engineId: DETERMINISTIC_OCR_ENGINE_ID,
    async recognize(request: OcrPageRequest): Promise<OcrPageResult> {
      const raw = fixtures[fixtureKeyFor(request)];
      const fixture: DeterministicOcrFixture = typeof raw === "string" ? { text: raw } : (raw ?? {});
      const text = fixture.text ?? "";
      const status: OcrStatus = fixture.status ?? (text.trim() ? "COMPLETED" : "NO_TEXT_FOUND");
      const confidence = fixture.confidence ?? null;
      const reliability = status === "LOW_CONFIDENCE" || status === "FAILED" || status === "NO_TEXT_FOUND"
        ? "LOW"
        : ocrReliabilityFor(confidence);
      const limitations = ["deterministic test-double output; not produced by a real OCR engine"];
      if (raw === undefined) limitations.push("the test double holds no fixture text for this page, so nothing was recovered");
      if (status === "LOW_CONFIDENCE") limitations.push("low-confidence fixture output; verify wording against the original page");
      if (status === "PARTIAL") limitations.push("partial fixture output; only part of the page was recovered");
      if (status === "NO_TEXT_FOUND" && raw !== undefined) limitations.push("fixture carries no usable text for this page");
      if (status === "FAILED") limitations.push(`fixture reports failure${fixture.error ? `: ${fixture.error}` : ""}`);
      if ((status === "COMPLETED" || status === "PARTIAL") && confidence === null) {
        limitations.push("engine reported no confidence score");
      }
      // The request page number is echoed, never invented.
      return {
        pageNumber: request.pageNumber,
        text: status === "FAILED" || status === "NO_TEXT_FOUND" ? "" : text,
        status,
        confidence,
        reliability,
        engineId: DETERMINISTIC_OCR_ENGINE_ID,
        limitations,
        error: status === "FAILED" ? (fixture.error ?? "fixture failure") : null,
      };
    },
  };
}
