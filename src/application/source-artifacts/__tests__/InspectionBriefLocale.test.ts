import { describe, expect, it } from "vitest";
import { projectArtifactInspection, renderInspectionBrief } from "@/src/application/source-artifacts";
import { analyzePdfBytes } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";
import { BOQ_SHEET, DRAWING_SHEET, SCANNED_SHEET, buildCidFontPdf, buildPdf } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/pdfFixtures";

const ARABIC_SCRIPT = /[؀-ۿ]/u;

function summaryFor(spec: Parameters<typeof buildPdf>[0]) {
  return projectArtifactInspection({ artifactId: "artifact-1", filename: "tender.pdf", kind: "PDF", analysis: analyzePdfBytes(buildPdf(spec)) });
}

describe("inspection brief locale routing (2A-1C)", () => {
  it("renders an English brief for an English runtime", () => {
    const brief = renderInspectionBrief(summaryFor([DRAWING_SHEET, BOQ_SHEET]), "en");
    expect(brief).toContain("I read");
    expect(brief).toContain("Classification: mixed document");
    expect(brief).toContain("reliability high");
    expect(brief).toContain("Observed in text:");
    expect(brief).toContain("drawing/sheet no.: ME-101");
    expect(brief).toMatch(/not approved/iu);
    expect(ARABIC_SCRIPT.test(brief)).toBe(false);
  });

  it("renders an Arabic brief for an Arabic runtime", () => {
    const brief = renderInspectionBrief(summaryFor([DRAWING_SHEET, BOQ_SHEET]), "ar");
    expect(brief).toContain("قرأت الملف");
    expect(brief).toContain("التصنيف: مستند مختلط");
    expect(brief).toContain("موثوقية عالية");
    expect(brief).toContain("ما رُصد نصياً");
    expect(brief).toContain("رقم اللوحة: ME-101");
    expect(brief).toMatch(/غير معتمدة/iu);
    expect(brief).not.toContain("I read");
  });

  it("does not infer the language from the document contents", () => {
    // Arabic document content inspected by an English runtime stays English.
    const arabicDocument = projectArtifactInspection({ artifactId: "artifact-1", filename: "arabic.pdf", kind: "PDF", analysis: analyzePdfBytes(buildCidFontPdf("مصعد سيارات P-01")) });
    expect(arabicDocument.excerpt).toContain("مصعد");
    const brief = renderInspectionBrief(arabicDocument, "en");
    expect(brief).toContain("I read");
    expect(ARABIC_SCRIPT.test(brief)).toBe(false);
  });

  it("asks for approval in the runtime language when a promotable candidate exists", () => {
    const summary = projectArtifactInspection({ ...{ artifactId: "artifact-1", filename: "tender.pdf", kind: "PDF" as const }, analysis: analyzePdfBytes(buildPdf([DRAWING_SHEET])) });
    expect(renderInspectionBrief(summary, "en")).toContain("explicit approval");
    expect(renderInspectionBrief(summary, "ar")).toContain("موافقتك الصريحة");
  });

  it("states the OCR limitation in the runtime language for image-only files", () => {
    const summary = summaryFor([SCANNED_SHEET]);
    expect(renderInspectionBrief(summary, "en")).toContain("OCR");
    const arabic = renderInspectionBrief(summary, "ar");
    expect(arabic).toContain("الـ OCR");
    expect(arabic).toContain("لم أجد نصاً");
  });

  it("keeps the brief free of raw enum tokens in both locales", () => {
    const tokens = [
      "BOQ_OR_SCHEDULE", "SCANNED_OR_IMAGE_ONLY", "TEXT_DOCUMENT", "DRAWING", "MIXED", "UNKNOWN",
      "OBSERVED_NOT_APPROVED", "OBSERVED_PENDING_APPROVAL",
      "INSPECTED", "INSPECTED_NO_MACHINE_READABLE_TEXT", "NOT_INSPECTED", "ENCRYPTED",
      "QUANTITY", "ITEM_NUMBER", "EQUIPMENT_TAG", "MODEL_OR_REFERENCE", "PROJECT_TITLE", "REVISION",
    ];
    // Every status a real inspection can produce, in both runtime languages.
    const briefs = [
      renderInspectionBrief(summaryFor([BOQ_SHEET]), "en"),
      renderInspectionBrief(summaryFor([BOQ_SHEET]), "ar"),
      renderInspectionBrief(summaryFor([SCANNED_SHEET]), "en"),
      renderInspectionBrief(summaryFor([SCANNED_SHEET]), "ar"),
      renderInspectionBrief(projectArtifactInspection({ artifactId: "a", filename: "f.pdf", kind: "PDF", analysis: null }), "en"),
      renderInspectionBrief(projectArtifactInspection({ artifactId: "a", filename: "f.pdf", kind: "PDF", analysis: null }), "ar"),
    ];
    for (const brief of briefs) {
      for (const token of tokens) expect(brief).not.toContain(token);
    }
    // The human label replaces the token where a classification is stated.
    expect(renderInspectionBrief(summaryFor([BOQ_SHEET]), "en")).toContain("BOQ / schedule");
    expect(renderInspectionBrief(summaryFor([BOQ_SHEET]), "ar")).toContain("جدول كميات");
    // Image-only pages state the OCR limitation instead of a classification label.
    expect(renderInspectionBrief(summaryFor([SCANNED_SHEET]), "en")).toContain("no machine-readable text");
    expect(renderInspectionBrief(summaryFor([SCANNED_SHEET]), "ar")).toContain("لم أجد نصاً");
  });

  it("preserves 2A-1C truthfulness in both locales", () => {
    const en = renderInspectionBrief(summaryFor([BOQ_SHEET]), "en");
    expect(en).toMatch(/observed|not approved/iu);
    expect(en).not.toMatch(/approved quantity|product selected|system complete/iu);
    const ar = renderInspectionBrief(summaryFor([BOQ_SHEET]), "ar");
    expect(ar).toMatch(/مرصودة|غير معتمدة/iu);
    expect(ar).not.toMatch(/كمية معتمدة|منتج مختار|النظام مكتمل/iu);
  });
});
