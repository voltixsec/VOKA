import { describe, expect, it } from "vitest";
import {
  InvalidUniversalIdentifierError,
  normalizeUniversalIdentifier,
} from "../normalizeUniversalIdentifier";

describe("normalizeUniversalIdentifier", () => {
  it("normalizes and validates numeric global identifiers", () => {
    expect(normalizeUniversalIdentifier("GTIN_13", " 694-1218201234 ")).toEqual({
      normalizedValue: "6941218201234",
    });
    expect(() => normalizeUniversalIdentifier("GTIN_13", "ABC")).toThrow(
      InvalidUniversalIdentifierError
    );
    expect(() => normalizeUniversalIdentifier("UPC", "123")).toThrow(
      InvalidUniversalIdentifierError
    );
  });

  it("scopes manufacturer identifiers and normalizes case and whitespace", () => {
    expect(
      normalizeUniversalIdentifier("MPN", "  ds-2cd   2143  ", {
        manufacturerId: " mfg-1 ",
      })
    ).toEqual({
      normalizedValue: "DS-2CD 2143",
      manufacturerId: "mfg-1",
    });
  });

  it("requires and preserves source namespace and case for external IDs", () => {
    expect(
      normalizeUniversalIdentifier("EXTERNAL_ID", " AbC-123 ", {
        source: " vendor-a ",
      })
    ).toEqual({ normalizedValue: "AbC-123", source: "vendor-a" });
    expect(() => normalizeUniversalIdentifier("EXTERNAL_ID", "AbC-123")).toThrow(
      InvalidUniversalIdentifierError
    );
  });
});
