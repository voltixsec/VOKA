import { describe, expect, it } from "vitest";
import {
  arabicLimitation,
  MAX_PROJECTED_DXF_BLOCKS,
  MAX_PROJECTED_DXF_CANDIDATES,
  MAX_PROJECTED_DXF_CITATIONS,
  MAX_PROJECTED_DXF_ENTITIES,
  MAX_PROJECTED_DXF_LAYERS,
  emptyProjectedDxf,
  projectDxfAnalysis,
  projectDxfInspection,
  renderDxfBrief,
} from "@/src/application/source-artifacts";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf";
import {
  conflictingSemanticsDrawing,
  drawingWithoutUnits,
  fullDrawing,
  largeDrawing,
  manyBlocksDrawing,
  manyLayersDrawing,
  paperSpaceDrawing,
  xrefDrawing,
} from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";

/**
 * Phase 2A-7 test matrix items 52-55: bounded assistant projection and truthful
 * English and Arabic briefs.
 *
 * Two things are pinned here. First, size: a drawing with thousands of entities
 * must still produce a small, reviewable projection. Second, language: every
 * internal token — MODEL_SPACE, ENTITY_ON_LAYER, OBSERVED_NOT_APPROVED,
 * BLOCK_NAME_SEMANTIC_CANDIDATE — is translated into plain words before it can
 * reach a user, in both languages.
 */

const analysis = () => analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"), { filename: "site.dxf" });
const summary = (locale: "ar" | "en" = "en") => {
  const projected = projectDxfInspection({ artifactId: "artifact-1", filename: "site.dxf", analysis: analysis() });
  return { projected, brief: renderDxfBrief(projected, locale) };
};

describe("DXF projection bounds", () => {
  it("projects a bounded record no matter how large the drawing is", () => {
    const projected = projectDxfAnalysis(analyzeDxfBytes(Buffer.from(largeDrawing(4_000), "latin1")));
    expect(projected.entityCount).toBe(4_000);
    expect(projected.entities.length).toBeLessThanOrEqual(MAX_PROJECTED_DXF_ENTITIES);
    expect(projected.layers.length).toBeLessThanOrEqual(MAX_PROJECTED_DXF_LAYERS);
    expect(projected.blocks.length).toBeLessThanOrEqual(MAX_PROJECTED_DXF_BLOCKS);
    expect(projected.candidates.length).toBeLessThanOrEqual(MAX_PROJECTED_DXF_CANDIDATES);
    expect(projected.citedLocators.length).toBeLessThanOrEqual(MAX_PROJECTED_DXF_CITATIONS);
    expect(projected.truncated).toBe(true);
  });

  it("keeps model space and paper space as separate projected records", () => {
    const projected = projectDxfAnalysis(analysis());
    expect(projected.modelSpaceEntityCount).toBe(13);
    expect(projected.paperSpaceEntityCount).toBe(2);
    const paper = projected.spaces.find((space) => space.space === "PAPER_SPACE")!;
    expect(paper.layoutName).toBe("Layout1");
    expect(paper.label).toBe("paper space");
    expect(paper.labelArabic).toBe("فضاء الورقة");
  });

  it("carries exact CAD locators and never a page number", () => {
    const projected = projectDxfAnalysis(analysis());
    expect(projected.citedLocators).toContain("DXF:LAYER=FIRE_ALARM");
    expect(projected.citedLocators).toContain("DXF:BLOCKS:block=SD");
    expect(projected.citedLocators).toContain("DXF:MODEL_SPACE");
    for (const locator of projected.citedLocators) expect(locator.startsWith("DXF:")).toBe(true);
    expect(projected).not.toHaveProperty("pageNumber");
    // The summary that carries citations keeps pageCount null for a drawing.
    const { projected: summaryRecord } = summary();
    expect(summaryRecord.pageCount).toBeNull();
  });

  it("states the CAD governance rather than the generic document promise", () => {
    const { projected } = summary();
    expect(projected.kind).toBe("DXF");
    expect(projected.governance.join(" ")).toContain("no dimension was recalculated or verified");
    expect(projected.governance.join(" ")).toContain("never inferred from coordinates");
    expect(projected.governance.join(" ")).toContain("no equipment was counted");
  });

  it("returns an empty projection rather than a fabricated one when there is no analysis", () => {
    const projected = projectDxfAnalysis(null);
    expect(projected).toEqual(emptyProjectedDxf());
    expect(projected.attempted).toBe(false);
    const unavailable = projectDxfInspection({ artifactId: "a", filename: "site.dwg", analysis: null, status: "UNAVAILABLE", failure: "the file is a binary DWG drawing" });
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(unavailable.limitations.join(" ")).toContain("binary DWG");
  });

  it("exposes corroboration as evidence kinds, not instance counts", () => {
    const projected = projectDxfAnalysis(analysis());
    const smoke = projected.candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    expect(smoke.corroborationKinds).toBe(3);
    expect(smoke.evidenceKinds).toEqual(expect.arrayContaining(["a block name", "a layer name", "an attribute value"]));
    expect(smoke.evidenceKindsArabic.length).toBe(smoke.evidenceKinds.length);
  });
});

describe("English DXF brief", () => {
  it("describes the declared units truthfully", () => {
    expect(summary().brief).toContain("The drawing explicitly declares millimetres as its CAD units.");
  });

  it("says the units are unknown and uninferred when the drawing declares none", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(drawingWithoutUnits(), "latin1")) });
    const brief = renderDxfBrief(projected, "en");
    expect(brief).toContain("does not declare its CAD units");
    expect(brief).toContain("did not infer them from coordinates, extents, or project settings");
  });

  it("describes a semantic candidate as reviewable evidence, not an approval", () => {
    const brief = summary().brief;
    expect(brief).toContain("Smoke Detector");
    expect(brief).toContain("reviewable drawing evidence, not as an approved equipment selection or a quantity");
  });

  it("describes a dimension as the drawing's own stored value", () => {
    expect(summary().brief).toContain("The drawing stores a dimension value of 1000 as its own metadata");
    expect(summary().brief).toContain("did not re-measure or verify it");
  });

  it("discloses an external CAD reference it did not open", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(xrefDrawing(), "latin1")) });
    const brief = renderDxfBrief(projected, "en");
    expect(brief).toContain("references an external CAD file named 'REMOTE_XREF'");
    expect(brief).toContain("which I did not open and did not fetch");
  });

  it("keeps model space and paper space apart in the prose", () => {
    const brief = summary().brief;
    expect(brief).toContain("Model space holds 13 entities and 2 in paper space (Layout1)");
    expect(brief).toContain("I kept model space and paper space separate");
  });

  it("states that nothing was counted or created", () => {
    const brief = summary().brief;
    expect(brief).toContain("No equipment was counted from this drawing");
    expect(brief).toContain("no quantity, requirement, bill of materials, quotation line, or procurement record was created");
  });

  it("discloses conflicting readings without choosing one", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(conflictingSemanticsDrawing(), "latin1")) });
    const brief = renderDxfBrief(projected, "en");
    expect(brief).toContain("Smoke Detector");
    expect(brief).toContain("Heat Detector");
    expect(brief).toContain("did not prefer one over another");
  });

  it("discloses truncation when the drawing was bounded", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "big.dxf", analysis: analyzeDxfBytes(Buffer.from(largeDrawing(4_000), "latin1")) });
    expect(renderDxfBrief(projected, "en")).toContain("truncated view rather than the whole file");
  });
});

describe("Arabic DXF brief", () => {
  it("describes the declared units in natural Arabic", () => {
    expect(summary("ar").brief).toContain("يُصرّح المخطط صراحةً بأن وحدة القياس فيه هي مليمتر");
    expect(summary("ar").brief).toContain("لم أحوّل أي وحدة");
  });

  it("says the units are unknown in natural Arabic", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(drawingWithoutUnits(), "latin1")) });
    const brief = renderDxfBrief(projected, "ar");
    expect(brief).toContain("لا يُصرّح المخطط بوحدات القياس");
    expect(brief).toContain("لم أستنتجها من الإحداثيات");
  });

  it("describes a semantic candidate as reviewable, not approved", () => {
    const brief = summary("ar").brief;
    expect(brief).toContain("Smoke Detector");
    expect(brief).toContain("كدليل قابل للمراجعة من المخطط، وليس كاختيار معدّة معتمد ولا ككمية");
  });

  it("discloses an unopened external CAD reference", () => {
    const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(xrefDrawing(), "latin1")) });
    const brief = renderDxfBrief(projected, "ar");
    expect(brief).toContain("يُشير المخطط إلى ملف CAD خارجي");
    expect(brief).toContain("ولم أفتحه ولم أجلبه");
  });

  it("states that nothing was counted or created", () => {
    const brief = summary("ar").brief;
    expect(brief).toContain("لم يُحصر أي معدّة من هذا المخطط");
    expect(brief).toContain("ولم يُنشأ أي كمية أو متطلب أو جدول مواد أو بند عرض سعر أو سجل توريد");
  });
});

describe("no internal enum leakage", () => {
  const FORBIDDEN_TOKENS = [
    "MODEL_SPACE", "PAPER_SPACE", "UNKNOWN_SPACE", "ENTITY_ON_LAYER", "ENTITY_IN_BLOCK",
    "INSERT_REFERENCES_BLOCK", "ATTRIBUTE_ON_INSERT", "ATTRIBUTE_DEFINITION_IN_BLOCK",
    "TEXT_NEAR_ENTITY_CANDIDATE", "BLOCK_NAME_SEMANTIC_CANDIDATE", "LAYER_NAME_SEMANTIC_CANDIDATE",
    "OBSERVED_NOT_APPROVED", "BLOCK_NAME", "LAYER_NAME", "ATTRIBUTE_VALUE", "NEARBY_TEXT",
    "REPEATED_LABEL", "ASCII_DXF", "GROUP_67", "OWNER_HANDLE", "SECTION_CONVENTION",
    "INSPECTED_NO_MACHINE_READABLE_TEXT",
  ];

  for (const locale of ["en", "ar"] as const) {
    it(`prints no internal token in the ${locale} brief`, () => {
      for (const fixture of [fullDrawing, drawingWithoutUnits, xrefDrawing, conflictingSemanticsDrawing]) {
        const projected = projectDxfInspection({ artifactId: "a", filename: "site.dxf", analysis: analyzeDxfBytes(Buffer.from(fixture(), "latin1")) });
        const brief = renderDxfBrief(projected, locale);
        for (const token of FORBIDDEN_TOKENS) expect(brief).not.toContain(token);
      }
    });
  }

  it("keeps structured tokens in the structured record and plain words in the prose", () => {
    const projected = projectDxfAnalysis(analysis());
    // The structured projection keeps machine tokens, which is correct: it is
    // consumed by code, not read aloud.
    expect(projected.spaces.map((space) => space.space)).toContain("MODEL_SPACE");
    expect(projected.candidates[0]!.reliability).toMatch(/^(HIGH|MEDIUM|LOW)$/u);
    // The prose does not.
    expect(summary().brief).not.toContain("MODEL_SPACE");
    expect(summary().brief).toContain("model space");
  });
});

describe("Layer remainder sentence", () => {
  /**
   * The brief names at most four layers. Whatever is left has to be stated as a
   * number, and it has to be counted against the layers actually eligible to be
   * named. Counting against the drawing's total instead would fold the reserved
   * layer "0" — which the sentence deliberately omits — back into the remainder,
   * so the brief would promise a layer it had already decided not to name.
   */
  const briefFor = (namedLayerCount: number) =>
    summaryFor(manyLayersDrawing(namedLayerCount));
  const summaryFor = (doc: string) => {
    const projected = projectDxfInspection({
      artifactId: "artifact-1",
      filename: "many-layers.dxf",
      analysis: analyzeDxfBytes(Buffer.from(doc, "latin1"), { filename: "many-layers.dxf" }),
    });
    return { projected, en: renderDxfBrief(projected, "en"), ar: renderDxfBrief(projected, "ar") };
  };

  it("omits the remainder entirely when every eligible layer is named", () => {
    const { en } = briefFor(4);
    expect(en).toContain("I found the layers 'E-LAYER-01', 'E-LAYER-02', 'E-LAYER-03', 'E-LAYER-04'.");
    expect(en).not.toContain("and 0 more");
    expect(en).not.toContain("and others");
  });

  it("counts the remainder against the eligible layers, excluding the reserved layer", () => {
    // Six named layers plus the reserved layer "0". The remainder is two, not
    // three: the reserved layer is never counted as an unnamed layer.
    const { projected, en } = briefFor(6);
    expect(projected.dxf.layerCount).toBe(7);
    expect(en).toContain("and 2 more.");
    expect(en).not.toContain("and 3 more");
    expect(en).not.toContain("and others");
  });

  it("gives the remainder as a number in Arabic for every plural class the cap allows", () => {
    // The projection caps layers at MAX_PROJECTED_DXF_LAYERS, so these three are
    // the whole reachable range of the remainder sentence: one, a dual, and a
    // plural. Each is a different Arabic form.
    expect(briefFor(5).ar).toContain("وطبقة واحدة أخرى");
    expect(briefFor(6).ar).toContain("وطبقتين أخريين");
    expect(briefFor(8).ar).toContain("و3 طبقات أخرى");
    expect(briefFor(20).ar).toContain("و3 طبقات أخرى");
    // ...and the cap really is what bounds it, not the fixture.
    expect(briefFor(20).projected.dxf.layers.length).toBe(MAX_PROJECTED_DXF_LAYERS);
  });

  it("never leaves an open-ended 'and others' tail in either language", () => {
    for (const count of [1, 2, 4, 5, 6, 9, 15]) {
      const { en, ar } = briefFor(count);
      expect(en).not.toContain("and others");
      expect(ar).not.toContain("وغيرها");
    }
  });
});

describe("Arabic limitation rendering", () => {
  /**
   * The inspection layer records limitations as English prose, which is correct
   * for storage. But an Arabic brief that pastes that sentence in is
   * half-translated, so each one is rendered through the translation table.
   *
   * A four-letter Latin run is the test for a leak. VOKA, CAD, DXF and similar
   * are allowed: they are names and acronyms that stay in Latin script in normal
   * Arabic technical prose, not untranslated sentences.
   */
  const ALLOWED_LATIN = /^(VOKA|CAD|DXF|DWG|UTF|AutoCAD|INSUNITS|ACADVER|DWGCODEPAGE)$/;
  const englishLeak = (text: string) =>
    [...text.matchAll(/[A-Za-z][A-Za-z .,';()$%_-]{5,}/g)]
      .map((match) => match[0].trim())
      .filter((word) => !ALLOWED_LATIN.test(word));

  const arabicLimitationClause = (doc: string) => {
    const projected = projectDxfInspection({
      artifactId: "artifact-1",
      filename: "site.dxf",
      analysis: analyzeDxfBytes(Buffer.from(doc, "latin1"), { filename: "site.dxf" }),
    });
    const brief = renderDxfBrief(projected, "ar");
    return brief.slice(brief.indexOf("قيود:"));
  };

  it.each([
    ["a full drawing", fullDrawing()],
    ["a drawing with no declared units", drawingWithoutUnits()],
    ["a truncated drawing", largeDrawing(4_000)],
    ["a drawing with an external reference", xrefDrawing()],
    ["a drawing with conflicting readings", conflictingSemanticsDrawing()],
    ["a paper-space drawing", paperSpaceDrawing()],
  ])("leaves no English sentence in the Arabic limitation clause of %s", (_label, doc) => {
    expect(englishLeak(arabicLimitationClause(doc))).toEqual([]);
  });

  it("translates a known limitation rather than echoing it", () => {
    expect(arabicLimitation("the layer is frozen, so its content is hidden evidence"))
      .toBe("الطبقة مجمّدة، لذلك محتواها دليل مخفي");
  });

  it("carries the numbers and names across an interpolated limitation", () => {
    expect(arabicLimitation("only the first 12 of 400 vertices were retained"))
      .toBe("احتُفظ بأول 12 من 400 رأس فقط");
    expect(arabicLimitation("the drawing inserts the block 'SD' but defines no block with that name"))
      .toBe("يُدرج المخطط الكتلة 'SD' لكنه لا يعرّف كتلة بهذا الاسم");
  });

  it("replaces an unrecognised limitation with a truthful Arabic caveat instead of pasting English", () => {
    // A future limitation sentence will not be in the table yet. The reader must
    // still learn that a caveat exists — the fallback states it, and points at
    // the structured record where the full wording lives.
    const rendered = arabicLimitation("a brand new caveat nobody translated yet");
    expect(englishLeak(rendered)).toEqual([]);
    expect(rendered).not.toContain("brand new caveat");
    expect(rendered.length).toBeGreaterThan(10);
  });
});

describe("Block listing disclosure", () => {
  /**
   * The brief names at most four blocks. Stopping there without saying so would
   * be a silent truncation, and a bounded projection may not truncate silently.
   *
   * Two constraints shape the wording. The remainder is counted against the same
   * eligible set the names come from, so it can never promise blocks the sentence
   * already decided to omit. And it counts block DEFINITIONS in the BLOCKS table,
   * never insertions: this is how much of the listing was shown, not how much
   * equipment is on site.
   */
  const summaryFor = (blockCount: number) => {
    const projected = projectDxfInspection({
      artifactId: "artifact-1",
      filename: "blocks.dxf",
      analysis: analyzeDxfBytes(Buffer.from(manyBlocksDrawing(blockCount), "latin1"), { filename: "blocks.dxf" }),
    });
    return { projected, en: renderDxfBrief(projected, "en"), ar: renderDxfBrief(projected, "ar") };
  };

  const blocksSentence = (en: string) =>
    en.match(/The drawing defines the blocks[^.]*\./)?.[0] ?? "";

  it("says nothing extra when every eligible block is named", () => {
    const { en } = summaryFor(4);
    // Scoped to the blocks sentence. The candidates sentence separately says
    // "readings I have not listed here", so a whole-brief assertion here would
    // fail for a reason that has nothing to do with block truncation.
    const sentence = blocksSentence(en);
    expect(sentence).toBe(
      "The drawing defines the blocks 'DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'.",
    );
    expect(sentence).not.toContain("not listed here");
    expect(sentence).not.toContain("and others");
  });

  it("discloses the omitted block definitions in English, pluralised naturally", () => {
    expect(summaryFor(5).en).toContain(
      "plus 1 additional block definition not listed here.",
    );
    expect(summaryFor(6).en).toContain(
      "plus 2 additional block definitions not listed here.",
    );
    expect(summaryFor(7).en).toContain(
      "plus 3 additional block definitions not listed here.",
    );
  });

  it("discloses the omitted block definitions in Arabic, pluralised naturally", () => {
    expect(summaryFor(5).ar).toContain("بالإضافة إلى كتلة تعريف واحدة إضافية غير مذكورة هنا");
    expect(summaryFor(6).ar).toContain("بالإضافة إلى كتلتَي تعريف إضافيتين غير مذكورتين هنا");
    expect(summaryFor(7).ar).toContain("بالإضافة إلى 3 كتل تعريف إضافية غير مذكورة هنا");
  });

  it("counts the remainder against the eligible set the cap allows, not the file total", () => {
    // Twelve definitions are in the file, but the projection caps blocks at
    // MAX_PROJECTED_DXF_LAYERS-style MAX_PROJECTED_DXF_BLOCKS, so the remainder is
    // bounded by what the projection retained.
    const { projected, en } = summaryFor(12);
    expect(projected.dxf.blocks.length).toBe(MAX_PROJECTED_DXF_BLOCKS);
    expect(projected.dxf.blockCount).toBe(12);
    expect(en).toContain("plus 4 additional block definitions not listed here.");
    expect(en).not.toContain("plus 8 additional");
  });

  it("keeps the disclosure a listing count rather than an equipment count", () => {
    const { en, ar } = summaryFor(7);
    // The remainder is about definitions omitted from the listing, and the
    // sentence still refuses to treat a block name as a selection.
    expect(en).toContain("additional block definitions not listed here");
    expect(en).toContain("A block name is evidence of a name only, not an equipment selection.");
    expect(ar).toContain("غير مذكورة هنا");
    expect(ar).toContain("وليست اختياراً لمعدّة");
    expect(en).not.toMatch(/\d+ (detectors|devices|units|equipment)/i);
  });

  it("never leaves a silent or open-ended block list in either language", () => {
    for (const count of [1, 2, 4, 5, 6, 7, 12]) {
      const { en, ar } = summaryFor(count);
      expect(en).not.toContain("and others");
      expect(ar).not.toContain("وغيرها");
    }
  });
});
