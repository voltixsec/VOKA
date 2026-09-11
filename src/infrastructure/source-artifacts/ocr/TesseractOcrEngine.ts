import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import { ocrReliabilityFor, type OcrPageRequest, type OcrPageResult } from "@/src/domain/source-artifact";
import { pdfJsPageRasterizer, type PageRasterizerPort } from "./PageRasterizer";

/**
 * Phase 2A-2B: real local OCR engine (tesseract.js + pdf.js rasterization).
 *
 * npm-only and offline-capable: page rendering uses pdf.js on a napi-rs
 * canvas, recognition uses tesseract.js with a locally resolved core and
 * language data (`@tesseract.js-data/*`). No system binary (tesseract,
 * poppler, Ghostscript) and no network access are required at runtime once
 * dependencies are installed.
 *
 * Production properties:
 * - recognition workers are created lazily, cached per language set, and
 *   serialized so concurrent inspections cannot exhaust memory;
 * - every failure (missing language data, rasterize error, worker error,
 *   timeout) becomes a FAILED result with a sanitized message, never a throw
 *   and never fabricated text;
 * - rasterization and recognition are injectable, so unit tests never load
 *   the heavy dependencies; see `TesseractOcrSmoke` for the gated live test.
 */

/** Engine identity carried as OCR provenance. */
export const TESSERACT_OCR_ENGINE_ID = "tesseract-local";

/** tesseract.js confidence below this 0..1 value is reported as LOW_CONFIDENCE. */
export const TESSERACT_LOW_CONFIDENCE_THRESHOLD = 0.5;

const DEFAULT_TIMEOUT_MS = 180_000;
const LANG_PATTERN = /^[a-z]{3}(\+[a-z]{3})*$/u;
const MAX_ERROR_CHARS = 240;

export type TesseractRecognizeResult = { text: string; confidence: number | null };

export type TesseractOcrEngineOptions = {
  /** tesseract language code(s), e.g. "eng" or "eng+ara". */
  langs?: string;
  rasterize?: PageRasterizerPort;
  /** Injected recognition; the default runs the real tesseract worker. */
  recognize?: (png: Uint8Array, context: { langs: string }) => Promise<TesseractRecognizeResult>;
  /** Per-page recognition timeout in milliseconds. */
  timeoutMs?: number;
  /** Writable directory for worker cache and staged language data. */
  cacheDir?: string;
};

type WorkerLike = {
  recognize(image: Uint8Array): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<void>;
};

const workers = new Map<string, Promise<WorkerLike>>();
const queues = new Map<string, Promise<unknown>>();

function defaultCacheDir(): string {
  return process.env.VOKA_OCR_CACHE_DIR?.trim() || path.join(process.cwd(), ".voka-cache", "tesseract");
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/gu, " ").trim().slice(0, MAX_ERROR_CHARS) || "unknown error";
}

/** Resolves the language-data directory for one tesseract language code. */
function langDirFor(require: NodeRequire, lang: string): string {
  let exported: unknown;
  try {
    exported = require(`@tesseract.js-data/${lang}`);
  } catch {
    throw new Error(`language data "@tesseract.js-data/${lang}" is not installed`);
  }
  const dir = (exported as { langPath?: unknown }).langPath;
  if (typeof dir !== "string" || !existsSync(path.join(dir, `${lang}.traineddata.gz`))) {
    throw new Error(`language data "@tesseract.js-data/${lang}" is incomplete (missing ${lang}.traineddata.gz)`);
  }
  return dir;
}

/**
 * tesseract loads every language from a single directory, while npm ships one
 * directory per language. Single-language runs use the package directory
 * directly; multi-language runs stage copies once into the cache directory.
 */
function stageLangData(langs: string[], cacheDir: string): string {
  const require = createRequire(import.meta.url);
  const dirs = langs.map((lang) => ({ lang, dir: langDirFor(require, lang) }));
  if (dirs.length === 1) return dirs[0]!.dir;
  const staged = path.join(cacheDir, "tessdata-staged");
  mkdirSync(staged, { recursive: true });
  for (const { lang, dir } of dirs) {
    const target = path.join(staged, `${lang}.traineddata.gz`);
    if (!existsSync(target)) copyFileSync(path.join(dir, `${lang}.traineddata.gz`), target);
  }
  return staged;
}

async function loadWorker(langs: string, cacheDir: string): Promise<WorkerLike> {
  const { createWorker } = await import("tesseract.js");
  const require = createRequire(import.meta.url);
  let coreDir: string;
  try {
    coreDir = path.dirname(require.resolve("tesseract.js-core/package.json"));
  } catch {
    throw new Error('OCR runtime "tesseract.js-core" is not installed');
  }
  const worker = await createWorker(langs, undefined, {
    corePath: coreDir,
    langPath: stageLangData(langs.split("+"), cacheDir),
    cachePath: cacheDir,
    gzip: true,
  });
  return worker as unknown as WorkerLike;
}

function workerFor(langs: string, cacheDir: string): Promise<WorkerLike> {
  const key = `${langs} @ ${cacheDir}`;
  const cached = workers.get(key);
  if (cached) return cached;
  const created = loadWorker(langs, cacheDir);
  workers.set(key, created);
  // A failed load must not poison later attempts: drop it so the next call retries.
  created.catch(() => {
    if (workers.get(key) === created) workers.delete(key);
  });
  return created;
}

/** Serializes work per worker so recognitions never run concurrently. */
function enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(key, next.catch(() => undefined));
  return next;
}

/** Terminates cached workers. Intended for tests and graceful shutdown; servers keep workers for process life. */
export async function terminateTesseractWorkers(): Promise<void> {
  const cached = [...workers.values()];
  workers.clear();
  queues.clear();
  await Promise.all(cached.map((entry) => entry.then((worker) => worker.terminate()).catch(() => undefined)));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`OCR timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function tesseractOcrEngine(options: TesseractOcrEngineOptions = {}): OcrPort {
  const langs = (options.langs ?? "eng").trim().toLowerCase();
  if (!LANG_PATTERN.test(langs)) {
    throw new Error(`invalid OCR language set "${options.langs}"; expected a code like "eng" or "eng+ara"`);
  }
  const rasterizer = options.rasterize ?? pdfJsPageRasterizer();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const recognize = options.recognize
    ?? (async (png: Uint8Array) => {
      const key = `${langs} @ ${cacheDir}`;
      return enqueue(key, async () => {
        const worker = await withTimeout(workerFor(langs, cacheDir), timeoutMs);
        const { data } = await withTimeout(worker.recognize(png), timeoutMs);
        return { text: data.text ?? "", confidence: Number.isFinite(data.confidence) ? data.confidence / 100 : null };
      });
    });

  return {
    engineId: TESSERACT_OCR_ENGINE_ID,
    async recognize(request: OcrPageRequest): Promise<OcrPageResult> {
      const failed = (stage: string, error: unknown): OcrPageResult => {
        const detail = `${stage}: ${sanitizeError(error)}`;
        return {
          pageNumber: request.pageNumber,
          text: "",
          status: "FAILED",
          confidence: null,
          reliability: "LOW",
          engineId: TESSERACT_OCR_ENGINE_ID,
          limitations: [detail],
          error: detail,
        };
      };
      let raster: { png: Uint8Array; width: number; height: number; scale: number };
      try {
        raster = await rasterizer.rasterize(request.pdfBytes, request.pageIndex);
      } catch (error) {
        return failed("page rasterization failed", error);
      }
      let result: TesseractRecognizeResult;
      try {
        // The timeout is an engine-level guarantee: it bounds injected
        // recognition fakes exactly like the real worker path.
        result = await withTimeout(recognize(raster.png, { langs }), timeoutMs);
      } catch (error) {
        return failed("text recognition failed", error);
      }
      const text = result.text ?? "";
      if (!text.trim()) {
        return {
          pageNumber: request.pageNumber,
          text: "",
          status: "NO_TEXT_FOUND",
          confidence: null,
          reliability: "LOW",
          engineId: TESSERACT_OCR_ENGINE_ID,
          limitations: [`no text recognized from the page render (${raster.width}x${raster.height}px, ${langs} language data)`],
          error: null,
        };
      }
      const confidence = typeof result.confidence === "number" && Number.isFinite(result.confidence)
        ? Math.min(1, Math.max(0, result.confidence))
        : null;
      const low = confidence !== null && confidence < TESSERACT_LOW_CONFIDENCE_THRESHOLD;
      return {
        pageNumber: request.pageNumber,
        text,
        status: low ? "LOW_CONFIDENCE" : "COMPLETED",
        confidence,
        reliability: low ? "LOW" : ocrReliabilityFor(confidence),
        engineId: TESSERACT_OCR_ENGINE_ID,
        limitations: [
          `recognized from a ${raster.width}x${raster.height}px page render with ${langs} language data`,
          ...(confidence === null ? ["engine reported no confidence score"] : []),
          ...(low ? ["low-confidence recognition; verify wording against the original page"] : []),
        ],
        error: null,
      };
    },
  };
}
