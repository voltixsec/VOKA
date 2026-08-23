import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAITranslationAdapter } from "../OpenAITranslationAdapter";

describe("OpenAITranslationAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws an error if instantiated without an API key", () => {
    expect(() => new OpenAITranslationAdapter({ apiKey: "" })).toThrow(
      "OpenAITranslationAdapter requires a valid API key.",
    );
  });

  it("returns empty result immediately for empty items array", async () => {
    const adapter = new OpenAITranslationAdapter({ apiKey: "test-key" });
    const result = await adapter.translateMany({
      sourceLocale: "en",
      targetLocale: "ar",
      items: [],
    });
    expect(result).toEqual({});
  });

  it("translates items successfully with strict JSON schema response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                item_1: "توريد مزود الطاقة APC LR1250I UPS, الكمية 10",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const adapter = new OpenAITranslationAdapter({
      apiKey: "test-key",
      model: "gpt-5.6-sol",
    });

    const result = await adapter.translateMany({
      sourceLocale: "en",
      targetLocale: "ar",
      items: [
        {
          key: "item_1",
          text: "Supply APC LR1250I UPS, Qty 10",
        },
      ],
    });

    expect(result).toEqual({
      item_1: "توريد مزود الطاقة APC LR1250I UPS, الكمية 10",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        },
      }),
    );
  });

  it("fails safely when protected commercial tokens are mutated or lost in output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                item_1: "كاميرا مراقبة بدقة عالية", // lost DS-2CD2143G2-I and 8TB
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const adapter = new OpenAITranslationAdapter({
      apiKey: "test-key",
      maxRetries: 0,
    });

    await expect(
      adapter.translateMany({
        sourceLocale: "en",
        targetLocale: "ar",
        items: [
          {
            key: "item_1",
            text: "Hikvision DS-2CD2143G2-I 4MP camera with 8TB HDD",
          },
        ],
      }),
    ).rejects.toThrow("corrupted protected tokens");
  });

  it("retries on temporary failure up to maxRetries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: { message: "Server busy" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  item_1: "Bonjour",
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
      });

    global.fetch = fetchMock;

    const adapter = new OpenAITranslationAdapter({
      apiKey: "test-key",
      maxRetries: 1,
      enforceProtectedTokens: false,
    });

    const result = await adapter.translateMany({
      sourceLocale: "en",
      targetLocale: "fr",
      items: [{ key: "item_1", text: "Hello" }],
    });

    expect(result).toEqual({ item_1: "Bonjour" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
