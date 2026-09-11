import { createRequire } from "node:module";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import { OCR_DEFAULT_MAX_PAGES } from "./OcrDocumentAnalyzer";
import { tesseractOcrEngine } from "./TesseractOcrEngine";
import { unavailableOcrEngine } from "./UnavailableOcrEngine";

// NOTE: this module must never import the deterministic test-double engine.
// Production OCR is either a real engine or an explicit unavailable fallback;
// there is no silent path from "unconfigured" to fixture text.

/**
 * Phase 2A-2B: production OCR resolution.
 *
 * - `VOKA_OCR_ENGINE` unset, empty, "off", or "none" -> null: OCR is not
 *   configured, so callers run the native-only analysis (today's behavior).
 * - `VOKA_OCR_ENGINE=tesseract` -> the real local tesseract engine.
 * - any other value -> an explicit unavailable engine naming the bad value.
 *
 * `VOKA_OCR_LANGS` selects tesseract language data ("eng", "eng+ara").
 * `VOKA_OCR_MAX_PAGES` caps eligible OCR pages per analysis (default 25).
 * `VOKA_OCR_TIMEOUT_MS` bounds one page recognition (default 180000).
 */

export type ProductionOcrConfig = {
  engine: string;
  langs: string;
  maxPages: number;
  timeoutMs: number;
};

/** Minimal environment surface the factory reads; `process.env` satisfies it. */
export type ProductionOcrEnv = Record<string, string | undefined>;

const OCR_DEFAULT_TIMEOUT_MS = 180_000;
const LANG_PATTERN = /^[a-z]{3}(\+[a-z]{3})*$/u;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveProductionOcrConfig(env: ProductionOcrEnv = process.env): ProductionOcrConfig {
  return {
    engine: (env.VOKA_OCR_ENGINE ?? "").trim().toLowerCase(),
    langs: (env.VOKA_OCR_LANGS ?? "").trim().toLowerCase() || "eng",
    maxPages: positiveInt(env.VOKA_OCR_MAX_PAGES, OCR_DEFAULT_MAX_PAGES),
    timeoutMs: positiveInt(env.VOKA_OCR_TIMEOUT_MS, OCR_DEFAULT_TIMEOUT_MS),
  };
}

function langDataPresent(lang: string): boolean {
  try {
    require.resolve(`@tesseract.js-data/${lang}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the production OCR port, or null when OCR is not configured.
 * Never returns the deterministic test double under any environment.
 */
export function createProductionOcrPort(env: ProductionOcrEnv = process.env): OcrPort | null {
  const config = resolveProductionOcrConfig(env);
  if (!config.engine || config.engine === "off" || config.engine === "none") return null;
  if (config.engine !== "tesseract") {
    return unavailableOcrEngine(
      `unknown OCR engine "${config.engine}": expected "tesseract" (or unset to disable OCR); scanned pages were not read`,
    );
  }
  if (!LANG_PATTERN.test(config.langs)) {
    return unavailableOcrEngine(
      `invalid OCR language set "${config.langs}": expected a code like "eng" or "eng+ara"; scanned pages were not read`,
    );
  }
  const missing = config.langs.split("+").filter((lang) => !langDataPresent(lang));
  if (missing.length) {
    return unavailableOcrEngine(
      `OCR language data "@tesseract.js-data/${missing[0]}" is not installed; scanned pages were not read`,
    );
  }
  return tesseractOcrEngine({ langs: config.langs, timeoutMs: config.timeoutMs });
}
