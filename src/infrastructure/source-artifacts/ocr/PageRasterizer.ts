/**
 * Phase 2A-2B: PDF page rasterization for real OCR.
 *
 * A rasterizer turns one PDF page into a PNG image for the recognition engine.
 * It owns no recognition, no text interpretation, and no business rules: it is
 * a pure rendering adapter behind `PageRasterizerPort`, so the OCR engine
 * stays testable with injected fakes and the heavy rendering dependencies
 * load lazily, only when real OCR actually runs.
 */

export type RasterizedPage = {
  /** PNG bytes of the rendered page. */
  png: Uint8Array;
  width: number;
  height: number;
  /** Render scale that was used (1.0 = 72 DPI). */
  scale: number;
};

export interface PageRasterizerPort {
  rasterize(pdfBytes: Uint8Array, pageIndex: number): Promise<RasterizedPage>;
}

export type PdfJsRasterizerOptions = {
  /** Render scale; 2.5 approximates 180 DPI. Proven range for tesseract text recovery. */
  scale?: number;
  /** Longest rendered edge in pixels; larger pages are downscaled to bound memory. */
  maxDimensionPx?: number;
};

const DEFAULT_SCALE = 2.5;
const DEFAULT_MAX_DIMENSION_PX = 5000;

type PdfJsDocument = {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: unknown): { promise: Promise<void> };
    cleanup(): void;
  }>;
};

/**
 * Renders PDF pages with pdf.js onto a napi-rs canvas. Both dependencies are
 * npm-only with prebuilt binaries: no system rasterizer (poppler,
 * Ghostscript, GraphicsMagick) is required in production.
 */
export function pdfJsPageRasterizer(options: PdfJsRasterizerOptions = {}): PageRasterizerPort {
  const baseScale = options.scale ?? DEFAULT_SCALE;
  const maxDimensionPx = options.maxDimensionPx ?? DEFAULT_MAX_DIMENSION_PX;
  return {
    async rasterize(pdfBytes: Uint8Array, pageIndex: number): Promise<RasterizedPage> {
      // Lazy by design: importing pdf.js and canvas only happens on real OCR.
      const [{ createCanvas }, pdfjs] = await Promise.all([
        import("@napi-rs/canvas"),
        import("pdfjs-dist/legacy/build/pdf.mjs"),
      ]);
      const canvasFactory = {
        create(width: number, height: number) {
          const canvas = createCanvas(width, height);
          return { canvas, context: canvas.getContext("2d") };
        },
        reset(canvasAndContext: { canvas: { width: number; height: number } }, width: number, height: number) {
          canvasAndContext.canvas.width = width;
          canvasAndContext.canvas.height = height;
        },
        destroy(canvasAndContext: { canvas: { width: number; height: number } }) {
          canvasAndContext.canvas.width = 0;
          canvasAndContext.canvas.height = 0;
        },
      };
      // pdf.js requires a plain Uint8Array view; Node Buffers are rejected.
      const data: Uint8Array = Buffer.isBuffer(pdfBytes) ? new Uint8Array(pdfBytes) : pdfBytes;
      const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
      const document = (await loadingTask.promise) as unknown as PdfJsDocument;
      try {
        if (pageIndex < 0 || pageIndex >= document.numPages) {
          throw new Error(`page index ${pageIndex} is out of range for a ${document.numPages}-page document`);
        }
        const page = await document.getPage(pageIndex + 1);
        let scale = baseScale;
        const probe = page.getViewport({ scale });
        const longest = Math.max(probe.width, probe.height);
        if (longest > maxDimensionPx) scale = Math.max(1, scale * (maxDimensionPx / longest));
        const viewport = page.getViewport({ scale });
        const { canvas, context } = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: context, viewport, canvasFactory }).promise;
        const png = canvas.toBuffer("image/png");
        page.cleanup();
        return { png: new Uint8Array(png.buffer, png.byteOffset, png.byteLength), width: canvas.width, height: canvas.height, scale };
      } finally {
        await loadingTask.destroy().catch(() => undefined);
      }
    },
  };
}
