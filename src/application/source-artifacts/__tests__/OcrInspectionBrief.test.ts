import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CANDIDATE_STATUS,
  governedFactKeyFor,
  promoteArtifactCandidate,
  projectArtifactInspection,
  renderInspectionBrief,
  type ArtifactInspectionSummary,
} from "@/src/application/source-artifacts";
import { analyzePdfBytes } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";
import { analyzePdfBytesWithOcr } from "@/src/infrastructure/source-artifacts/ocr/OcrDocumentAnalyzer";
import { deterministicOcrEngine } from "@/src/infrastructure/source-artifacts/ocr/DeterministicOcrEngine";
import { unavailableOcrEngine } from "@/src/infrastructure/source-artifacts/ocr/UnavailableOcrEngine";
import { BOQ_SHEET, SCANNED_SHEET, buildPdf } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/pdfFixtures";

const BOQ_SCAN = [
  "BILL OF QUANTITIES",
  "ITEM DESCRIPTION QTY UNIT",
  "1.1 Supply and install fire pump set 2 nos",
  "1.2 Fire hose reel FHR-01 8 nos",
  "MODEL NO: FP-200",
].join("\n");

const DRAWING_SCAN = ["PROJECT: SEAFRONT TOWER", "DRAWING NO: ME-101 REV: B", "SCALE 1:100 SHEET 3 OF 12"].join("\n");

const ARABIC_SCRIPT = /[؀-ۿ]/u;

async function ocrSummary(spec: Parameters<typeof buildPdf>[0], fixtures: Record<string, string>) {
  const analysis = await analyzePdfBytesWithOcr(buildPdf(spec), deterministicOcrEngine(fixtures), { artifactId: "artifact-1" });
  return projectArtifactInspection({ artifactId: "artifact-1", filename: "scan.pdf", kind: "PDF", analysis });
}

describe("governed OCR projection and briefs (2A-2)", () => {
  it("projects OCR usage with page provenance and engine attribution", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    expect(summary.status).toBe("INSPECTED");
    expect(summary.ocr).toEqual({ attempted: true, used: true, pages: [1], engines: ["deterministic-test-double"], lowConfidence: false });
    expect(summary.classification?.value).toBe("BOQ_OR_SCHEDULE");
    expect(summary.classification?.reliability).toBe("MEDIUM");
    expect(summary.excerpt).toContain("BILL OF QUANTITIES");
    expect(summary.observations.length).toBeGreaterThan(0);
    for (const item of summary.observations) {
      expect(item.status).toBe("OBSERVED_NOT_APPROVED");
      expect(item.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
      expect(item.locator).toContain("OCR line");
    }
    expect(summary.governance.join(" ")).toContain("OCR text recovery was performed on scanned pages");
    expect(summary.governance.join(" ")).not.toContain("no OCR");
  });

  it("keeps native projections free of OCR provenance", () => {
    const summary = projectArtifactInspection({
      artifactId: "a", filename: "native.pdf", kind: "PDF", analysis: analyzePdfBytes(buildPdf([BOQ_SHEET])),
    });
    expect(summary.ocr).toEqual({ attempted: false, used: false, pages: [], engines: [], lowConfidence: false });
    expect(summary.observations.length).toBeGreaterThan(0);
    for (const item of summary.observations) {
      expect(item.origin).toBeUndefined();
    }
    expect(summary.governance.join(" ")).toContain("no OCR, image interpretation, or geometry interpretation was performed");
  });

  it("tells the user in English that the page was read using OCR", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain("Page 1 was read using OCR.");
    expect(brief).toContain("The text was extracted from a scanned page and may require review.");
    expect(brief).toContain("BOQ / schedule");
    expect(brief).toMatch(/not approved/iu);
    expect(ARABIC_SCRIPT.test(brief)).toBe(false);
  });

  it("tells the user in Arabic that the page was read using OCR", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    const brief = renderInspectionBrief(summary, "ar");
    expect(brief).toContain("تمت قراءة الصفحة 1 باستخدام التعرف الضوئي على الحروف (OCR).");
    expect(brief).toContain("تم استخراج النص من صفحة ممسوحة ضوئياً وقد يحتاج إلى مراجعة.");
    expect(brief).toContain("جدول كميات");
    expect(brief).not.toContain("Page 1 was read");
  });

  it("names every OCR-read page in both locales", async () => {
    const summary = await ocrSummary([SCANNED_SHEET, SCANNED_SHEET], { "page:1": BOQ_SCAN, "page:2": DRAWING_SCAN });
    expect(summary.ocr.pages).toEqual([1, 2]);
    expect(renderInspectionBrief(summary, "en")).toContain("Pages 1, 2 were read using OCR.");
    expect(renderInspectionBrief(summary, "ar")).toContain("تمت قراءة الصفحات 1، 2 باستخدام التعرف الضوئي على الحروف (OCR).");
  });

  it("says truthfully in both locales when OCR was attempted but recovered nothing", async () => {
    const analysis = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), unavailableOcrEngine(), { artifactId: "artifact-1" });
    const summary = projectArtifactInspection({ artifactId: "artifact-1", filename: "scan.pdf", kind: "PDF", analysis });
    expect(summary.status).toBe("INSPECTED_NO_MACHINE_READABLE_TEXT");
    expect(summary.ocr).toMatchObject({ attempted: true, used: false });
    expect(renderInspectionBrief(summary, "en")).toContain("I also tried reading the scanned pages with OCR but could not recover usable text.");
    const arabic = renderInspectionBrief(summary, "ar");
    expect(arabic).toContain("حاولت أيضاً قراءة الصفحات الممسوحة باستخدام التعرف الضوئي (OCR)");
    expect(arabic).toContain("لم أتمكن من استخراج نص قابل للاستخدام");
  });

  it("keeps OCR briefs free of raw enum and engine tokens in both locales", async () => {
    const tokens = [
      "BOQ_OR_SCHEDULE", "SCANNED_OR_IMAGE_ONLY", "TEXT_DOCUMENT", "DRAWING", "MIXED", "UNKNOWN",
      "OBSERVED_NOT_APPROVED", "OBSERVED_PENDING_APPROVAL",
      "INSPECTED", "INSPECTED_NO_MACHINE_READABLE_TEXT", "NOT_INSPECTED", "ENCRYPTED",
      "QUANTITY", "ITEM_NUMBER", "EQUIPMENT_TAG", "MODEL_OR_REFERENCE", "PROJECT_TITLE", "REVISION",
      "COMPLETED", "PARTIAL", "LOW_CONFIDENCE", "NO_TEXT_FOUND", "FAILED", "UNAVAILABLE", "NOT_REQUESTED",
      "OCR_TEXT", "NATIVE_AND_OCR", "NATIVE", "NONE", "PAGE_TREE", "UNATTRIBUTED",
      "deterministic-test-double", "ocr-unavailable", "HIGH", "MEDIUM", "LOW",
    ];
    const used = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    const attemptedAnalysis = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), unavailableOcrEngine(), { artifactId: "a" });
    const attempted = projectArtifactInspection({ artifactId: "a", filename: "s.pdf", kind: "PDF", analysis: attemptedAnalysis });
    const briefs = [
      renderInspectionBrief(used, "en"),
      renderInspectionBrief(used, "ar"),
      renderInspectionBrief(attempted, "en"),
      renderInspectionBrief(attempted, "ar"),
    ];
    for (const brief of briefs) {
      for (const token of tokens) expect(brief).not.toContain(token);
    }
  });

  it("never approves an OCR-derived quantity", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    const quantity = summary.candidates.find((candidate) => candidate.observationType === "QUANTITY")!;
    expect(quantity).toBeDefined();
    expect(quantity.status).toBe(ARTIFACT_CANDIDATE_STATUS);
    expect(quantity.factKey).toBeNull();
    expect(governedFactKeyFor("QUANTITY")).toBeNull();
    expect(quantity.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
    expect(quantity.limitations.join(" ")).toMatch(/not calculated, verified, or approved/u);
    expect(promoteArtifactCandidate(quantity, { userMessage: "approve 2 as the quantity", now: "2026-09-11T00:00:00.000Z" })).toBeNull();
  });

  it("never selects a product from OCR-derived model or equipment text", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    const model = summary.candidates.find((candidate) => candidate.observationType === "MODEL_OR_REFERENCE")!;
    const tag = summary.candidates.find((candidate) => candidate.observationType === "EQUIPMENT_TAG")!;
    expect(model.factKey).toBeNull();
    expect(tag.factKey).toBeNull();
    expect(model.origin?.textSource).toBe("OCR");
    expect(tag.origin?.textSource).toBe("OCR");
    const brief: ArtifactInspectionSummary = summary;
    // The brief denies approval/selection in plain words; it never affirms them.
    const en = renderInspectionBrief(brief, "en");
    expect(en).toContain("not approved quantities and not selected products");
    expect(en).not.toMatch(/system complete/iu);
    const ar = renderInspectionBrief(brief, "ar");
    expect(ar).toContain("وليست كميات معتمدة أو منتجات مختارة");
    expect(ar).not.toMatch(/النظام مكتمل/iu);
  });

  it("records an OCR conflict against governed state without overwriting it", async () => {
    const analysis = await analyzePdfBytesWithOcr(buildPdf([SCANNED_SHEET]), deterministicOcrEngine({ "page:1": DRAWING_SCAN }), {
      artifactId: "artifact-1",
    });
    const governedFacts = [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" as const }];
    const summary = projectArtifactInspection({ artifactId: "artifact-1", filename: "scan.pdf", kind: "PDF", analysis, governedFacts });
    expect(summary.conflicts).toHaveLength(1);
    expect(summary.conflicts[0]).toMatchObject({
      key: "project.name", governedValue: "Al Hamra Tower", governedProvenance: "USER_EXPLICIT", observedValue: "SEAFRONT TOWER",
    });
    expect(governedFacts[0]).toEqual({ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
    const candidate = summary.candidates.find((item) => item.observationType === "PROJECT_TITLE")!;
    expect(candidate.status).toBe(ARTIFACT_CANDIDATE_STATUS);
    expect(candidate.origin?.textSource).toBe("OCR");
  });

  it("surfaces low-confidence OCR as an explicit review limitation in both locales", async () => {
    const analysis = await analyzePdfBytesWithOcr(
      buildPdf([SCANNED_SHEET]),
      deterministicOcrEngine({ "page:1": { text: BOQ_SCAN, status: "LOW_CONFIDENCE", confidence: 0.3 } }),
      { artifactId: "artifact-1" },
    );
    const summary = projectArtifactInspection({ artifactId: "artifact-1", filename: "scan.pdf", kind: "PDF", analysis });
    expect(summary.ocr).toMatchObject({ used: true, lowConfidence: true });
    expect(renderInspectionBrief(summary, "en")).toContain("Some OCR results have low confidence; verify the wording against the original pages.");
    expect(renderInspectionBrief(summary, "ar")).toContain("بعض نتائج التعرف الضوئي منخفضة الثقة؛ تحقق من الصياغة مقابل الصفحات الأصلية.");
  });

  it("stays silent about confidence when OCR readings are confident", async () => {
    const summary = await ocrSummary([SCANNED_SHEET], { "page:1": BOQ_SCAN });
    expect(summary.ocr.lowConfidence).toBe(false);
    expect(renderInspectionBrief(summary, "en")).not.toContain("low confidence");
    expect(renderInspectionBrief(summary, "ar")).not.toContain("منخفضة الثقة");
  });
});
