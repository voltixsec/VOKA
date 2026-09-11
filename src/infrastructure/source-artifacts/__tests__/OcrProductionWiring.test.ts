import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import { DETERMINISTIC_OCR_ENGINE_ID, UNAVAILABLE_OCR_ENGINE_ID, type OcrPageRequest } from "@/src/domain/source-artifact";
import { deterministicOcrEngine } from "../ocr/DeterministicOcrEngine";
import { unavailableOcrEngine } from "../ocr/UnavailableOcrEngine";
import {
  OCR_DEFAULT_MAX_PAGES,
  analyzePdfBytesWithOcr,
  priorOcrFromStoredPages,
} from "../ocr/OcrDocumentAnalyzer";
import { createProductionOcrPort, resolveProductionOcrConfig, type ProductionOcrEnv } from "../ocr/createProductionOcrPort";
import { TESSERACT_OCR_ENGINE_ID, tesseractOcrEngine } from "../ocr/TesseractOcrEngine";
import { pdfJsPageRasterizer } from "../ocr/PageRasterizer";
import { SCANNED_SHEET, TEXT_SHEET, buildPdf } from "./fixtures/pdfFixtures";

function counting(engine: OcrPort): { calls: OcrPageRequest[]; port: OcrPort } {
  const calls: OcrPageRequest[] = [];
  return {
    calls,
    port: {
      engineId: engine.engineId,
      recognize: async (request) => {
        calls.push(request);
        return engine.recognize(request);
      },
    },
  };
}

describe("production OCR resolution (2A-2B)", () => {
  it("returns null when OCR is not configured, keeping native-only behavior", () => {
    expect(createProductionOcrPort({})).toBeNull();
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: "" })).toBeNull();
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: "off" })).toBeNull();
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: "none" })).toBeNull();
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: " OFF " })).toBeNull();
  });

  it("resolves the real tesseract engine without loading heavy dependencies", () => {
    const port = createProductionOcrPort({ VOKA_OCR_ENGINE: "tesseract" });
    expect(port?.engineId).toBe(TESSERACT_OCR_ENGINE_ID);
    expect(port?.engineId).toBe("tesseract-local");
    // Case-insensitive, like the rest of the runtime configuration.
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: "Tesseract" })?.engineId).toBe(TESSERACT_OCR_ENGINE_ID);
  });

  it("returns an explicit unavailable engine for unknown engine values", () => {
    const port = createProductionOcrPort({ VOKA_OCR_ENGINE: "cloud-magic" });
    expect(port?.engineId).toBe(UNAVAILABLE_OCR_ENGINE_ID);
  });

  it("returns an explicit unavailable engine for invalid or missing language data", () => {
    const invalid = createProductionOcrPort({ VOKA_OCR_ENGINE: "tesseract", VOKA_OCR_LANGS: "english!!" });
    expect(invalid?.engineId).toBe(UNAVAILABLE_OCR_ENGINE_ID);
    // "fra" is a well-formed code whose data package is not installed.
    const missing = createProductionOcrPort({ VOKA_OCR_ENGINE: "tesseract", VOKA_OCR_LANGS: "fra" });
    expect(missing?.engineId).toBe(UNAVAILABLE_OCR_ENGINE_ID);
    // Installed language data resolves to the real engine.
    expect(createProductionOcrPort({ VOKA_OCR_ENGINE: "tesseract", VOKA_OCR_LANGS: "eng+ara" })?.engineId).toBe(TESSERACT_OCR_ENGINE_ID);
  });

  it("never resolves the deterministic test double under any environment", () => {
    const environments: Array<ProductionOcrEnv> = [
      {},
      { VOKA_OCR_ENGINE: "tesseract" },
      { VOKA_OCR_ENGINE: "bogus" },
      { VOKA_OCR_ENGINE: "tesseract", VOKA_OCR_LANGS: "xx" },
      { VOKA_OCR_ENGINE: "deterministic-test-double" },
      { VOKA_OCR_ENGINE: "test" },
    ];
    for (const env of environments) {
      expect(createProductionOcrPort(env)?.engineId ?? null).not.toBe(DETERMINISTIC_OCR_ENGINE_ID);
    }
  });

  it("keeps the deterministic engine out of production OCR modules", () => {
    for (const file of ["createProductionOcrPort.ts", "TesseractOcrEngine.ts", "PageRasterizer.ts", "OcrDocumentAnalyzer.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src/infrastructure/source-artifacts/ocr", file), "utf8");
      expect(source).not.toContain("DeterministicOcrEngine");
      expect(source).not.toContain("deterministicOcrEngine(");
    }
  });

  it("resolves OCR limits with safe defaults", () => {
    expect(OCR_DEFAULT_MAX_PAGES).toBe(25);
    expect(resolveProductionOcrConfig({})).toMatchObject({ engine: "", langs: "eng", maxPages: 25, timeoutMs: 180000 });
    expect(resolveProductionOcrConfig({ VOKA_OCR_MAX_PAGES: "5", VOKA_OCR_TIMEOUT_MS: "10000", VOKA_OCR_LANGS: "eng+ara" }))
      .toMatchObject({ maxPages: 5, timeoutMs: 10000, langs: "eng+ara" });
    // Invalid numbers fall back to the safe defaults instead of disabling limits.
    expect(resolveProductionOcrConfig({ VOKA_OCR_MAX_PAGES: "0", VOKA_OCR_TIMEOUT_MS: "-3" }))
      .toMatchObject({ maxPages: 25, timeoutMs: 180000 });
  });
});

describe("OCR page cap and engine failure containment (2A-2B)", () => {
  it("caps eligible pages and says plainly which pages were not re-read", async () => {
    const { calls, port } = counting(deterministicOcrEngine({}));
    const analyzed = await analyzePdfBytesWithOcr(buildPdf(Array.from({ length: 30 }, () => SCANNED_SHEET)), port, {
      artifactId: "a",
      maxOcrPages: 3,
    });
    expect(calls).toHaveLength(3);
    expect(analyzed.ocr.requestedPages).toHaveLength(3);
    expect(analyzed.limitations.join(" ")).toContain("OCR was limited to the first 3 eligible page(s); 27 further page(s) were not re-read");
  });

  it("defaults to a bounded page cap", async () => {
    const { calls, port } = counting(deterministicOcrEngine({}));
    await analyzePdfBytesWithOcr(buildPdf(Array.from({ length: 30 }, () => SCANNED_SHEET)), port, { artifactId: "a" });
    expect(calls).toHaveLength(OCR_DEFAULT_MAX_PAGES);
  });

  it("degrades a throwing engine to FAILED for that page instead of aborting the analysis", async () => {
    const explosive: OcrPort = {
      engineId: "explosive",
      recognize: async () => {
        throw new Error("worker crashed");
      },
    };
    const analyzed = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), explosive, { artifactId: "a" });
    const page = analyzed.inspection.pages[0]!;
    expect(page.ocr).toMatchObject({ requested: true, status: "FAILED", engineId: "explosive" });
    expect(page.ocr?.error).toContain("worker crashed");
    expect(page.text).toBe("");
    expect(page.textSource).toBe("NONE");
    expect(analyzed.classification.value).toBe("SCANNED_OR_IMAGE_ONLY");
    expect(analyzed.limitations.join(" ")).toContain("OCR was attempted on 1 page(s) but recovered no usable text");
  });
});

describe("persisted OCR reuse (2A-2B)", () => {
  it("reuses persisted OCR results without calling the engine again", async () => {
    const first = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": "BILL OF QUANTITIES\nITEM DESCRIPTION QTY UNIT\n1.1 Pump set 2 nos" }),
      { artifactId: "a" },
    );
    expect(first.ocr.usedPages).toEqual([1]);
    const prior = priorOcrFromStoredPages(first.inspection.pages);
    expect(prior).toHaveLength(1);
    const { calls, port } = counting(deterministicOcrEngine({}));
    const second = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), port, { artifactId: "a", priorOcr: prior });
    expect(calls).toHaveLength(0);
    expect(second.ocr.usedPages).toEqual([1]);
    expect(second.inspection.pages[0]!.ocrText).toContain("BILL OF QUANTITIES");
    expect(second.inspection.pages[0]!.ocr?.limitations.join(" ")).toContain("reused persisted OCR result from ingest; recognition was not re-run");
    expect(second.observations.length).toBeGreaterThan(0);
    expect(second.observations.every((item) => item.origin?.textSource === "OCR")).toBe(true);
  });

  it("ignores persisted results that do not match the page and re-runs the engine", async () => {
    const prior = priorOcrFromStoredPages((await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": "BILL OF QUANTITIES" }),
      { artifactId: "a" },
    )).inspection.pages);
    // Tampered page number: the persisted result must not be trusted.
    const tampered = [{ ...prior[0]!, pageNumber: 99 }];
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": "NOTE: fresh read" }));
    const analyzed = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), port, { artifactId: "a", priorOcr: tampered });
    expect(calls).toHaveLength(1);
    expect(analyzed.inspection.pages[0]!.ocrText).toBe("NOTE: fresh read");
  });

  it("never reuses failures, absences, or empty results", () => {
    expect(priorOcrFromStoredPages(undefined)).toEqual([]);
    const failed = priorOcrFromStoredPages([{
      pageNumber: 1, attribution: "PAGE_TREE", text: "", characterCount: 0, ocrText: "",
      ocr: { status: "FAILED", engineId: "x", requested: true, confidence: null, reliability: "LOW", limitations: [], error: "boom" },
    }]);
    expect(failed).toEqual([]);
  });
});

describe("tesseract engine result mapping (2A-2B, injected fakes only)", () => {
  const rasterize = { rasterize: async () => ({ png: new Uint8Array([1, 2, 3]), width: 100, height: 100, scale: 2.5 }) };
  const request = { artifactId: "a", pageNumber: 1, pageIndex: 0, pdfBytes: new Uint8Array(), reason: "test" };

  it("maps recognition output to COMPLETED with normalized confidence", async () => {
    const engine = tesseractOcrEngine({ rasterize, recognize: async () => ({ text: "hello", confidence: 0.94 }) });
    expect(engine.engineId).toBe("tesseract-local");
    const result = await engine.recognize(request);
    expect(result).toMatchObject({ pageNumber: 1, text: "hello", status: "COMPLETED", confidence: 0.94, reliability: "HIGH" });
    expect(result.limitations.join(" ")).toContain("100x100px");
  });

  it("reports empty recognition as NO_TEXT_FOUND without usable text", async () => {
    const engine = tesseractOcrEngine({ rasterize, recognize: async () => ({ text: "  \n ", confidence: 0.9 }) });
    const result = await engine.recognize(request);
    expect(result).toMatchObject({ text: "", status: "NO_TEXT_FOUND", reliability: "LOW" });
  });

  it("reports sub-threshold confidence as LOW_CONFIDENCE", async () => {
    const engine = tesseractOcrEngine({ rasterize, recognize: async () => ({ text: "maybe", confidence: 0.2 }) });
    const result = await engine.recognize(request);
    expect(result).toMatchObject({ status: "LOW_CONFIDENCE", reliability: "LOW" });
    expect(result.limitations.join(" ")).toContain("low-confidence");
  });

  it("converts rasterizer, recognizer, and timeout failures to FAILED, never a throw", async () => {
    const rasterFail = tesseractOcrEngine({
      rasterize: { rasterize: async () => { throw new Error("bad pdf"); } },
    });
    await expect(rasterFail.recognize(request)).resolves.toMatchObject({ status: "FAILED" });
    const recognizeFail = tesseractOcrEngine({
      rasterize,
      recognize: async () => { throw new Error("worker down"); },
    });
    const failed = await recognizeFail.recognize(request);
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toContain("worker down");
    const hanging = tesseractOcrEngine({ rasterize, recognize: () => new Promise(() => undefined), timeoutMs: 20 });
    const timedOut = await hanging.recognize(request);
    expect(timedOut.status).toBe("FAILED");
    expect(timedOut.error).toContain("timed out");
  });

  it("rejects invalid language sets at construction", () => {
    expect(() => tesseractOcrEngine({ langs: "english!!" })).toThrow('invalid OCR language set "english!!"');
  });
});

describe("pdf.js page rasterizer (2A-2B)", () => {
  it("renders a PDF page to PNG bytes", async () => {
    const raster = await pdfJsPageRasterizer().rasterize(buildPdf([TEXT_SHEET]), 0);
    expect(raster.png.length).toBeGreaterThan(1000);
    expect(raster.width).toBeGreaterThan(0);
    expect(raster.height).toBeGreaterThan(0);
    // PNG magic bytes.
    expect([raster.png[0], raster.png[1], raster.png[2], raster.png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rejects out-of-range page indexes", async () => {
    await expect(pdfJsPageRasterizer().rasterize(buildPdf([TEXT_SHEET]), 4)).rejects.toThrow("out of range");
  });
});

describe("unavailable engine honesty (2A-2B)", () => {
  it("carries the configuration reason through every result", async () => {
    const engine = unavailableOcrEngine('unknown OCR engine "x"');
    const result = await engine.recognize({ artifactId: "a", pageNumber: 2, pageIndex: 1, pdfBytes: new Uint8Array(), reason: "test" });
    expect(result).toMatchObject({ pageNumber: 2, text: "", status: "UNAVAILABLE", engineId: "ocr-unavailable" });
    expect(result.limitations).toEqual(['unknown OCR engine "x"']);
  });
});
