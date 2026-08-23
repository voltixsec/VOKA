import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAITranslationAdapter } from "../OpenAITranslationAdapter";
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const response = (value: Record<string, string>) => ({ ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) });

describe("Chinese architectural proof locale", () => {
  it.each([
    ["en", "zh-CN", "Supply APC LR1250I UPS, Qty 10, Unit Price KD 125.500, Discount 5%", "供应 APC LR1250I UPS，Qty 10，Unit Price KD 125.500，Discount 5%"],
    ["ar", "zh-CN", "توريد APC LR1250I UPS، عدد 10، السعر KD 125.500، خصم 5%", "供应 APC LR1250I UPS，数量 10，价格 KD 125.500，折扣 5%"],
    ["zh-CN", "en", "供应 APC LR1250I UPS，Qty 10，价格 KD 125.500，折扣 5%", "Supply APC LR1250I UPS, Qty 10, Price KD 125.500, Discount 5%"],
  ])("supports %s -> %s with exact commercial tokens", async (sourceLocale, targetLocale, text, translated) => {
    global.fetch = vi.fn().mockResolvedValue(response({ item: translated }));
    await expect(new OpenAITranslationAdapter({ apiKey: "x" }).translateMany({ sourceLocale, targetLocale, items: [{ key: "item", text }] })).resolves.toEqual({ item: translated });
  });
});
