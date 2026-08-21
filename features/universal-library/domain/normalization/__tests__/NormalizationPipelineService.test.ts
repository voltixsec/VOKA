import { describe, it, expect } from "vitest";
import { NormalizationPipelineService } from "../NormalizationPipelineService";

describe("NormalizationPipelineService", () => {
  it("normalizes names, whitespace, unicode, and defaults type to PRODUCT", () => {
    const res = NormalizationPipelineService.normalize({
      name: "  Hikvision   DS-2CD2143G0-I   \u0041\u030a  ",
      nameEn: " Hikvision   Camera ",
      description: "  Full   HD   Camera  ",
    });

    expect(res.name).toBe("Hikvision DS-2CD2143G0-I \u00C5");
    expect(res.nameEn).toBe("Hikvision Camera");
    expect(res.type).toBe("PRODUCT");
    expect(res.description).toBe("Full HD Camera");
  });

  it("normalizes GTIN/EAN/UPC and MPN identifiers using UCL-2 rules", () => {
    const res = NormalizationPipelineService.normalize({
      name: "Test Item",
      identifiers: [
        { identifierType: "GTIN_13", value: " 0123456789012 " },
        { identifierType: "MPN", value: "  ds-2cd2143g0-i  " },
        { identifierType: "GTIN_13", value: "0123456789012" }, // Duplicate normalized GTIN value test
      ],
    });

    expect(res.identifiers).toHaveLength(2);
    expect(res.identifiers[0]).toEqual({
      identifierType: "GTIN_13",
      value: "0123456789012",
      normalizedValue: "0123456789012",
      source: null,
    });
    expect(res.identifiers[1]).toEqual({
      identifierType: "MPN",
      value: "ds-2cd2143g0-i",
      normalizedValue: "DS-2CD2143G0-I",
      source: null,
    });
  });

  it("normalizes unit strings deterministically", () => {
    const res = NormalizationPipelineService.normalize({
      name: "Cable Item",
      attributes: [
        { code: "WEIGHT", name: "Weight", dataType: "NUMBER", value: 10, unit: " KGs " },
        { code: "LENGTH", name: "Length", dataType: "NUMBER", value: 100, unit: " METERS " },
      ],
    });

    expect(res.attributes[0].unit).toBe("kg");
    expect(res.attributes[1].unit).toBe("m");
  });

  it("throws an error if no valid name is provided", () => {
    expect(() =>
      NormalizationPipelineService.normalize({
        name: "   ",
      })
    ).toThrow("Raw payload must provide at least one valid non-empty item name");
  });
});
