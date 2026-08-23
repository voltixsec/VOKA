import { describe, expect, it } from "vitest";
import { AISalesAssistantExtractor } from "../../ai-sales-assistant/services/AISalesAssistantExtractor";
import { SmartSystemBuilderService } from "../services/SmartSystemBuilderService";

describe("Smart System Builder adversarial intent boundary", () => {
  const builder = new SmartSystemBuilderService();
  const extractor = new AISalesAssistantExtractor();

  it("derives the authorized Arabic CCTV request deterministically", () => {
    const prompt = "عايز عرض سعر توريد وتركيب 8 كاميرات لفيلا";
    const first = extractor.heuristicExtract(prompt, "ar");
    const second = extractor.heuristicExtract(prompt, "ar");
    expect(first).toEqual(second);
    expect(first.smartSystem).toMatchObject({ systemType: "CCTV", status: "COMPLETE" });
    expect(first.lines.find((line) => line.componentKey === "CCTV_CAMERAS")).toMatchObject({
      quantity: 8,
      provenance: "USER_PROVIDED",
      requestedPrice: null,
    });
  });

  it("derives the Arabic gypsum area without adding unrequested labor", () => {
    const intent = extractor.heuristicExtract("واجهات جبس بورد 2000 متر", "ar");
    expect(intent.smartSystem).toMatchObject({ systemType: "GYPSUM_BOARD", status: "COMPLETE" });
    expect(intent.lines.some((line) => line.componentKey === "GYPSUM_LABOR")).toBe(false);
  });

  it("preserves incomplete gypsum and CCTV requests as confirmation states", () => {
    for (const prompt of ["عايز سيستم جبس بورد", "اعمللي نظام كاميرات"]) {
      const intent = extractor.heuristicExtract(prompt, "ar");
      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.lines).toHaveLength(0);
    }
  });

  it("does not reinterpret a negative gypsum area as positive", () => {
    const match = builder.detectSystemIntent("جبس بورد -200 متر");
    expect(match?.extractedParameters.areaM2).toBe(-200);
    const intent = extractor.heuristicExtract("جبس بورد -200 متر", "ar");
    expect(intent.smartSystem?.status).toBe("INVALID_INPUT");
    expect(intent.lines).toHaveLength(0);
  });

  it("does not hijack an ordinary quotation request", () => {
    for (const prompt of [
      "اعمل عرض سعر 10 أجهزة NVR بسعر 120 د.ك",
      "Create a quotation for 10 gypsum boards",
      "اعمل عرض سعر توريد فقط 8 كاميرات",
    ]) {
      const intent = extractor.heuristicExtract(prompt, /[\u0600-\u06FF]/.test(prompt) ? "ar" : "en");
      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
    }
  });

  it("never calls the AI provider for engineering-system quantities", async () => {
    const provider = {
      extractIntent: async () => {
        throw new Error("provider must not be called");
      },
    };
    const guarded = new AISalesAssistantExtractor(provider);
    const result = await guarded.extractIntent("توريد وتركيب 8 كاميرات لفيلا", "ar");
    expect(result.intent.smartSystem?.systemType).toBe("CCTV");
    expect(result.warnings[0]).toContain("server-owned deterministic template");
  });
});
