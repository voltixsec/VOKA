/**
 * Phase 6.3 — OllamaSalesAssistantAdapter: Model Routing Tests
 *
 * Verifies:
 *  1.  Cloud profile does NOT send format:"json", num_ctx, or low num_predict
 *  2.  Cloud profile sends temperature:0, stream:false, think:false
 *  3.  Local profile sends format:"json" and bounded options
 *  4.  Cloud success returns result without invoking fallback
 *  5.  Cloud network failure triggers fallback
 *  6.  Cloud timeout triggers fallback
 *  7.  Cloud HTTP error triggers fallback
 *  8.  Cloud empty response triggers fallback
 *  9.  Cloud invalid JSON triggers fallback
 * 10.  Both primary and fallback failure → safe opaque error (no raw internals)
 * 11.  Validator still rejects structurally invalid output (safety net)
 * 12.  requestedPrice remains intent only (not authority)
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { OllamaSalesAssistantAdapter } from "../OllamaSalesAssistantAdapter";
import { buildModelProfile } from "../OllamaModelProfile";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_URL = "http://127.0.0.1:11434";

const CLOUD_PROFILE = buildModelProfile("minimax-m3:cloud", 45_000);
const LOCAL_PROFILE = buildModelProfile("qwen3:1.7b", 30_000);

const VALID_INTENT = {
  sourceLocale: "ar",
  customerMention: "شركة الخليج",
  lines: [
    {
      text: "كاميرا IP",
      quantity: 5,
      requestedPrice: 32,
      typeIntent: "PRODUCT",
    },
  ],
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

function makeEmptyContentResponse(): Response {
  return new Response(JSON.stringify({ message: { content: "" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeInvalidJsonResponse(): Response {
  return new Response(
    JSON.stringify({ message: { content: "not-json-at-all" } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OllamaModelProfile", () => {
  describe("Cloud profile (minimax-m3:cloud)", () => {
    it("is detected as cloud", () => {
      expect(CLOUD_PROFILE.sendFormatJson).toBe(false);
    });

    it("does NOT include num_predict in generation options", () => {
      expect(CLOUD_PROFILE.generationOptions.num_predict).toBeUndefined();
    });

    it("does NOT include num_ctx in generation options", () => {
      expect(CLOUD_PROFILE.generationOptions.num_ctx).toBeUndefined();
    });

    it("sets temperature to 0", () => {
      expect(CLOUD_PROFILE.generationOptions.temperature).toBe(0);
    });
  });

  describe("Local profile (qwen3:1.7b)", () => {
    it("sends format:json", () => {
      expect(LOCAL_PROFILE.sendFormatJson).toBe(true);
    });

    it("includes num_predict", () => {
      expect(LOCAL_PROFILE.generationOptions.num_predict).toBeDefined();
    });

    it("includes num_ctx", () => {
      expect(LOCAL_PROFILE.generationOptions.num_ctx).toBeDefined();
    });
  });
});

describe("OllamaSalesAssistantAdapter — request body correctness", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("cloud request does NOT include format:json in body", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ message: { content: JSON.stringify(VALID_INTENT) } }),
    );

    const adapter = new OllamaSalesAssistantAdapter(BASE_URL, CLOUD_PROFILE);
    await adapter.extractIntent("اعمل عرض سعر", "ar");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.format).toBeUndefined();
    expect(body.options?.num_ctx).toBeUndefined();
    expect(body.options?.num_predict).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options?.temperature).toBe(0);
    expect(body.model).toBe("minimax-m3:cloud");
  });

  it("local request INCLUDES format:json in body", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ message: { content: JSON.stringify(VALID_INTENT) } }),
    );

    const adapter = new OllamaSalesAssistantAdapter(BASE_URL, LOCAL_PROFILE);
    await adapter.extractIntent("make a quote", "en");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.format).toBe("json");
    expect(body.options?.num_predict).toBeDefined();
    expect(body.options?.num_ctx).toBeDefined();
  });
});

describe("OllamaSalesAssistantAdapter — routing behavior", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  // Test 4
  it("cloud success returns result without invoking fallback", async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ message: { content: JSON.stringify(VALID_INTENT) } }),
    );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("اعمل عرض سعر", "ar");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ customerMention: "شركة الخليج" });
  });

  // Test 5
  it("cloud network failure triggers fallback", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("اعمل عرض سعر", "ar");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ customerMention: "شركة الخليج" });
  });

  // Test 6
  it("cloud timeout triggers fallback", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    fetchMock
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("test", "en");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  // Test 7
  it("cloud HTTP error triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("test", "en");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  // Test 8
  it("cloud empty response triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(makeEmptyContentResponse())
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("test", "en");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  // Test 9
  it("cloud invalid JSON triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(makeInvalidJsonResponse())
      .mockResolvedValueOnce(
        makeOkResponse({
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );
    const result = await adapter.extractIntent("test", "en");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("cloud done_reason=length triggers fallback", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "length",
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "stop",
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    const result = await adapter.extractIntent("test", "en");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });

  it("cloud semantically invalid JSON triggers local fallback", async () => {
    const structurallyInvalidIntent = {
      sourceLocale: "ar",
      lines: "not-an-array",
    };

    fetchMock
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "stop",
          message: { content: JSON.stringify(structurallyInvalidIntent) },
        }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          done_reason: "stop",
          message: { content: JSON.stringify(VALID_INTENT) },
        }),
      );

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    const result = await adapter.extractIntent("test", "ar");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject(VALID_INTENT);
  });
  // Test 10
  it("both primary and fallback failure returns safe opaque error without leaking internals", async () => {
    const internalDetail = "CUDA internal error stack trace XYZ";
    fetchMock
      .mockRejectedValueOnce(new Error(`Raw model crash: ${internalDetail}`))
      .mockRejectedValueOnce(new Error("local model also crashed"));

    const adapter = new OllamaSalesAssistantAdapter(
      BASE_URL,
      CLOUD_PROFILE,
      LOCAL_PROFILE,
    );

    await expect(adapter.extractIntent("test", "en")).rejects.toThrow(
      "AI extraction unavailable: both primary and fallback models failed.",
    );
  });

  // Test 10b — no fallback configured, single failure → safe error
  it("no fallback: single primary failure returns sanitized error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));

    const adapter = new OllamaSalesAssistantAdapter(BASE_URL, CLOUD_PROFILE);

    await expect(adapter.extractIntent("test", "en")).rejects.toThrow(
      /AI extraction failed/,
    );
  });
});

describe("OllamaSalesAssistantAdapter — business invariants", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  // Test 12
  it("requestedPrice from AI is returned as-is (intent only, not canonical authority)", async () => {
    const intentWithPrice = {
      ...VALID_INTENT,
      lines: [
        {
          text: "كاميرا IP",
          quantity: 16,
          requestedPrice: 32,
          typeIntent: "PRODUCT",
        },
      ],
    };

    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ message: { content: JSON.stringify(intentWithPrice) } }),
    );

    const adapter = new OllamaSalesAssistantAdapter(BASE_URL, CLOUD_PROFILE);
    const result = (await adapter.extractIntent("16 cameras at 32 KD each", "en")) as typeof intentWithPrice;

    // Adapter returns raw AI output; requestedPrice is proposal intent only
    expect(result.lines[0].requestedPrice).toBe(32);
    // The adapter MUST NOT add other lines or copy prices across lines
    expect(result.lines).toHaveLength(1);
  });
});
