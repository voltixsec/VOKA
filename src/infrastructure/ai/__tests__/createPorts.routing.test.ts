/**
 * Phase 6.3 — createSalesAssistantPort / createTranslationPort factory tests
 *
 * Verifies environment-variable-based model routing behavior.
 * Uses dynamic import() per test to pick up stubbed env vars.
 */

import { describe, expect, it, vi, afterEach } from "vitest";

describe("createSalesAssistantPort — environment routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when no provider is configured", async () => {
    vi.stubEnv("VOKA_SALES_AI_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "");
    vi.stubEnv("OLLAMA_BASE_URL", "");

    const { createSalesAssistantPort } = await import(
      "../createSalesAssistantPort"
    );
    expect(createSalesAssistantPort()).toBeNull();
  });

  it("returns adapter when VOKA_SALES_AI_MODEL is set", async () => {
    vi.stubEnv("VOKA_SALES_AI_MODEL", "minimax-m3:cloud");
    vi.stubEnv("VOKA_SALES_AI_FALLBACK_MODEL", "qwen3:1.7b");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");

    const { createSalesAssistantPort } = await import(
      "../createSalesAssistantPort"
    );
    const port = createSalesAssistantPort();
    expect(port).not.toBeNull();
    expect(port).toHaveProperty("extractIntent");
  });

  it("returns adapter for legacy VOKA_AI_PROVIDER=ollama", async () => {
    vi.stubEnv("VOKA_SALES_AI_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:1.7b");

    const { createSalesAssistantPort } = await import(
      "../createSalesAssistantPort"
    );
    const port = createSalesAssistantPort();
    expect(port).not.toBeNull();
    expect(port).toHaveProperty("extractIntent");
  });

  it("returns adapter for legacy OLLAMA_BASE_URL without provider", async () => {
    vi.stubEnv("VOKA_SALES_AI_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");

    const { createSalesAssistantPort } = await import(
      "../createSalesAssistantPort"
    );
    const port = createSalesAssistantPort();
    expect(port).not.toBeNull();
  });
});

describe("createTranslationPort — environment routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when no provider is configured", async () => {
    vi.stubEnv("VOKA_TRANSLATION_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "");

    const { createTranslationPort } = await import(
      "../../translation/createTranslationPort"
    );
    expect(createTranslationPort()).toBeNull();
  });

  it("returns adapter when VOKA_TRANSLATION_MODEL is set", async () => {
    vi.stubEnv("VOKA_TRANSLATION_MODEL", "minimax-m3:cloud");
    vi.stubEnv("VOKA_TRANSLATION_FALLBACK_MODEL", "qwen3:1.7b");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");

    const { createTranslationPort } = await import(
      "../../translation/createTranslationPort"
    );
    const port = createTranslationPort();
    expect(port).not.toBeNull();
    expect(port).toHaveProperty("translateMany");
  });

  it("returns adapter for legacy VOKA_AI_PROVIDER=ollama", async () => {
    vi.stubEnv("VOKA_TRANSLATION_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:1.7b");

    const { createTranslationPort } = await import(
      "../../translation/createTranslationPort"
    );
    const port = createTranslationPort();
    expect(port).not.toBeNull();
  });

  it("returns null for google provider without api key", async () => {
    vi.stubEnv("VOKA_TRANSLATION_MODEL", "");
    vi.stubEnv("VOKA_AI_PROVIDER", "google");
    vi.stubEnv("GOOGLE_CLOUD_TRANSLATION_API_KEY", "");

    const { createTranslationPort } = await import(
      "../../translation/createTranslationPort"
    );
    expect(createTranslationPort()).toBeNull();
  });
});
