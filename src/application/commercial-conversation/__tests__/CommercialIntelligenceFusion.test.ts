import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant";
import { AISalesAssistantExtractor } from "../../ai-sales-assistant";
import { applyCanonicalIntelligence, ConversationalDraftEngine } from "../ConversationalDraftEngine";

describe("commercial intelligence fusion", () => {
  it("honors catalog-only and explicit system build selectors", async () => {
    const extractor = new AISalesAssistantExtractor();
    const catalog = await extractor.extractIntent("توريد وتركيب سيستم 8 كاميرات", "ar", "CATALOG_ONLY");
    const system = await extractor.extractIntent("عرض سعر 8 كاميرات", "ar", "SUPPLY_INSTALL_SYSTEM");
    expect(catalog.intent.smartSystem).toBeUndefined();
    expect(system.intent.smartSystem).toMatchObject({ systemType: "CCTV", status: "COMPLETE" });
  });

  it("runs Arabic CCTV system intelligence and catalog resolution before conversational requirements", async () => {
    const catalogFindAll = vi.fn().mockResolvedValue([]);
    const service = new AISalesAssistantService({
      companies: { findById: vi.fn().mockResolvedValue({ id: "company-1", defaultCurrency: "KWD" }) },
      customers: { findAll: vi.fn().mockResolvedValue([]) },
      catalogItems: { findAll: catalogFindAll },
      units: { findById: vi.fn().mockResolvedValue(null), findBySymbol: vi.fn().mockResolvedValue(null) },
      quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
      pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn().mockResolvedValue(null) },
    } as any);
    const prompt = "عايز عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا";
    const proposal = await service.generateDraftProposal({ companyId: "company-1", prompt, sourceLocale: "ar" });
    const conversational = new ConversationalDraftEngine().advance({ reply: prompt, replySource: "VOICE", locale: "ar", operation: "QUOTATION", documentMode: "QUOTATION", buildMode: "AUTO" });
    const fused = applyCanonicalIntelligence(conversational, proposal);

    expect(proposal.smartSystem).toMatchObject({ systemType: "CCTV", status: "COMPLETE" });
    expect(proposal.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(8);
    expect(catalogFindAll).toHaveBeenCalled();
    expect(fused.canonicalProposal).toBe(proposal);
    expect(fused.fields.lines.length).toBeGreaterThan(0);
    expect(fused.missingRequired.map((field) => field.key)).not.toContain("lines");
    expect(fused.missingRequired.map((field) => field.key)).toEqual(["customer"]);
    expect(fused.executed).toBe(false);
  });

  it("keeps missing Smart System inputs blocking while optional commercial fields do not", async () => {
    const service = new AISalesAssistantService({
      companies: { findById: vi.fn().mockResolvedValue({ id: "company-1", defaultCurrency: "KWD" }) }, customers: { findAll: vi.fn().mockResolvedValue([]) }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
      units: { findById: vi.fn(), findBySymbol: vi.fn() }, quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
      pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    } as any);
    const prompt = "اعمللي نظام كاميرات";
    const proposal = await service.generateDraftProposal({ companyId: "company-1", prompt, sourceLocale: "ar" });
    const draft = new ConversationalDraftEngine().advance({ reply: prompt, replySource: "TEXT", locale: "ar", operation: "QUOTATION" });
    const fused = applyCanonicalIntelligence(draft, proposal);
    expect(fused.missingRequired.some((field) => field.key === "systemInput" && field.sourceField === "cameraCount")).toBe(true);
    expect(fused.missingRequired.map((field) => field.key)).not.toContain("lines");
    expect(fused.status).toBe("NEEDS_CLARIFICATION");
    expect(fused.recommended.map((field) => field.key)).toContain("paymentTerms");
  });
});
