import { describe, expect, it } from "vitest";
import type { VisualInspectionRequest } from "@/src/domain/source-artifact";
import { normalizeDrawingDrafts, normalizeVisualDrafts } from "@/src/domain/source-artifact";
import { deterministicVisionProvider, visionFixtureKeyFor } from "../vision/DeterministicVisionProvider";
import { openAICompatibleVisionProvider } from "../vision/OpenAICompatibleVisionProvider";
import { PNG_BYTES } from "./fixtures/imageFixtures";

/**
 * Phase 2A-4 provider boundary: the drawing profile rides the SAME
 * OpenAI-compatible production port with a bounded prompt/schema, the two
 * vocabularies stay disjoint, and the deterministic double keys per page
 * without ever inventing observations.
 */

function request(overrides: Partial<VisualInspectionRequest> = {}): VisualInspectionRequest {
  return {
    artifactId: "artifact-1",
    imageBytes: new Uint8Array(PNG_BYTES),
    mimeType: "image/png",
    pageNumber: 4,
    reason: "qualified drawing page",
    ...overrides,
  };
}

describe("drawing profile on the OpenAI-compatible provider", () => {
  it("the drawing request carries the drawing prompt and schema", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: unknown, init: { body?: string }) => {
      sent = JSON.parse(init.body ?? "{}");
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ observations: [] }) } }] }) };
    }) as unknown as typeof fetch;
    const provider = openAICompatibleVisionProvider({ baseUrl: "https://example.test/v1", apiKey: "key", model: "m", fetchImpl });
    await provider.inspect(request({ analysisProfile: "DRAWING_SEMANTICS" }));
    const system = String((sent.messages as Array<{ role: string; content: string }>).find((m) => m.role === "system")?.content ?? "");
    expect(system).toContain("SYMBOL_CANDIDATE");
    expect(system).toContain("never count symbols");
    expect(system).toContain("PRINTED_SCALE");
    expect(system).toContain("you must not use it to measure anything");
    expect(system).not.toContain("VISIBLE_OBJECT");
    const schema = sent.response_format as { json_schema: { name: string; schema: { properties: { observations: { items: { properties: { type: { enum: string[] } } } } } } } };
    expect(schema.json_schema.name).toBe("drawing_inspection");
    expect(schema.json_schema.schema.properties.observations.items.properties.type.enum).toContain("LEGEND_ENTRY");
    expect(schema.json_schema.schema.properties.observations.items.properties.type.enum).not.toContain("VISIBLE_BRAND");
    const userText = String((sent.messages as Array<{ role: string; content: Array<{ type: string; text?: string }> }>).find((m) => m.role === "user")?.content?.[0]?.text ?? "");
    expect(userText).toContain("drawing page");
    expect(Number(sent.max_tokens)).toBeLessThanOrEqual(1600);
  });

  it("the general request keeps the accepted 2A-3 prompt untouched", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: unknown, init: { body?: string }) => {
      sent = JSON.parse(init.body ?? "{}");
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ observations: [] }) } }] }) };
    }) as unknown as typeof fetch;
    const provider = openAICompatibleVisionProvider({ baseUrl: "https://example.test/v1", apiKey: "key", model: "m", fetchImpl });
    await provider.inspect(request());
    const system = String((sent.messages as Array<{ role: string; content: string }>).find((m) => m.role === "system")?.content ?? "");
    expect(system).toContain("VISIBLE_OBJECT");
    expect(system).not.toContain("LEGEND_ENTRY");
    const schema = sent.response_format as { json_schema: { name: string } };
    expect(schema.json_schema.name).toBe("visual_inspection");
  });

  it("maps endpoint failures truthfully without fabricating observations", async () => {
    const throwing = openAICompatibleVisionProvider({
      baseUrl: "https://example.test/v1", apiKey: "key", model: "m",
      fetchImpl: (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch,
    });
    await expect(throwing.inspect(request({ analysisProfile: "DRAWING_SEMANTICS" }))).resolves.toMatchObject({
      status: "FAILED",
      error: "the vision endpoint rejected the request (HTTP 503)",
      observations: [],
    });

    const notJson = openAICompatibleVisionProvider({
      baseUrl: "https://example.test/v1", apiKey: "key", model: "m",
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => { throw new Error("broken"); } })) as unknown as typeof fetch,
    });
    await expect(notJson.inspect(request({ analysisProfile: "DRAWING_SEMANTICS" }))).resolves.toMatchObject({ status: "FAILED" });
  });

  it("an empty drawing response is NO_USABLE_OBSERVATIONS with the drawing wording", async () => {
    const provider = openAICompatibleVisionProvider({
      baseUrl: "https://example.test/v1", apiKey: "key", model: "m",
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ observations: [] }) } }] }) })) as unknown as typeof fetch,
    });
    const result = await provider.inspect(request({ analysisProfile: "DRAWING_SEMANTICS" }));
    expect(result.status).toBe("NO_USABLE_OBSERVATIONS");
    expect(result.limitations.join(" ")).toContain("this drawing page");
  });
});

describe("vocabulary isolation between the two vision channels", () => {
  const base = { providerId: "p", artifactId: "a" };
  it("drawing types are dropped by the general visual normalizer", () => {
    const result = normalizeVisualDrafts([{ type: "LEGEND_ENTRY", description: "FD = fire damper" }], base);
    expect(result.observations).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });
  it("general visual types are dropped by the drawing normalizer", () => {
    const result = normalizeDrawingDrafts([{ type: "VISIBLE_PRODUCT", description: "a red pump" }], { ...base, pageNumber: 1, attribution: "PAGE_TREE", surface: "PAGE" });
    expect(result.observations).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });
  it("an endpoint that ignores the schema cannot smuggle prose into the domain", () => {
    const result = normalizeDrawingDrafts([
      { type: "NOTE", description: "This drawing appears to be a complete HVAC design with 37 smoke detectors arranged symmetrically across the floor plate and an implied load of 120 kW" },
      { type: "DRAWING_TYPE", description: "a beautifully technical looking sheet" },
    ], { ...base, pageNumber: 9, attribution: "PAGE_TREE", surface: "PAGE" });
    const note = result.observations.find((item) => item.type === "NOTE")!;
    expect(note.value.length).toBeLessThanOrEqual(201);
    const type = result.observations.find((item) => item.type === "DRAWING_TYPE")!;
    expect(type.value).toBe("unknown");
    expect(note.limitations.join(" ")).toContain("bounded visual reading");
  });
});

describe("deterministic drawing provider double", () => {
  it("keys fixtures per proven page number and never falls back for registered pages", async () => {
    expect(visionFixtureKeyFor({ artifactId: "a", pageNumber: 3 })).toBe("a:page:3");
    expect(visionFixtureKeyFor({ artifactId: "a", pageNumber: null })).toBe("a");
    const provider = deterministicVisionProvider({ "a:page:1": [{ type: "DRAWING_NUMBER", description: "X-1", confidence: 0.9 }] });
    const hit = await provider.inspect(request({ artifactId: "a", pageNumber: 1 }));
    expect(hit.status).toBe("COMPLETED");
    expect(hit.observations[0]!.type).toBe("DRAWING_NUMBER");
    const miss = await provider.inspect(request({ artifactId: "a", pageNumber: 2 }));
    expect(miss.status).toBe("NO_USABLE_OBSERVATIONS");
    expect(miss.observations).toHaveLength(0);
  });
});
