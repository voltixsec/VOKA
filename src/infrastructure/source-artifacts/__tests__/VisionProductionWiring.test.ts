import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import {
  DETERMINISTIC_VISION_PROVIDER_ID,
  MAX_VISUAL_DESCRIPTION,
  MAX_VISUAL_OBSERVATIONS,
  normalizeVisualDrafts,
  normalizeVisualRegion,
  shouldRequestVision,
  UNAVAILABLE_VISION_PROVIDER_ID,
  visualReliabilityFor,
  type VisualInspectionRequest,
  type VisualInspectionResult,
} from "@/src/domain/source-artifact";
import { deterministicVisionProvider } from "../vision/DeterministicVisionProvider";
import { unavailableVisionProvider } from "../vision/UnavailableVisionProvider";
import { OPENAI_COMPATIBLE_VISION_PROVIDER_ID, openAICompatibleVisionProvider } from "../vision/OpenAICompatibleVisionProvider";
import {
  createProductionVisionPort,
  resolveProductionVisionConfig,
  VISION_DEFAULT_BASE_URL,
  VISION_DEFAULT_MAX_IMAGE_BYTES,
  VISION_DEFAULT_TIMEOUT_MS,
  type ProductionVisionEnv,
} from "../vision/createProductionVisionPort";
import { analyzeImageBytesWithVision } from "../vision/ImageInspectionAnalyzer";
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES, pngBytesOfSize } from "./fixtures/imageFixtures";

const REQUEST: VisualInspectionRequest = {
  artifactId: "artifact-1",
  imageBytes: new Uint8Array(PNG_BYTES),
  mimeType: "image/png",
  pageNumber: null,
  reason: "test",
};

function tracking(provider: VisualInspectionPort): { calls: VisualInspectionRequest[]; provider: VisualInspectionPort } {
  const calls: VisualInspectionRequest[] = [];
  return {
    calls,
    provider: {
      providerId: provider.providerId,
      inspect: async (request) => {
        calls.push(request);
        return provider.inspect(request);
      },
    },
  };
}

describe("production vision resolution (2A-3)", () => {
  it("returns null when vision is not configured, keeping images undescribed", () => {
    expect(createProductionVisionPort({})).toBeNull();
    expect(createProductionVisionPort({ VOKA_VISION_PROVIDER: "" })).toBeNull();
    expect(createProductionVisionPort({ VOKA_VISION_PROVIDER: "off" })).toBeNull();
    expect(createProductionVisionPort({ VOKA_VISION_PROVIDER: "none" })).toBeNull();
    expect(createProductionVisionPort({ VOKA_VISION_PROVIDER: " OFF " })).toBeNull();
  });

  it("resolves the real OpenAI-compatible provider when fully configured", () => {
    const provider = createProductionVisionPort({
      VOKA_VISION_PROVIDER: "openai-compatible",
      VOKA_VISION_API_KEY: "key",
      VOKA_VISION_MODEL: "model",
    });
    expect(provider?.providerId).toBe(OPENAI_COMPATIBLE_VISION_PROVIDER_ID);
    expect(createProductionVisionPort({
      VOKA_VISION_PROVIDER: "OpenAI-Compatible",
      VOKA_VISION_API_KEY: "key",
      VOKA_VISION_MODEL: "model",
    })?.providerId).toBe(OPENAI_COMPATIBLE_VISION_PROVIDER_ID);
  });

  it("returns an explicit unavailable provider for unknown providers or missing key/model", async () => {
    expect(createProductionVisionPort({ VOKA_VISION_PROVIDER: "cloud-magic" })?.providerId).toBe(UNAVAILABLE_VISION_PROVIDER_ID);
    const noKey = createProductionVisionPort({ VOKA_VISION_PROVIDER: "openai-compatible", VOKA_VISION_MODEL: "m" });
    expect(noKey?.providerId).toBe(UNAVAILABLE_VISION_PROVIDER_ID);
    await expect(noKey!.inspect(REQUEST)).resolves.toMatchObject({ status: "UNAVAILABLE" });
    const noModel = createProductionVisionPort({ VOKA_VISION_PROVIDER: "openai-compatible", VOKA_VISION_API_KEY: "k" });
    expect(noModel?.providerId).toBe(UNAVAILABLE_VISION_PROVIDER_ID);
  });

  it("never resolves the deterministic test double under any environment", () => {
    const environments: Array<ProductionVisionEnv> = [
      {},
      { VOKA_VISION_PROVIDER: "openai-compatible", VOKA_VISION_API_KEY: "k", VOKA_VISION_MODEL: "m" },
      { VOKA_VISION_PROVIDER: "bogus" },
      { VOKA_VISION_PROVIDER: "deterministic-vision-test-double" },
      { VOKA_VISION_PROVIDER: "test" },
    ];
    for (const env of environments) {
      expect(createProductionVisionPort(env)?.providerId ?? null).not.toBe(DETERMINISTIC_VISION_PROVIDER_ID);
    }
  });

  it("keeps the deterministic provider out of production vision modules", () => {
    for (const file of ["createProductionVisionPort.ts", "OpenAICompatibleVisionProvider.ts", "ImageInspectionAnalyzer.ts", "UnavailableVisionProvider.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src/infrastructure/source-artifacts/vision", file), "utf8");
      expect(source).not.toContain("DeterministicVisionProvider");
      expect(source).not.toContain("deterministicVisionProvider(");
    }
  });

  it("resolves vision limits with safe defaults", () => {
    expect(VISION_DEFAULT_TIMEOUT_MS).toBe(60_000);
    expect(VISION_DEFAULT_MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(resolveProductionVisionConfig({})).toMatchObject({
      provider: "", baseUrl: VISION_DEFAULT_BASE_URL, model: "", timeoutMs: 60_000, maxImageBytes: 5 * 1024 * 1024,
    });
    expect(resolveProductionVisionConfig({
      VOKA_VISION_BASE_URL: "http://127.0.0.1:11434/v1",
      VOKA_VISION_MODEL: "llama3.2-vision",
      VOKA_VISION_TIMEOUT_MS: "10000",
      VOKA_VISION_MAX_IMAGE_BYTES: "1024",
    })).toMatchObject({ baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2-vision", timeoutMs: 10000, maxImageBytes: 1024 });
    expect(resolveProductionVisionConfig({ VOKA_VISION_TIMEOUT_MS: "0", VOKA_VISION_MAX_IMAGE_BYTES: "-3" }))
      .toMatchObject({ timeoutMs: 60_000, maxImageBytes: 5 * 1024 * 1024 });
  });
});

describe("vision gate (2A-3)", () => {
  const limit = VISION_DEFAULT_MAX_IMAGE_BYTES;
  it("requests vision for supported image types within the byte cap", () => {
    for (const mimeType of ["image/png", "image/jpeg", "image/webp"]) {
      const decision = shouldRequestVision({ mimeType, byteLength: 1024, maxImageBytes: limit });
      expect(decision.requested).toBe(true);
    }
  });

  it("refuses non-image, empty, and oversized bytes with a kept reason", () => {
    expect(shouldRequestVision({ mimeType: "application/pdf", byteLength: 10, maxImageBytes: limit }).requested).toBe(false);
    expect(shouldRequestVision({ mimeType: "image/png", byteLength: 0, maxImageBytes: limit }).requested).toBe(false);
    const oversized = shouldRequestVision({ mimeType: "image/png", byteLength: limit + 1, maxImageBytes: limit });
    expect(oversized.requested).toBe(false);
    expect(oversized.reason).toContain("exceeds");
  });
});

describe("visual draft normalization (2A-3)", () => {
  it("accepts bounded vocabulary drafts with vision provenance", () => {
    const { observations, dropped, limitations } = normalizeVisualDrafts(
      [{ type: "VISIBLE_OBJECT", description: "wall-mounted grey enclosure with a hinged door", confidence: 0.9, region: "upper-left" }],
      { providerId: "p" },
    );
    expect(dropped).toBe(0);
    expect(limitations).toEqual([]);
    expect(observations[0]).toMatchObject({
      type: "VISIBLE_OBJECT",
      value: "wall-mounted grey enclosure with a hinged door",
      status: "OBSERVED_NOT_APPROVED",
      pageNumber: null,
      attribution: "UNATTRIBUTED",
      reliability: "HIGH",
      visualOrigin: { source: "VISION", providerId: "p" },
    });
    expect(observations[0]!.evidence).toMatchObject({ locator: "image, upper-left", lineNumber: null });
    expect(observations[0]!.origin).toBeUndefined();
  });

  it("drops unknown types, text-vocabulary types, and empty descriptions instead of coercing them", () => {
    const { observations, dropped, limitations } = normalizeVisualDrafts(
      [
        { type: "QUANTITY", description: "4", confidence: 0.9 },
        { type: "MODEL_OR_REFERENCE", description: "FP-200", confidence: 0.9 },
        { type: "EXACT_PRODUCT_IDENTITY", description: "Acme FP-200", confidence: 0.9 },
        { type: "VISIBLE_OBJECT", description: "   ", confidence: 0.9 },
        { type: "VISIBLE_OBJECT", description: "grey enclosure", confidence: 0.9 },
      ],
      { providerId: "p" },
    );
    expect(observations).toHaveLength(1);
    expect(dropped).toBe(4);
    expect(limitations.join(" ")).toContain("outside the bounded visual vocabulary");
  });

  it("clips over-long descriptions with an explicit note", () => {
    const { observations } = normalizeVisualDrafts(
      [{ type: "VISUAL_CONTEXT", description: `${"x".repeat(MAX_VISUAL_DESCRIPTION + 50)}`, confidence: 0.9 }],
      { providerId: "p" },
    );
    expect(observations[0]!.value.length).toBe(MAX_VISUAL_DESCRIPTION + 1);
    expect(observations[0]!.limitations.join(" ")).toContain(`truncated to ${MAX_VISUAL_DESCRIPTION} characters`);
  });

  it("caps surviving observations at the safety limit", () => {
    const drafts = Array.from({ length: MAX_VISUAL_OBSERVATIONS + 5 }, (_, index) => ({
      type: "VISIBLE_OBJECT", description: `object ${index}`, confidence: 0.9,
    }));
    const { observations, dropped } = normalizeVisualDrafts(drafts, { providerId: "p" });
    expect(observations).toHaveLength(MAX_VISUAL_OBSERVATIONS);
    expect(dropped).toBe(5);
  });

  it("maps confidence onto reliability and defaults unknown regions to the whole image", () => {
    expect(visualReliabilityFor(0.95)).toBe("HIGH");
    expect(visualReliabilityFor(0.7)).toBe("MEDIUM");
    expect(visualReliabilityFor(0.2)).toBe("LOW");
    expect(visualReliabilityFor(null)).toBe("MEDIUM");
    expect(normalizeVisualRegion("top-left")).toBe("upper-left");
    expect(normalizeVisualRegion("somewhere near the thing")).toBeNull();
    const { observations } = normalizeVisualDrafts(
      [{ type: "VISIBLE_OBJECT", description: "enclosure", confidence: null, region: "somewhere near the thing" }],
      { providerId: "p" },
    );
    expect(observations[0]).toMatchObject({ reliability: "MEDIUM" });
    expect(observations[0]!.evidence.locator).toBe("image");
  });
});

describe("deterministic and unavailable providers (2A-3)", () => {
  it("serves fixtures by artifact id and observes nothing without one", async () => {
    const provider = deterministicVisionProvider({
      "artifact-1": [{ type: "IMAGE_TYPE_HINT", description: "screenshot", confidence: 0.95 }],
    });
    const result = await provider.inspect(REQUEST);
    expect(result).toMatchObject({ status: "COMPLETED", pageNumber: null, providerId: DETERMINISTIC_VISION_PROVIDER_ID });
    expect(result.observations).toHaveLength(1);
    const missing = await provider.inspect({ ...REQUEST, artifactId: "artifact-9" });
    expect(missing).toMatchObject({ status: "NO_USABLE_OBSERVATIONS", observations: [] });
  });

  it("supports full-result fixtures for failure cases", async () => {
    const provider = deterministicVisionProvider({ "artifact-1": { status: "FAILED", error: "boom" } });
    await expect(provider.inspect(REQUEST)).resolves.toMatchObject({ status: "FAILED", error: "boom", observations: [] });
  });

  it("carries the configuration reason through unavailable results", async () => {
    const result = await unavailableVisionProvider("VOKA_VISION_API_KEY is missing").inspect(REQUEST);
    expect(result).toMatchObject({ status: "UNAVAILABLE", observations: [], providerId: UNAVAILABLE_VISION_PROVIDER_ID });
    expect(result.limitations).toEqual(["VOKA_VISION_API_KEY is missing"]);
  });
});

describe("OpenAI-compatible provider wire mapping (2A-3, mocked fetch only)", () => {
  const options = { baseUrl: "https://vision.example/v1", apiKey: "key", model: "model" };

  function chatJson(content: string): Response {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }

  it("maps a chat-completions payload onto drafts and posts a bounded vision request", async () => {
    const fetchImpl = vi.fn(async () => chatJson(JSON.stringify({
      observations: [
        { type: "IMAGE_TYPE_HINT", description: "screenshot", confidence: 0.95, region: null, limitations: [] },
        { type: "VISIBLE_OBJECT", description: "settings dialog", confidence: 0.8, region: "center", limitations: [] },
      ],
    })));
    const result = await openAICompatibleVisionProvider({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch }).inspect(REQUEST);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://vision.example/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer key");
    const body = JSON.parse(init.body) as { model: string; response_format: { json_schema: { name: string } }; messages: unknown[] };
    expect(body.model).toBe("model");
    expect(body.response_format.json_schema.name).toBe("visual_inspection");
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,");
    expect(result).toMatchObject({ status: "COMPLETED", pageNumber: null, providerId: OPENAI_COMPATIBLE_VISION_PROVIDER_ID });
    expect(result.observations).toHaveLength(2);
    expect(result.reliability).toBe("HIGH");
  });

  it("converts HTTP, payload, timeout, and transport failures to FAILED, never a throw", async () => {
    const provider = (fetchImpl: unknown) => openAICompatibleVisionProvider({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider(async () => new Response("nope", { status: 500 })).inspect(REQUEST))
      .resolves.toMatchObject({ status: "FAILED", observations: [] });
    await expect(provider(async () => chatJson("not json{{")).inspect(REQUEST))
      .resolves.toMatchObject({ status: "FAILED", observations: [] });
    await expect(provider(async () => chatJson(JSON.stringify({ observations: "nope" }))).inspect(REQUEST))
      .resolves.toMatchObject({ status: "FAILED", observations: [] });
    await expect(provider(async () => { throw new Error("socket hang up"); }).inspect(REQUEST))
      .resolves.toMatchObject({ status: "FAILED", observations: [] });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const timedOut = await provider(async () => { throw timeout; }).inspect(REQUEST);
    expect(timedOut.status).toBe("FAILED");
    expect(timedOut.error).toContain("timed out");
    await expect(provider(async () => chatJson(JSON.stringify({ observations: [] }))).inspect(REQUEST))
      .resolves.toMatchObject({ status: "NO_USABLE_OBSERVATIONS" });
  });

  it("rejects incomplete options at construction", () => {
    expect(() => openAICompatibleVisionProvider({ ...options, apiKey: " " })).toThrow("API key");
    expect(() => openAICompatibleVisionProvider({ ...options, model: "" })).toThrow("model");
  });

  it("instructs the model never to guess identity from resemblance", () => {
    const fetchImpl = vi.fn(async () => chatJson(JSON.stringify({ observations: [] })));
    const provider = openAICompatibleVisionProvider({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    return provider.inspect(REQUEST).then(() => {
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
      const body = JSON.parse(init.body) as { messages: Array<{ content: string }> };
      const system = body.messages[0]!.content;
      expect(system).toContain("never guess a model from resemblance");
      expect(system).toContain("do not select products");
    });
  });
});

describe("image analyzer (2A-3)", () => {
  const analyzeOptions = { artifactId: "artifact-1", maxImageBytes: VISION_DEFAULT_MAX_IMAGE_BYTES };

  it("never calls the provider for gated-out bytes", async () => {
    const { calls, provider } = tracking(deterministicVisionProvider({}));
    const oversized = await analyzeImageBytesWithVision(
      new Uint8Array(pngBytesOfSize(VISION_DEFAULT_MAX_IMAGE_BYTES + 1)), "image/png", provider, analyzeOptions,
    );
    expect(calls).toHaveLength(0);
    expect(oversized.observations).toEqual([]);
    expect(oversized.vision).toMatchObject({ attempted: false, providerId: null });
    expect(oversized.limitations.join(" ")).toContain("exceeds");
    const pdf = await analyzeImageBytesWithVision(new Uint8Array(PNG_BYTES), "application/pdf", provider, analyzeOptions);
    expect(calls).toHaveLength(0);
    expect(pdf.vision?.attempted).toBe(false);
  });

  it("records vision as not attempted when no provider is configured", async () => {
    for (const [bytes, mimeType] of [[PNG_BYTES, "image/png"], [JPEG_BYTES, "image/jpeg"], [WEBP_BYTES, "image/webp"]] as const) {
      const analysis = await analyzeImageBytesWithVision(new Uint8Array(bytes), mimeType, null, analyzeOptions);
      expect(analysis.inspection.format).toBe("IMAGE");
      expect(analysis.classification).toBeNull();
      expect(analysis.observations).toEqual([]);
      expect(analysis.vision).toMatchObject({ attempted: false, providerId: null });
    }
  });

  it("normalizes provider drafts through the vocabulary boundary", async () => {
    const analysis = await analyzeImageBytesWithVision(
      new Uint8Array(PNG_BYTES),
      "image/png",
      deterministicVisionProvider({
        "artifact-1": [
          { type: "IMAGE_TYPE_HINT", description: "site photo", confidence: 0.95 },
          { type: "QUANTITY", description: "4", confidence: 0.9 },
        ],
      }),
      analyzeOptions,
    );
    expect(analysis.observations.map((item) => item.type)).toEqual(["IMAGE_TYPE_HINT"]);
    expect(analysis.vision).toMatchObject({ attempted: true, providerId: DETERMINISTIC_VISION_PROVIDER_ID });
  });

  it("forces pageNumber null even when a provider echoes an invented number", async () => {
    const rogue: VisualInspectionPort = {
      providerId: "rogue",
      inspect: async (request): Promise<VisualInspectionResult> => ({
        pageNumber: 7,
        observations: [{ type: "VISIBLE_OBJECT", description: "enclosure", confidence: 0.9 }],
        status: "COMPLETED",
        confidence: 0.9,
        reliability: "HIGH",
        providerId: "rogue",
        limitations: [],
        error: null,
      }),
    };
    const analysis = await analyzeImageBytesWithVision(new Uint8Array(PNG_BYTES), "image/png", rogue, analyzeOptions);
    expect(analysis.observations[0]).toMatchObject({ pageNumber: null, attribution: "UNATTRIBUTED" });
    expect(REQUEST.pageNumber).toBeNull();
  });

  it("contains provider failures and thrown errors as attempted-but-unused", async () => {
    const failing: VisualInspectionPort = {
      providerId: "failing",
      inspect: async () => { throw new Error("worker down"); },
    };
    const thrown = await analyzeImageBytesWithVision(new Uint8Array(PNG_BYTES), "image/png", failing, analyzeOptions);
    expect(thrown.observations).toEqual([]);
    expect(thrown.vision).toMatchObject({ attempted: true, providerId: "failing" });
    const unavailable = await analyzeImageBytesWithVision(new Uint8Array(PNG_BYTES), "image/png", unavailableVisionProvider("no key"), analyzeOptions);
    expect(unavailable.observations).toEqual([]);
    expect(unavailable.vision).toMatchObject({ attempted: true, providerId: UNAVAILABLE_VISION_PROVIDER_ID });
    expect(unavailable.limitations.join(" ")).toContain("unavailable");
  });
});
