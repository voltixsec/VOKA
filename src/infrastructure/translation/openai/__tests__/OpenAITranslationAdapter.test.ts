import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAITranslationAdapter } from "../OpenAITranslationAdapter";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

function responseOutput(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
    }),
  };
}

describe("OpenAITranslationAdapter Responses API", () => {
  it("requires an API key", () => {
    expect(() => new OpenAITranslationAdapter({ apiKey: "" })).toThrow("valid API key");
  });
  it("short-circuits empty input without fetch", async () => {
    global.fetch = vi.fn();
    await expect(new OpenAITranslationAdapter({ apiKey: "x" }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [] })).resolves.toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("uses /v1/responses with strict structured output", async () => {
    global.fetch = vi.fn().mockResolvedValue(responseOutput({ item: "مرحبا" }));
    const result = await new OpenAITranslationAdapter({ apiKey: "test", model: "gpt-test" }).translateMany({
      sourceLocale: "en", targetLocale: "ar", items: [{ key: "item", text: "Hello" }],
    });
    expect(result).toEqual({ item: "مرحبا" });
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-test", text: { format: { type: "json_schema", name: "translation_result", strict: true } } });
    expect(body.messages).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(body.input[0].content[0].type).toBe("input_text");
  });
  it.each([
    ["ar", "en", "توريد CAT6", "Supply CAT6"],
    ["en", "ar", "Supply CAT6", "توريد CAT6"],
  ])("supports %s -> %s", async (sourceLocale, targetLocale, source, target) => {
    global.fetch = vi.fn().mockResolvedValue(responseOutput({ item: target }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x" }).translateMany({ sourceLocale, targetLocale, items: [{ key: "item", text: source }] })).resolves.toEqual({ item: target });
  });
  it("rejects unexpected and missing keys", async () => {
    const adapter = new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 0 });
    global.fetch = vi.fn().mockResolvedValue(responseOutput({ a: "A", extra: "X" }));
    await expect(adapter.translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "a" }] })).rejects.toThrow("key mismatch");
    global.fetch = vi.fn().mockResolvedValue(responseOutput({ a: "A" }));
    await expect(adapter.translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "a" }, { key: "b", text: "b" }] })).rejects.toThrow("key mismatch");
  });
  it("rejects malformed, missing, incomplete, and refused output without retry", async () => {
    const adapter = new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 2 });
    for (const payload of [
      { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }] },
      { status: "completed", output: [] },
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] },
      { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] },
    ]) {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
      await expect(adapter.translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }
  });
  it.each([400, 401])("does not retry HTTP %s", async (status) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: { message: "hidden" } }) });
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 2 }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).rejects.toThrow(`HTTP ${status}`);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry malformed client-error JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => { throw new SyntaxError("bad json"); } });
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 2 }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).rejects.toThrow("HTTP 400");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed response envelopes without retry", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "completed", output: {} }) });
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 2 }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).rejects.toThrow("malformed output");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500])("retries transient HTTP %s", async (status) => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status, json: async () => ({}) })
      .mockResolvedValueOnce(responseOutput({ a: "مرحبا" }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 1 }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).resolves.toEqual({ a: "مرحبا" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it("retries timeout/network failure", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new DOMException("timeout", "AbortError")).mockResolvedValueOnce(responseOutput({ a: "Bonjour" }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 1 }).translateMany({ sourceLocale: "en", targetLocale: "fr", items: [{ key: "a", text: "Hello" }] })).resolves.toEqual({ a: "Bonjour" });
  });
  it("does not retry protected-token corruption", async () => {
    global.fetch = vi.fn().mockResolvedValue(responseOutput({ a: "camera ds-2cd2143g2-i" }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x", maxRetries: 2 }).translateMany({ sourceLocale: "en", targetLocale: "ar", items: [{ key: "a", text: "Camera DS-2CD2143G2-I" }] })).rejects.toThrow("corrupted protected tokens");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid locale before fetch", async () => {
    global.fetch = vi.fn();
    await expect(new OpenAITranslationAdapter({ apiKey: "x" }).translateMany({ sourceLocale: "invalid_locale", targetLocale: "ar", items: [{ key: "a", text: "Hello" }] })).rejects.toThrow("Invalid translation locale");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
