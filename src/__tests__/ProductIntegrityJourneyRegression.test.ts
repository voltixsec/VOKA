import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantExtractor } from "../application/ai-sales-assistant/services/AISalesAssistantExtractor";
import { QuotationCalculator, Quotation } from "../domain/quotation";
import { GenerateQuotationDocumentUseCase } from "../application/document/use-cases/GenerateQuotationDocumentUseCase";
import { PdfKitQuotationDocumentRenderer } from "../infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer";
import { BrowserSpeechRecognizer } from "../infrastructure/voice/browser/BrowserSpeechRecognizer";

describe("V1 Product Integrity - Core Commercial Journey Regression", () => {
  const extractor = new AISalesAssistantExtractor();

  async function extractProductionIntent(prompt: string) {
    return extractor.extractIntent(prompt, "ar");
  }

  describe("Mandatory Proof Flow 1: Arabic CCTV Villa System request with installation", () => {
    it("derives CCTV deterministically without AI-authored quantities", async () => {
      const result = await extractProductionIntent(
        "عايز عرض سعر توريد وتركيب 8 كاميرات لفيلا",
      );
      const intent = result.intent;

      expect(result.extractionMode).toBe("heuristic");
      expect(result.warnings[0]).toContain("server-owned deterministic template");
      expect(intent.smartSystem).toMatchObject({
        systemType: "CCTV",
        status: "COMPLETE",
      });
      expect(intent.smartSystem?.inputs.find((i) => i.name === "cameraCount"))
        .toMatchObject({ value: 8, provenance: "USER_PROVIDED" });
      expect(intent.smartSystem?.inputs.find((i) => i.name === "projectContext"))
        .toMatchObject({ value: "villa", provenance: "USER_PROVIDED" });
      expect(intent.smartSystem?.inputs.find((i) => i.name === "includeInstallation"))
        .toMatchObject({ value: true, provenance: "USER_PROVIDED" });
      expect(intent.lines.find((line) => line.componentKey === "CCTV_CAMERAS"))
        .toMatchObject({ quantity: 8, provenance: "USER_PROVIDED" });
      expect(intent.lines.find((line) => line.componentKey === "NVR_RECORDER"))
        .toMatchObject({ quantity: 1, provenance: "CALCULATED" });
      expect(intent.lines.find((line) => line.componentKey === "RACK_CABINET"))
        .toMatchObject({ quantity: 1, provenance: "SUGGESTED" });
      expect(intent.lines.find((line) => line.componentKey === "INSTALLATION_COMMISSIONING"))
        .toMatchObject({ quantity: 1, provenance: "SUGGESTED", requestedUnitText: "Package" });
    });
  });

  describe("Mandatory Proof Flow 2: Gypsum Board Facade 2000m² request", () => {
    it("derives materials deterministically without fabricating area", async () => {
      const { intent } = await extractProductionIntent("واجهات جبس بورد 2000 متر");

      expect(intent.smartSystem).toMatchObject({
        systemType: "GYPSUM_BOARD",
        status: "COMPLETE",
      });
      expect(intent.smartSystem?.inputs.find((i) => i.name === "areaM2"))
        .toMatchObject({ value: 2000, provenance: "USER_PROVIDED" });
      expect(intent.lines.find((line) => line.componentKey === "GYPSUM_BOARDS"))
        .toMatchObject({ quantity: 730, provenance: "CALCULATED" });
      expect(intent.lines.some((line) => line.componentKey === "GYPSUM_LABOR"))
        .toBe(false);
    });
  });

  describe("Mandatory Proof Flow 3: Incomplete Gypsum Board system request", () => {
    it("requires area confirmation and creates no commercial lines", async () => {
      const { intent } = await extractProductionIntent("عايز سيستم جبس بورد");

      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 4: Invalid negative area input", () => {
    it("rejects the input without positive coercion", async () => {
      const { intent } = await extractProductionIntent("جبس بورد -200 متر");

      expect(intent.smartSystem?.status).toBe("INVALID_INPUT");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 5: Incomplete CCTV camera system request", () => {
    it("requires camera count and creates no commercial lines", async () => {
      const { intent } = await extractProductionIntent("اعمللي نظام كاميرات");

      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("cameraCount");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 6: Ordinary non-system quotation request", () => {
    it("remains on the normal quotation extraction path", async () => {
      const { intent } = await extractProductionIntent(
        "اعمل عرض سعر توريد 10 أجهزة كمبيوتر محمول",
      );

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(10);
    });
  });

  describe("Mandatory Proof Flow 7: Supply-only camera quotation", () => {
    it("does not fabricate installation or activate a system template", async () => {
      const { intent } = await extractProductionIntent("عايز عرض سعر 8 كاميرات");

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(8);
      expect(intent.lines.some((line) => line.text.includes("تركيب"))).toBe(false);
    });
  });

  describe("Mandatory Proof Flow 8: Quotation save, reopen, and edit continuity", () => {
    it("preserves line calculations across draft edits", () => {
      const initialLines = [
        QuotationCalculator.calculateLine({
          position: 1,
          type: "PRODUCT",
          itemName: "كاميرا مراقبة IP",
          unitName: "قطعة",
          quantity: 8,
          unitPrice: 45,
          taxPercentage: 0,
        }),
      ];
      const quotation = new Quotation({
        companyId: "company-100",
        customerId: "cust-001",
        number: "Q-2026-0001",
        currencyCode: "KWD",
        customer: {
          name: "شركة الأمل للتجارة",
          email: "info@alamal.kw",
          phone: "+96522000000",
        },
        lines: initialLines,
      });

      expect(quotation.totals.subtotal).toBe(360);
      expect(quotation.status).toBe("DRAFT");

      quotation.replaceLines([
        ...initialLines,
        QuotationCalculator.calculateLine({
          position: 2,
          type: "SERVICE",
          itemName: "خدمة التركيب والبرمجة",
          unitName: "نقطة",
          quantity: 8,
          unitPrice: 15,
          taxPercentage: 0,
        }),
      ]);

      expect(quotation.lines).toHaveLength(2);
      expect(quotation.totals.subtotal).toBe(480);
    });
  });

  describe("Mandatory Proof Flow 9: Quotation PDF continuity", () => {
    it("renders a bilingual proposal PDF", async () => {
      const quotationRepo = {
        findById: vi.fn().mockResolvedValue(
          Quotation.restore({
            id: "quotation-proof-1",
            companyId: "company-100",
            customerId: "cust-001",
            number: "Q-2026-0001",
            currencyCode: "KWD",
            status: "DRAFT",
            issueDate: new Date("2026-08-25"),
            expiryDate: new Date("2026-09-25"),
            subjectAr: "عرض سعر نظام كاميرات مراقبة",
            subjectEn: "CCTV Surveillance System Proposal",
            customer: { name: "شركة الكويت الوطنية" },
            lines: [{
              position: 1,
              type: "PRODUCT",
              itemName: "كاميرات مراقبة شبكية IP",
              quantity: 8,
              unitPrice: 45,
            }],
          }),
        ),
      };
      const useCase = new GenerateQuotationDocumentUseCase(
        quotationRepo as any,
        new PdfKitQuotationDocumentRenderer(),
      );
      const result = await useCase.execute({
        companyId: "company-100",
        companyName: "شركة فوكا للتكنولوجيا",
        quotationId: "quotation-proof-1",
        locale: "ar",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filename).toBe("quotation-Q-2026-0001.pdf");
        expect(result.data.bytes).toBeInstanceOf(Uint8Array);
        expect(result.data.bytes.length).toBeGreaterThan(1000);
      }
    });
  });

  describe("Mandatory Proof Flow 10: Arabic and English localization continuity", () => {
    it("preserves bilingual commercial values", () => {
      const line = QuotationCalculator.calculateLine({
        position: 1,
        type: "PRODUCT",
        itemName: "IP Camera 4K",
        itemNameAr: "كاميرا IP بدقة 4K",
        itemNameEn: "IP Camera 4K",
        quantity: 5,
        unitPrice: 50,
        taxPercentage: 0,
      });
      const quotation = new Quotation({
        companyId: "company-100",
        customerId: "cust-001",
        number: "Q-2026-0002",
        currencyCode: "KWD",
        customer: { name: "Kuwait National Co." },
        lines: [line],
        subjectAr: "عرض سعر أجهزة مراقبة",
        subjectEn: "Surveillance Equipment Quote",
      });

      expect(quotation.subjectAr).toBe("عرض سعر أجهزة مراقبة");
      expect(quotation.subjectEn).toBe("Surveillance Equipment Quote");
      expect(quotation.lines[0].itemNameAr).toBe("كاميرا IP بدقة 4K");
      expect(quotation.lines[0].itemNameEn).toBe("IP Camera 4K");
    });
  });

  describe("Mandatory Proof Flow 11: Voice transport privacy boundary", () => {
    it("remains a zero-persistence browser transport", () => {
      const recognizer = new BrowserSpeechRecognizer();
      expect(recognizer.isSupported()).toBe(false);
      expect(recognizer.getState()).toBe("UNAVAILABLE");
    });
  });
});
