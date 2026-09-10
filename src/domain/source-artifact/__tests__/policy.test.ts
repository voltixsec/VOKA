import { describe, expect, it } from "vitest";
import { validateSourceArtifactBytes } from "../index";

describe("source artifact content policy", () => {
  it("rejects PDF metadata whose bytes are not a PDF", () => {
    try {
      validateSourceArtifactBytes("PDF", Buffer.from("not really a pdf"));
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
    }
  });

  it("accepts real PDF and image signatures", () => {
    expect(() => validateSourceArtifactBytes("PDF", Buffer.from("%PDF-1.7\n"))).not.toThrow();
    expect(() => validateSourceArtifactBytes("IMAGE", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).not.toThrow();
    expect(() => validateSourceArtifactBytes("IMAGE", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).not.toThrow();
    expect(() => validateSourceArtifactBytes("IMAGE", Buffer.from("RIFF0000WEBP", "ascii"))).not.toThrow();
  });
});
