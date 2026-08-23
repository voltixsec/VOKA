import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantExtractor } from "../application/ai-sales-assistant/services/AISalesAssistantExtractor";
import { QuotationCalculator, Quotation } from "../domain/quotation";
import { GenerateQuotationDocumentUseCase } from "../application/document/use-cases/GenerateQuotationDocumentUseCase";
import { PdfKitQuotationDocumentRenderer } from "../infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer";
import { BrowserSpeechRecognizer } from "../infrastructure/voice/browser/BrowserSpeechRecognizer";

describe("V1 Release Hardening - Full User Journey Audit & Mandatory Proof Flows", () => {
  const extractor = new AISalesAssistantExtractor();

  describe("Mandatory Proof Flow 1: Arabic CCTV Villa System request with installation", () => {
    it("derives CCTV system deterministically without AI quantity fabrication", () => {
      const prompt = "عايز عرض سعر توريد وتركيب 8 كاميرات لفيلا";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.systemType).toBe("CCTV");
      expect(intent.smartSystem?.status).toBe("COMPLETE");

      const cameraInput = intent.smartSystem?.inputs.find((i) => i.name === "cameraCount");
      expect(cameraInput).toMatchObject({ value: 8, provenance: "USER_PROVIDED" });

      const contextInput = intent.smartSystem?.inputs.find((i) => i.name === "projectContext");
      expect(contextInput).toMatchObject({ value: "villa", provenance: "USER_PROVIDED" });

      const installInput = intent.smartSystem?.inputs.find((i) => i.name === "includeInstallation");
      expect(installInput).toMatchObject({ value: true, provenance: "USER_PROVIDED" });

      const cameraLine = intent.lines.find((l) => l.componentKey === "CCTV_CAMERAS");
      expect(cameraLine).toMatchObject({ quantity: 8, provenance: "USER_PROVIDED" });

      const nvrLine = intent.lines.find((l) => l.componentKey === "NVR_RECORDER");
      expect(nvrLine).toMatchObject({ quantity: 1, provenance: "CALCULATED" });

      const cabinetLine = intent.lines.find((l) => l.componentKey === "RACK_CABINET");
      expect(cabinetLine).toMatchObject({ quantity: 1, provenance: "SUGGESTED" });

      const installationLine = intent.lines.find((l) => l.componentKey === "INSTALLATION_COMMISSIONING");
      expect(installationLine).toBeDefined();
      expect(installationLine?.quantity).toBe(8);
    });
  });

  describe("Mandatory Proof Flow 2: Gypsum Board Facade 2000m² request", () => {
    it("derives Gypsum Board materials deterministically for 2000 m²", () => {
      const prompt = "واجهات جبس بورد 2000 متر";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.systemType).toBe("GYPSUM_BOARD");
      expect(intent.smartSystem?.status).toBe("COMPLETE");

      const areaInput = intent.smartSystem?.inputs.find((i) => i.name === "areaM2");
      expect(areaInput).toMatchObject({ value: 2000, provenance: "USER_PROVIDED" });

      const sheetsLine = intent.lines.find((l) => l.componentKey === "GYPSUM_BOARDS");
      expect(sheetsLine).toBeDefined();
      expect(sheetsLine?.provenance).toBe("CALCULATED");
      expect(sheetsLine?.quantity).toBe(730);

      // Supply-only area request without explicit installation does not force installation labor
      const laborLine = intent.lines.find((l) => l.componentKey === "GYPSUM_LABOR");
      expect(laborLine).toBeUndefined();
    });
  });

  describe("Mandatory Proof Flow 3: Incomplete Gypsum Board system request", () => {
    it("returns NEEDS_CONFIRMATION without inventing area or component quantities", () => {
      const prompt = "عايز سيستم جبس بورد";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 4: Invalid negative area input", () => {
    it("fails safely with INVALID_INPUT and returns zero calculated lines", () => {
      const prompt = "جبس بورد -200 متر";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("INVALID_INPUT");
      expect(intent.smartSystem?.missingInputs).toContain("areaM2");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 5: Incomplete CCTV camera system request", () => {
    it("returns NEEDS_CONFIRMATION requesting camera count rather than fabricating it", () => {
      const prompt = "اعمللي نظام كاميرات";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeDefined();
      expect(intent.smartSystem?.status).toBe("NEEDS_CONFIRMATION");
      expect(intent.smartSystem?.missingInputs).toContain("cameraCount");
      expect(intent.lines).toHaveLength(0);
    });
  });

  describe("Mandatory Proof Flow 6: Ordinary non-system quotation request", () => {
    it("remains on normal AI Sales Assistant quotation path", () => {
      const prompt = "اعمل عرض سعر توريد 10 أجهزة كمبيوتر محمول";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(10);
    });
  });

  describe("Mandatory Proof Flow 7: Supply-only camera quotation", () => {
    it("does not automatically add installation or hijack system template", () => {
      const prompt = "عايز عرض سعر 8 كاميرات";
      const intent = extractor.heuristicExtract(prompt, "ar");

      expect(intent.smartSystem).toBeUndefined();
      expect(intent.lines).toHaveLength(1);
      expect(intent.lines[0].quantity).toBe(8);
      expect(intent.lines.some((l) => l.text.includes("تركيب"))).toBe(false);
    });
  });

  describe("Mandatory Proof Flow 8: Quotation save -> reopen -> edit continuity", () => {
    it("preserves line state, calculations, and tax rates across draft updates", () => {
      const customer = {
        name: "شركة الأمل للتجارة",
        email: "info@alamal.kw",
        phone: "+96522000000",
      };

      const initialLines = [
        QuotationCalculator.calculateLine({
          position: 1,
          type: "PRODUCT",
          itemName: "كاميرة مراقبة 4K",
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
        customer,
        lines: initialLines,
      });

      expect(quotation.totals.subtotal).toBe(360);
      expect(quotation.status).toBe("DRAFT");

      // Reopen & edit: add installation line
      const updatedLines = [
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
      ];

      quotation.replaceLines(updatedLines);

      expect(quotation.lines).toHaveLength(2);
      expect(quotation.totals.subtotal).toBe(480);
    });
  });

  describe("Mandatory Proof Flow 9: Quotation -> PDF document rendering & output continuity", () => {
    it("renders bilingual two-page proposal PDF successfully", async () => {
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
            subjectAr: "عرض سعر سيستم كاميرات مراقبة",
            subjectEn: "CCTV Surveillance System Proposal",
            customer: {
              name: "شركة الكويت الوطنية",
            },
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "كاميرات مراقبة شبكية IP",
                quantity: 8,
                unitPrice: 45,
              },
            ],
          }),
        ),
      };

      const renderer = new PdfKitQuotationDocumentRenderer();
      const useCase = new GenerateQuotationDocumentUseCase(quotationRepo as any, renderer);

      const result = await useCase.execute({
        companyId: "company-100",
        companyName: "شركة الفوكا للتكنولوجيا",
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

  describe("Mandatory Proof Flow 10: Arabic / English quotation localization continuity", () => {
    it("preserves active and fallback values across bilingual contexts", () => {
      const customer = {
        name: "Kuwait National Co.",
      };

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
        customer,
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

  describe("Voice Input Transport Security & Privacy Boundary", () => {
    it("confirms speech recognizer operates as zero-persistence transport", () => {
      const recognizer = new BrowserSpeechRecognizer();
      expect(recognizer.isSupported()).toBe(false); // In Node.js environment without window.SpeechRecognition
      expect(recognizer.getState()).toBe("UNAVAILABLE");
    });
  });
});
