import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslationPort } from "../createTranslationPort";
import { OpenAITranslationAdapter } from "../openai/OpenAITranslationAdapter";
import { OllamaTranslationAdapter } from "../ollama/OllamaTranslationAdapter";
import { GeminiTranslationAdapter } from "../gemini/GeminiTranslationAdapter";
import { GoogleCloudTranslationAdapter } from "../google/GoogleCloudTranslationAdapter";

describe("createTranslationPort factory", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.VOKA_TRANSLATION_PROVIDER;
    delete process.env.VOKA_AI_PROVIDER;
    delete process.env.VOKA_TRANSLATION_MODEL;
    delete process.env.VOKA_TRANSLATION_FALLBACK_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VOKA_TRANSLATION_OPENAI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY;
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it("returns null when no provider environment variables are set", () => {
    expect(createTranslationPort()).toBeNull();
  });

  it("routes to OpenAITranslationAdapter when VOKA_TRANSLATION_PROVIDER=openai and OPENAI_API_KEY is present", () => {
    process.env.VOKA_TRANSLATION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-key";
    process.env.VOKA_TRANSLATION_OPENAI_MODEL = "gpt-5.6-terra";

    const port = createTranslationPort();
    expect(port).toBeInstanceOf(OpenAITranslationAdapter);
  });

  it("gives the dedicated translation provider precedence over the legacy AI provider", () => {
    process.env.VOKA_TRANSLATION_PROVIDER = "openai";
    process.env.VOKA_AI_PROVIDER = "ollama";
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(createTranslationPort()).toBeInstanceOf(OpenAITranslationAdapter);
  });

  it("passes the dedicated OpenAI model override to the Responses API", async () => {
    process.env.VOKA_TRANSLATION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-key";
    process.env.VOKA_TRANSLATION_OPENAI_MODEL = "gpt-test-override";
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"item":"Bonjour"}' }] }] }),
    });
    try {
      await createTranslationPort()!.translateMany({ sourceLocale: "en", targetLocale: "fr", items: [{ key: "item", text: "Hello" }] });
      const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
      expect(body.model).toBe("gpt-test-override");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns null when OpenAI provider is requested but OPENAI_API_KEY is missing", () => {
    process.env.VOKA_TRANSLATION_PROVIDER = "openai";
    expect(createTranslationPort()).toBeNull();
  });

  it("routes to OllamaTranslationAdapter when VOKA_TRANSLATION_MODEL is configured", () => {
    process.env.VOKA_TRANSLATION_MODEL = "qwen3:1.7b";
    const port = createTranslationPort();
    expect(port).toBeInstanceOf(OllamaTranslationAdapter);
  });

  it("routes to legacy Gemini provider when VOKA_AI_PROVIDER=gemini and GEMINI_API_KEY is present", () => {
    process.env.VOKA_AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gemini-key";
    const port = createTranslationPort();
    expect(port).toBeInstanceOf(GeminiTranslationAdapter);
  });

  it("routes to legacy Google Cloud provider when VOKA_AI_PROVIDER=google and API key is present", () => {
    process.env.VOKA_AI_PROVIDER = "google";
    process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY = "google-key";
    const port = createTranslationPort();
    expect(port).toBeInstanceOf(GoogleCloudTranslationAdapter);
  });
});
