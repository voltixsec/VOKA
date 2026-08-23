import { describe, expect, it } from "vitest";
import { getLocaleDisplayName, isValidLocale, normalizeLocale } from "../ports/TranslationPort";

describe("TranslationPort generic BCP-47 locale utilities", () => {
  it.each(["ar", "en-US", "fr-FR", "zh-CN", "zh-TW", "hi-IN", "de-DE", "sr-Latn-RS"])(
    "accepts arbitrary valid locale %s",
    (locale) => expect(isValidLocale(locale)).toBe(true),
  );
  it.each(["", "   ", "123", "invalid_locale!", "en--US", "this-subtag-is-far-too-long"])(
    "rejects invalid locale %s",
    (locale) => expect(isValidLocale(locale)).toBe(false),
  );
  it("uses standards-based canonical casing", () => {
    expect(normalizeLocale(" EN-us ")).toBe("en-US");
    expect(normalizeLocale("AR-kw")).toBe("ar-KW");
    expect(normalizeLocale("zh-cn")).toBe("zh-CN");
    expect(normalizeLocale("zh-tw")).toBe("zh-TW");
    expect(normalizeLocale("fr-fr")).toBe("fr-FR");
  });
  it("uses Intl.DisplayNames without a closed language switch", () => {
    expect(getLocaleDisplayName("ar")).toContain("Arabic");
    expect(getLocaleDisplayName("fr")).toContain("French");
    expect(getLocaleDisplayName("zh-CN")).toMatch(/Chinese/i);
    expect(getLocaleDisplayName("zh-TW")).toMatch(/Chinese/i);
  });
});
