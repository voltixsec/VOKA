// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { resolveVoiceLocale } from "../useVoiceInput";

describe("useVoiceInput resolveVoiceLocale", () => {
  it("resolves Arabic application locale to ar-KW speech recognition locale", () => {
    expect(resolveVoiceLocale("ar")).toBe("ar-KW");
    expect(resolveVoiceLocale("AR")).toBe("ar-KW");
    expect(resolveVoiceLocale("ar-SA")).toBe("ar-KW");
  });

  it("resolves English application locale to en-US speech recognition locale", () => {
    expect(resolveVoiceLocale("en")).toBe("en-US");
    expect(resolveVoiceLocale("EN")).toBe("en-US");
    expect(resolveVoiceLocale("en-GB")).toBe("en-US");
  });

  it("defaults to en-US when undefined", () => {
    expect(resolveVoiceLocale(undefined)).toBe("en-US");
  });
});
