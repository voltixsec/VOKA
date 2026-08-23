import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAITranslationAdapter } from "../OpenAITranslationAdapter";
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const response = (value: Record<string, string>) => ({ ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) });

describe("French architectural proof locale", () => {
  it.each([
    ["en", "fr", "Supply APC LR1250I, Qty 10", "Fourniture APC LR1250I, quantité 10"],
    ["fr", "en", "Fourniture APC LR1250I, quantité 10", "Supply APC LR1250I, quantity 10"],
  ])("supports %s -> %s", async (sourceLocale, targetLocale, text, translated) => {
    global.fetch = vi.fn().mockResolvedValue(response({ item: translated }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x" }).translateMany({ sourceLocale, targetLocale, items: [{ key: "item", text }] })).resolves.toEqual({ item: translated });
  });
});
