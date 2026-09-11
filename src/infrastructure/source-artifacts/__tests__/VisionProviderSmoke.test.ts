import { describe, expect, it } from "vitest";

/**
 * Live smoke test for the production vision provider. It renders a PNG,
 * sends it to the configured OpenAI-compatible vision endpoint, and checks
 * the bounded result shape. Gated behind VOKA_VISION_SMOKE_TEST=1 plus a
 * configured provider, so the default suite stays fast and hermetic.
 */
const enabled = process.env.VOKA_VISION_SMOKE_TEST === "1";

describe.runIf(enabled)("live vision provider smoke (2A-3)", () => {
  it("inspects a rendered image through the production factory", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const { createProductionVisionPort } = await import("../vision/createProductionVisionPort");
    const { VISUAL_OBSERVATION_TYPES } = await import("@/src/domain/source-artifact");

    const provider = createProductionVisionPort();
    if (!provider) {
      console.info("vision smoke skipped: no vision provider is configured");
      return;
    }

    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = "#333333";
    ctx.fillRect(100, 100, 200, 150);
    ctx.fillStyle = "#000000";
    ctx.font = "40px sans-serif";
    ctx.fillText("grey enclosure", 350, 200);
    const png = canvas.toBuffer("image/png");

    const result = await provider.inspect({
      artifactId: "smoke",
      imageBytes: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
      mimeType: "image/png",
      pageNumber: null,
      reason: "smoke test",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.pageNumber).toBeNull();
    expect(result.observations.length).toBeGreaterThan(0);
    const vocabulary = new Set<string>(VISUAL_OBSERVATION_TYPES);
    for (const draft of result.observations) {
      expect(vocabulary.has(draft.type)).toBe(true);
      expect(draft.description.trim().length).toBeGreaterThan(0);
    }
  }, 120_000);
});
