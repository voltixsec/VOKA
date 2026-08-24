import { describe, expect, it } from "vitest";
import { AISalesAssistantExtractor } from "../../ai-sales-assistant/services/AISalesAssistantExtractor";
import { SmartSystemBuilderService } from "../services/SmartSystemBuilderService";
import { QuotationCalculator } from "../../../domain/quotation";

describe("Smart System Builder adversarial intent boundary", () => {
  const builder = new SmartSystemBuilderService();
  const extractor = new AISalesAssistantExtractor();

  it("detects access control but requires explicit direction and installed cable allowance", () => {
    const incomplete = builder.detectSystemIntent("توريد وتركيب نظام تحكم في الدخول لعدد 4 أبواب");
    expect(incomplete?.systemType).toBe("ACCESS_CONTROL");
    expect(builder.calculateSystem(incomplete!.systemType, incomplete!.extractedParameters)?.status).toBe("NEEDS_CONFIRMATION");
    const complete = builder.detectSystemIntent("Install access control for 4 doors, entry only, 30 meters per door");
    const result = builder.calculateSystem(complete!.systemType, complete!.extractedParameters);
    expect(result?.status).toBe("COMPLETE");
    expect(result?.components.find((item) => item.componentKey === "ACCESS_CABLE")?.quantity).toBe(120);
  });

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

  describe("Mandatory Proof Cases Coverage", () => {
    it("Case 1: Flow A - CCTV Villa System request with installation", () => {
      const prompt = "عايز أعمل عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.systemType).toBe("CCTV");
      expect(intent.smartSystem?.status).toBe("COMPLETE");

      // Provenance checks
      const cameraInput = intent.smartSystem?.inputs.find(i => i.name === "cameraCount");
      expect(cameraInput).toMatchObject({ value: 8, provenance: "USER_PROVIDED" });

      const contextInput = intent.smartSystem?.inputs.find(i => i.name === "projectContext");
      expect(contextInput).toMatchObject({ value: "villa", provenance: "USER_PROVIDED" });

      const installInput = intent.smartSystem?.inputs.find(i => i.name === "includeInstallation");
      expect(installInput).toMatchObject({ value: true, provenance: "USER_PROVIDED" });

      // Component line checks & provenances
      const cameraLine = intent.lines.find(l => l.componentKey === "CCTV_CAMERAS");
      expect(cameraLine).toMatchObject({ quantity: 8, provenance: "USER_PROVIDED" });

      const nvrLine = intent.lines.find(l => l.componentKey === "NVR_RECORDER");
      expect(nvrLine).toMatchObject({ quantity: 1, provenance: "CALCULATED" });

      const cabinetLine = intent.lines.find(l => l.componentKey === "RACK_CABINET");
      expect(cabinetLine).toMatchObject({ quantity: 1, provenance: "SUGGESTED" });

      const installationLine = intent.lines.find(l => l.componentKey === "INSTALLATION_COMMISSIONING");
      expect(installationLine).toBeDefined();
      expect(installationLine?.quantity).toBe(8);
    });

    it("Case 2: Flow B - Gypsum Board Facade 2000m² request", () => {
      const prompt = "عايز عرض سعر توريد وتركيب واجهات جبس بورد لمساحة 2000 متر";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.systemType).toBe("GYPSUM_BOARD");
      expect(intent.smartSystem?.status).toBe("COMPLETE");

      const areaInput = intent.smartSystem?.inputs.find(i => i.name === "areaM2");
      expect(areaInput).toMatchObject({ value: 2000, provenance: "USER_PROVIDED" });

      const sheetsLine = intent.lines.find(l => l.componentKey === "GYPSUM_BOARDS");
      expect(sheetsLine).toBeDefined();
      expect(sheetsLine?.provenance).toBe("CALCULATED");
      // 2000 m² / (1.2 * 2.4) * 1 layer * 1.05 waste = 729.16 -> Math.ceil = 730
      expect(sheetsLine?.quantity).toBe(730);

      const laborLine = intent.lines.find(l => l.componentKey === "GYPSUM_LABOR");
      expect(laborLine).toBeDefined();
      expect(laborLine?.quantity).toBe(2000);
    });

    it("Case 3: Incomplete request 'عايز سيستم جبس بورد' returns NEEDS_CONFIRMATION", () => {
      const prompt = "عايز سيستم جبس بورد";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });

    it("Case 4: Invalid negative input 'جبس بورد -200 متر' returns INVALID_INPUT", () => {
      const prompt = "جبس بورد -200 متر";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("INVALID_INPUT");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });

    it("Case 5: Incomplete CCTV request 'اعمللي نظام كاميرات' returns NEEDS_CONFIRMATION", () => {
      const prompt = "اعمللي نظام كاميرات";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("cameraCount");
      expect(intent.lines).toHaveLength(0);
    });

    it("Case 6: Ordinary camera product quotation is NOT hijacked", () => {
      const prompt = "عايز عرض سعر كاميرا مراقبة 4K";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].text).toContain("كاميرا");
    });

    it("Case 7: Ordinary gypsum board product quotation is NOT hijacked", () => {
      const prompt = "اعمل عرض سعر 10 ألواح جبس بورد";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(10);
    });

    it("Case 8: Supply-only camera quotation 'عايز عرض سعر 8 كاميرات' does NOT fabricate installation", () => {
      const prompt = "عايز عرض سعر 8 كاميرات";
      const intent = extractor.heuristicExtract(prompt, "ar");

      // Ordinary quotation because no explicit CCTV system keyword or installation specified
      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(8);
      expect(intent.scopeType).toBeNull();
    });

    it("Case 9: AI provider attempting to return its own calculated quantities is bypassed for systems", async () => {
      const untrustedAIResponse = {
        sourceLocale: "ar" as const,
        lines: [
          { text: "Fake Camera", quantity: 999 },
        ],
      };
      const mockProvider = {
        extractIntent: async () => untrustedAIResponse,
      };

      const extractorWithAI = new AISalesAssistantExtractor(mockProvider);
      const result = await extractorWithAI.extractIntent("عايز أعمل عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا", "ar");

      expect(result.intent.smartSystem?.systemType).toBe("CCTV");
      expect(result.intent.lines.find(l => l.componentKey === "CCTV_CAMERAS")?.quantity).toBe(8);
      expect(result.warnings[0]).toContain("server-owned deterministic template");
    });

    it("Case 10: User edits calculated draft before quotation continuation", () => {
      const prompt = "عايز أعمل عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا";
      const intent = extractor.heuristicExtract(prompt, "ar");

      // User modifies calculated camera quantity from 8 to 12
      const cameraLine = intent.lines.find(l => l.componentKey === "CCTV_CAMERAS");
      expect(cameraLine).toBeDefined();
      cameraLine!.quantity = 12;

      // Ensure downstream canonical quotation calculation respects the human modification
      const modifiedLine = {
        position: 1,
        type: cameraLine!.typeIntent === "SERVICE" ? "SERVICE" as const : "PRODUCT" as const,
        catalogItemId: null,
        taxRateId: null,
        itemName: cameraLine!.text,
        unitName: cameraLine!.requestedUnitText ?? "Unit",
        quantity: cameraLine!.quantity as number,
        unitPrice: 50, // Human assigned price in composer
        taxPercentage: 0,
      };

      const calculated = QuotationCalculator.calculateLine(modifiedLine);
      expect(calculated.quantity).toBe(12);
      expect(calculated.subtotal).toBe(600); // 12 * 50
    });
  });
});
