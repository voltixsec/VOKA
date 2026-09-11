import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPdfBytes } from "../PdfTextExtractor";

const CAIRO_FONT = path.join(process.cwd(), "assets", "fonts", "Cairo-SemiBold.ttf");

/** Generates a package with a real producer (pdfkit): Flate streams, WinAnsi Helvetica, kerned TJ arrays, embedded Type0 Arabic font. */
async function pdfkitPackage() {
  const { default: PDFDocument } = await import("pdfkit");
  const document = new PDFDocument({ size: "A1", layout: "landscape", margin: 40, info: { Title: "Seafront Tower MEP", Producer: "pdfkit-test", Creator: "VOKA fixture" } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => document.on("end", () => resolve(Buffer.concat(chunks))));
  document.font("Helvetica").fontSize(14).text("PROJECT: SEAFRONT TOWER", 60, 60).text("DRAWING TITLE: LEVEL 6 HVAC LAYOUT").text("DRAWING NO: ME-101 REV: B").text("SCALE 1:100 SHEET 3 OF 12").text("AHU-01 FCU-12 supply duct 600x400");
  for (let i = 0; i < 60; i++) document.rect(200 + i * 20, 400, 15, 15).stroke();
  document.addPage({ size: "A4", layout: "portrait", margin: 40 });
  document.font("Helvetica").fontSize(11).text("BILL OF QUANTITIES", 40, 40).text("ITEM DESCRIPTION QTY UNIT").text("1.1 Supply and install fire pump set 2 nos").text("1.2 GI pipe 100mm to BS 1387 250 m");
  if (existsSync(CAIRO_FONT)) { document.addPage({ size: "A4" }); document.font(CAIRO_FONT).fontSize(16).text("مصعد سيارات ستة طوابق", 40, 40, { features: ["rtla"] }); }
  document.end();
  return finished;
}

describe("real-producer PDF (pdfkit) through the SourceArtifact PDF stack", () => {
  it("attributes pages, reads kerned Helvetica text, and decodes embedded Type0 Arabic through ToUnicode", async () => {
    const bytes = await pdfkitPackage();
    const inspection = inspectPdfBytes(bytes);
    const hasArabic = existsSync(CAIRO_FONT);
    expect(inspection.document).toMatchObject({ pageCount: hasArabic ? 3 : 2, pageAttributionReliable: true, title: "Seafront Tower MEP", producer: "pdfkit-test" });
    expect(inspection.pages[0]).toMatchObject({ pageNumber: 1, paperSize: "A1 landscape", attribution: "PAGE_TREE" });
    expect(inspection.pages[0].text).toContain("DRAWING NO: ME-101 REV: B");
    expect(inspection.pages[0].text).toContain("AHU-01 FCU-12 supply duct 600x400");
    expect(inspection.pages[1]).toMatchObject({ pageNumber: 2, paperSize: "A4 portrait" });
    expect(inspection.pages[1].text).toContain("1.1 Supply and install fire pump set 2 nos");
    expect(inspection.pages[1].text).not.toContain("DRAWING NO");
    // 2A-1A proves page-aware text only: no classification and no engineering-observation claims are made here.
    expect(inspection.pages.every((page) => page.attribution === "PAGE_TREE" && page.extractionMethods?.includes("CONTENT_STREAM_TEXT"))).toBe(true);
    if (hasArabic) {
      const arabic = inspection.pages[2];
      expect(arabic.pageNumber).toBe(3);
      expect(arabic.text).toContain("مصعد سيارات ستة طوابق");
      expect(arabic.limitations).toContain("right-to-left text was reordered from visual to logical order; verify Arabic wording against the original");
      expect(arabic.metrics?.undecodableGlyphs).toBe(0);
    }
  });
});
