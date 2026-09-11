import { describe, expect, it } from "vitest";

/**
 * Live smoke test for the real tesseract engine. It renders a PNG, embeds it
 * as an image-only PDF, rasterizes the page with pdf.js, and recognizes it
 * with tesseract — all offline via npm packages. Gated behind
 * VOKA_OCR_SMOKE_TEST=1 so the default suite stays fast and hermetic.
 */
const enabled = process.env.VOKA_OCR_SMOKE_TEST === "1";

describe.runIf(enabled)("real tesseract OCR smoke (2A-2B)", () => {
  it("recovers text from a rendered image-only PDF page", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const { default: PDFDocument } = await import("pdfkit");
    const { tesseractOcrEngine, terminateTesseractWorkers } = await import("../ocr/TesseractOcrEngine");

    const lines = ["BILL OF QUANTITIES", "1.1 Fire pump set 2 nos", "MODEL NO: FP-200"];
    const canvas = createCanvas(1200, 400);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1200, 400);
    ctx.fillStyle = "#000000";
    ctx.font = "48px sans-serif";
    lines.forEach((line, index) => ctx.fillText(line, 60, 100 + index * 90));
    const png = canvas.toBuffer("image/png");

    const pdfBytes = await new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: [1200, 400], margin: 0 });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.image(png, 0, 0, { width: 1200, height: 400 });
      document.end();
    });

    try {
      const engine = tesseractOcrEngine({ langs: "eng" });
      expect(engine.engineId).toBe("tesseract-local");
      const result = await engine.recognize({
        artifactId: "smoke",
        pageNumber: 1,
        pageIndex: 0,
        pdfBytes: new Uint8Array(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength),
        reason: "smoke test",
      });
      expect(result.status).toBe("COMPLETED");
      expect(result.pageNumber).toBe(1);
      expect(result.confidence).toBeGreaterThan(0.5);
      for (const line of lines) {
        expect(result.text).toContain(line);
      }
    } finally {
      await terminateTesseractWorkers();
    }
  }, 180_000);
});
