import { describe, expect, it } from "vitest";
import {
  isValidLocale,
  normalizeLocale,
  getLocaleDisplayName,
} from "../ports/TranslationPort";

describe("TranslationPort Locale Utilities", () => {
  it("validates correct BCP-47 locale tags", () => {
    expect(isValidLocale("ar")).toBe(true);
    expect(isValidLocale("en")).toBe(true);
    expect(isValidLocale("fr")).toBe(true);
    expect(isValidLocale("en-US")).toBe(true);
    expect(isValidLocale("ar-KW")).toBe(true);
    expect(isValidLocale("zh-CN")).toBe(true);
  });

  it("rejects invalid locale tags", () => {
    expect(isValidLocale("")).toBe(false);
    expect(isValidLocale("   ")).toBe(false);
    expect(isValidLocale("123")).toBe(false);
    expect(isValidLocale("invalid_locale!")).toBe(false);
  });

  it("normalizes locales to lowercase trimmed format", () => {
    expect(normalizeLocale("  AR  ")).toBe("ar");
    expect(normalizeLocale("EN-US")).toBe("en-us");
    expect(normalizeLocale("Fr")).toBe("fr");
  });

  it("throws error when normalizing invalid locale", () => {
    expect(() => normalizeLocale("!!!")).toThrow("Invalid translation locale format");
  });

  it("resolves display names for supported and generic locales", () => {
    expect(getLocaleDisplayName("ar")).toBe("Arabic");
    expect(getLocaleDisplayName("en")).toBe("English");
    expect(getLocaleDisplayName("fr")).toBe("French");
    expect(getLocaleDisplayName("de")).toBe("German");
    expect(getLocaleDisplayName("hi")).toBe("Hindi");
    expect(getLocaleDisplayName("es")).toBe("Spanish");
    expect(getLocaleDisplayName("it")).toBe("it");
  });
});
