import { afterEach, expect, it, vi } from "vitest";
import { OpenAISalesAssistantAdapter } from "../OpenAISalesAssistantAdapter";
afterEach(() => vi.unstubAllGlobals());
it("uses Responses strict structured output without write tools or stored conversations", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"lines":[]}' }] }] }) });
  vi.stubGlobal("fetch", fetchMock);
  const adapter = new OpenAISalesAssistantAdapter("test-key", "configured-model");
  await expect(adapter.extractIntent("86 كاميرات", "ar")).resolves.toEqual({ lines: [] });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  expect(body).toMatchObject({ model: "configured-model", store: false, text: { format: { type: "json_schema", strict: true } } });
  expect(body.tools).toBeUndefined();
});
it("rejects incomplete/refused output rather than treating it as an empty successful draft", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "incomplete", output: [] }) }));
  await expect(new OpenAISalesAssistantAdapter("test-key", "configured-model").extractIntent("request", "en")).rejects.toThrow("COMMERCIAL_BRAIN_INCOMPLETE");
});
