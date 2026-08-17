/**
 * Phase 6.3 — OllamaTranslationAdapter: Model Routing Tests
 *
 * Verifies:
 * 13. Translation primary/fallback behavior
 * 14. Arabic UTF-8 content survives primary→fallback→result
 *  +  Cloud profile request options (no format:json, no num_predict ceiling)
 *  +  Local profile request options (format:json, bounded options)
 *  +  Primary success → no fallback invoked
 *  +  Network/timeout/HTTP/empty/invalid-JSON failure → fallback
 *  +  Both fail → safe opaque error
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { OllamaTranslationAdapter } from "../OllamaTranslationAdapter";
import { buildModelProfile } from "../../../ai/ollama/OllamaModelProfile";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_URL = "http://127.0.0.1:11434";
const CLOUD_PROFILE = buildModelProfile("minimax-m3:cloud", 45_000);
const LOCAL_PROFILE = buildModelProfile("qwen3:1.7b", 60_000);

const REQUEST_EN_TO_AR = {
  sourceLocale: "en" as const,
  targetLocale: "ar" as const,
  items: [
    { key: "subject", text: "CCTV Supply and Installation" },
    { key: "notes", text: "Payment within 30 days" },
  ],
};

const ARABIC_RESPONSE = {
  subject: "توريد وتركيب كاميرات المراقبة",
  notes: "الدفع خلال 30 يومًا",
};

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "server error" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OllamaTranslationAdapter — cloud request body", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("cloud request does NOT include format:json", async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({
        message: { content: JSON.stringify(ARABIC_RESPONSE) },
      }),
    );

    const adapter = new OllamaTranslationAdapter(BASE_URL, CLOUD_PROFILE);
    await adapter.translateMany(REQUEST_EN_TO_AR);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.format).toBeUndefined();
    expect(body.options?.num_ctx).toBeUndefined();
    expect(body.options?.num_predict).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(body.model).toBe("minimax-m3:cloud");
  });

  it("local request INCLUDES format:json and bounded options", async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({
        message: { content: JSON.stringify(ARABIC_RESPONSE) },
      }),
    );

    const adapter = new OllamaTranslationAdapter(BASE_URL, LOCAL_PROFILE);
    await adapter.translateMany(REQUEST_EN_TO_AR);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.format).toBe("json");
    expect(body.options?.num_predict).toBeDefined();
    expect(body.options?.num_ctx).toBeDefined();
  });
});

describe("OllamaTranslationAdapter — routing behavior", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  // Test 13a
  it("primary success returns result without invoking fallback", async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({
        message: { content: JSON.stringify(ARABIC_RESPONSE) },
      }),
    );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.subject).toBeDefined();
  });

  it("primary network failure triggers fallback", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.subject).toBeDefined();
  });

  it("primary timeout triggers fallback", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    fetchMock
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("primary HTTP error triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("primary empty response triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({ message: { content: "" } }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("primary invalid JSON triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({ message: { content: "{{invalid json" } }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("primary done_reason=length triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "length",
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "stop",
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(ARABIC_RESPONSE);
  });

  it("primary response with unexpected keys triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({
          message: {
            content: JSON.stringify({
              ...ARABIC_RESPONSE,
              unexpected: "must not be accepted",
            }),
          },
        }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(ARABIC_RESPONSE) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(ARABIC_RESPONSE);
  });
  it("both primary and fallback failure returns safe opaque error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("primary down"))
      .mockRejectedValueOnce(new Error("fallback down"));

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    await expect(adapter.translateMany(REQUEST_EN_TO_AR)).rejects.toThrow(
      "Translation unavailable: both primary and fallback models failed.",
    );
  });

  // Test 14 — Arabic UTF-8 content intact
  it("Arabic UTF-8 content is returned intact from primary", async () => {
    const arabicContent = {
      subject: "توريد وتركيب كاميرات المراقبة",
      notes: "الدفع خلال 30 يومًا",
    };

    fetchMock.mockResolvedValueOnce(
      makeOkResponse({
        message: { content: JSON.stringify(arabicContent) },
      }),
    );

    const adapter = new OllamaTranslationAdapter(BASE_URL, CLOUD_PROFILE);
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(result.subject).toBe("توريد وتركيب كاميرات المراقبة");
    expect(result.notes).toBe("الدفع خلال 30 يومًا");
  });

  it("Arabic UTF-8 content is returned intact from fallback", async () => {
    const arabicContent = {
      subject: "توريد وتركيب كاميرات المراقبة",
      notes: "الدفع خلال 30 يومًا",
    };

    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(arabicContent) },
        }),
      );

    const adapter = new OllamaTranslationAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.translateMany(REQUEST_EN_TO_AR);

    expect(result.subject).toBe("توريد وتركيب كاميرات المراقبة");
    expect(result.notes).toBe("الدفع خلال 30 يومًا");
  });

  // Test: empty items short-circuits without calling fetch
  it("empty items list returns empty result without calling fetch", async () => {
    const adapter = new OllamaTranslationAdapter(BASE_URL, CLOUD_PROFILE);
    const result = await adapter.translateMany({
      sourceLocale: "en",
      targetLocale: "ar",
      items: [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });
});
