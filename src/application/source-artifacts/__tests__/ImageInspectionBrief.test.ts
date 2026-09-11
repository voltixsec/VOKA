import { describe, expect, it } from "vitest";
import {
  projectArtifactInspection,
  promoteArtifactCandidate,
  renderInspectionBrief,
  type ArtifactInspectionSummary,
} from "@/src/application/source-artifacts";
import { analyzeImageBytesWithVision } from "@/src/infrastructure/source-artifacts/vision/ImageInspectionAnalyzer";
import { deterministicVisionProvider, type DeterministicVisualFixture } from "@/src/infrastructure/source-artifacts/vision/DeterministicVisionProvider";
import { unavailableVisionProvider } from "@/src/infrastructure/source-artifacts/vision/UnavailableVisionProvider";
import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import { PNG_BYTES } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/imageFixtures";

const SITE_PHOTO: DeterministicVisualFixture = [
  { type: "IMAGE_TYPE_HINT", description: "site photo", confidence: 0.95 },
  { type: "VISIBLE_OBJECT", description: "wall-mounted grey enclosure with a hinged door", confidence: 0.88, region: "center" },
];

async function visionSummary(vision: VisualInspectionPort | null, artifactId = "artifact-1"): Promise<ArtifactInspectionSummary> {
  const analysis = await analyzeImageBytesWithVision(new Uint8Array(PNG_BYTES), "image/png", vision, {
    artifactId,
    maxImageBytes: 5 * 1024 * 1024,
  });
  const used = analysis.observations.some((observation) => observation.visualOrigin);
  return projectArtifactInspection({
    artifactId,
    filename: "panel.jpg",
    kind: "IMAGE",
    analysis,
    status: used ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT",
  });
}

/** Raw tokens that must never appear in assistant-facing prose. */
const LEAKED_TOKENS = [
  "VISIBLE_OBJECT",
  "VISIBLE_PRODUCT",
  "VISIBLE_BRAND",
  "VISIBLE_MODEL_REFERENCE",
  "IMAGE_TYPE_HINT",
  "VISIBLE_CONDITION",
  "VISUAL_CONTEXT",
  "OBSERVED_NOT_APPROVED",
  "OBSERVED_PENDING_APPROVAL",
  "UNATTRIBUTED",
  "INSPECTED_NO_MACHINE_READABLE_TEXT",
  "STORED_PENDING_VISION",
  "deterministic-vision-test-double",
  "vision-unavailable",
  "openai-compatible-vision",
];

describe("image inspection brief (2A-3)", () => {
  it("renders a human-readable English brief with visual observations", async () => {
    const summary = await visionSummary(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    expect(summary.vision).toMatchObject({ attempted: true, used: true, lowConfidence: false });
    expect(summary.classification).toBeNull();
    const brief = renderInspectionBrief(summary, "en");
    expect(brief).toContain('I read "panel.jpg" (inspected).');
    expect(brief).toContain("I inspected the image visually. The following are visual observations, not verified facts.");
    expect(brief).toContain("Observed visually: image type: site photo (image); visible object: wall-mounted grey enclosure with a hinged door (image, center).");
    expect(brief).toContain("These are observed values only, not approved quantities and not selected products.");
    expect(brief).not.toContain("Observed in text:");
    for (const token of LEAKED_TOKENS) expect(brief).not.toContain(token);
  });

  it("renders a human-readable Arabic brief with visual observations", async () => {
    const summary = await visionSummary(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    const brief = renderInspectionBrief(summary, "ar");
    expect(brief).toContain("فحصت الصورة بصرياً. ما يلي ملاحظات بصرية وليست حقائق مؤكدة.");
    expect(brief).toContain("ما رُصد بصرياً: نوع الصورة: site photo (image)؛ جسم ظاهر: wall-mounted grey enclosure with a hinged door (image, center).");
    expect(brief).toContain("هذه قيم مرصودة فقط، وليست كميات معتمدة أو منتجات مختارة.");
    expect(brief).not.toContain("Observed visually:");
    for (const token of LEAKED_TOKENS) expect(brief).not.toContain(token);
  });

  it("surfaces low-confidence visual output as an explicit review limitation in both locales", async () => {
    const summary = await visionSummary(deterministicVisionProvider({
      "artifact-1": [{ type: "VISIBLE_MODEL_REFERENCE", description: "marking that looks like FP-200", confidence: 0.2 }],
    }));
    expect(summary.vision.lowConfidence).toBe(true);
    expect(renderInspectionBrief(summary, "en")).toContain("Some visual observations have low confidence; verify them against the image itself.");
    expect(renderInspectionBrief(summary, "ar")).toContain("بعض الملاحظات البصرية منخفضة الثقة؛ تحقق منها مقابل الصورة نفسها.");
  });

  it("states the vision governance boundary instead of the no-interpretation baseline", async () => {
    const summary = await visionSummary(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    expect(summary.governance).toContain(
      "visual inspection produced bounded visual observations; they are not verified facts, and geometry interpretation was not performed",
    );
    expect(summary.governance.join(" ")).not.toContain("no OCR, image interpretation, or geometry interpretation was performed");
  });

  it("says truthfully when vision was attempted but produced nothing usable", async () => {
    const summary = await visionSummary(unavailableVisionProvider("no key"));
    expect(summary.vision).toMatchObject({ attempted: true, used: false });
    expect(renderInspectionBrief(summary, "en"))
      .toBe('I looked at the image "panel.jpg" but could not produce usable visual observations.');
    expect(renderInspectionBrief(summary, "ar"))
      .toBe('نظرت إلى الصورة "panel.jpg" لكن لم أتمكن من إنتاج ملاحظات بصرية قابلة للاستخدام.');
  });

  it("says truthfully when vision is not available", async () => {
    const summary = await visionSummary(null);
    expect(summary.vision).toMatchObject({ attempted: false, used: false });
    expect(renderInspectionBrief(summary, "en"))
      .toBe('I received the image "panel.jpg", but visual inspection is not available, so I cannot describe what it shows.');
    expect(renderInspectionBrief(summary, "ar"))
      .toBe('استلمت الصورة "panel.jpg"، لكن الفحص البصري غير متاح، لذلك لا أستطيع وصف ما يظهر فيها.');
  });

  it("never promotes a visual candidate, even on an explicit approval utterance", async () => {
    const summary = await visionSummary(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    for (const candidate of summary.candidates) {
      expect(candidate.factKey).toBeNull();
      expect(promoteArtifactCandidate(candidate, { userMessage: `approve ${candidate.value}`, now: "2026-09-11T00:00:00.000Z" })).toBeNull();
    }
  });
});
