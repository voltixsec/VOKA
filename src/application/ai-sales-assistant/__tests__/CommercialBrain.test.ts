import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import { AISalesAssistantExtractor } from "../services/AISalesAssistantExtractor";
import { applyCanonicalIntelligence, ConversationalDraftEngine } from "../../commercial-conversation/ConversationalDraftEngine";

const prompt = "عمل عرض سعر توريد وتركيب 86 كاميرات مراقبة على مساحة مصنع 3000 متر التغطية كاملة";
const customer = { id: "customer-1", code: "C1", name: "النور", status: "ACTIVE", preferredCurrency: "KWD", paymentTermDays: 30, countryCode: "KW" };
const catalog = { id: "item-1", code: "I1", name: "Camera", nameAr: null, nameEn: null, sku: null, barcode: null, isActive: true, type: "PRODUCT", unitId: null, taxRateId: null };
function dependencies(customers: unknown[] = [], items: unknown[] = []) {
  return {
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockResolvedValue(customers) }, catalogItems: { findAll: vi.fn().mockResolvedValue(items) },
    units: { findById: vi.fn().mockResolvedValue(null), findBySymbol: vi.fn().mockResolvedValue(null) },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn().mockResolvedValue(45) },
  };
}

describe("Commercial Brain", () => {
  it("retains 86 cameras and factory/area/coverage, uses deterministic multi-NVR rules with an empty catalog", async () => {
    const deps = dependencies();
    const provider = { extractIntent: vi.fn().mockResolvedValue({ documentType: "QUOTATION", lines: [{ text: "fabricated camera suggestion", quantity: 999 }] }), estimatePrices: vi.fn().mockImplementation(async ({ lines }) => ({ prices: lines.map((line: { key: string }) => ({ key: line.key, price: 20 })) })) };
    const proposal = await new AISalesAssistantService(deps as any, provider).generateDraftProposal({ companyId: "tenant-a", prompt, sourceLocale: "ar" });
    expect(provider.extractIntent).toHaveBeenCalledOnce();
    expect(proposal.smartSystem?.status).toBe("COMPLETE");
    expect(proposal.smartSystem?.inputs.find((input) => input.name === "cameraCount")).toMatchObject({ value: 86, provenance: "USER_PROVIDED" });
    expect(proposal.lines.find((line) => line.componentKey === "NVR_RECORDER")?.quantity).toBe(2);
    expect(proposal.facts?.map((fact) => fact.value)).toEqual(expect.arrayContaining(["86", "3000", "مصنع", "التغطية كاملة"]));
    expect(proposal.lines.every((line) => line.catalogItemId === null && line.resolutionStatus === "CUSTOM" && line.reviewRequired)).toBe(true);
    expect(proposal.lines[0]).toMatchObject({ priceSource: "AI_ESTIMATED", priceEstimate: { verified: false, region: "KW" } });
    expect(proposal.estimateNotice).toBe(true);
    expect(proposal.financials?.totalAmount).toBeGreaterThan(0);
    const draft = new ConversationalDraftEngine().advance({ reply: prompt, replySource: "VOICE", locale: "ar" });
    const fused = applyCanonicalIntelligence(draft, proposal);
    expect(fused.missingRequired.map((field) => field.key)).toEqual(["customer"]);
    expect(fused.executed).toBe(false);
  });

  it("clear tenant catalog prices win; customer choice/defaults persist on re-analysis", async () => {
    const deps = dependencies([customer, { ...customer, id: "customer-2" }], [catalog]);
    const provider = { extractIntent: vi.fn().mockResolvedValue({ customerMention: "النور", lines: [{ text: "Camera", quantity: 3 }] }), estimatePrices: vi.fn() };
    const service = new AISalesAssistantService(deps as any, provider);
    const first = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation for النور" });
    expect(first.customer.status).toBe("AMBIGUOUS");
    const second = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation for النور\nالنور", selection: { customer: { id: customer.id, name: customer.name } } });
    expect(second.customer.id).toBe(customer.id);
    expect(second.lines[0]).toMatchObject({ catalogItemId: "item-1", unitPrice: 45, priceSource: "CATALOG_MATCHED" });
    expect(provider.estimatePrices).not.toHaveBeenCalled();
    expect(second.completion).toMatchObject({ currency: "CUSTOMER_DEFAULT", terms: "CUSTOMER_DEFAULT" });
    expect(second.termsAndConditions).toContain("30");
    expect(second.proposal.subject).toBeTruthy(); expect(second.proposal.brief).toBeTruthy();
    expect(deps.customers.findAll).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-a" }));
    await expect(service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation", selection: { customer: { id: "foreign-id", name: customer.name } } })).rejects.toThrow("CUSTOMER_SELECTION_INVALID");
  });

  it("ambiguous catalog is blocking until a tenant-validated choice, never estimated around ambiguity", async () => {
    const deps = dependencies([customer], [catalog, { ...catalog, id: "item-2" }]);
    const provider = { extractIntent: vi.fn().mockResolvedValue({ customerMention: customer.name, lines: [{ text: "Camera", quantity: 3 }] }), estimatePrices: vi.fn() };
    const service = new AISalesAssistantService(deps as any, provider);
    const proposal = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation Camera" });
    const draft = new ConversationalDraftEngine().advance({ reply: "Quotation Camera", replySource: "TEXT", locale: "en" });
    expect(applyCanonicalIntelligence(draft, proposal).missingRequired.some((field) => field.key === "catalogChoice")).toBe(true);
    const chosen = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation Camera", selection: { catalog: { Camera: { id: "item-2", name: "Camera" } } } });
    expect(chosen.lines[0].catalogItemId).toBe("item-2");
    expect(provider.estimatePrices).not.toHaveBeenCalled();
  });

  it("targeted camera-count answer goes directly into rule inputs", async () => {
    const result = await new AISalesAssistantExtractor().extractIntent("نظام كاميرات", "ar", "AUTO", { cameraCount: "86" });
    expect(result.intent.smartSystem?.inputs.find((input) => input.name === "cameraCount")?.value).toBe(86);
  });

  it("provider outage keeps usable facts and unresolved prices truthful", async () => {
    const proposal = await new AISalesAssistantService(dependencies() as any, { extractIntent: vi.fn().mockRejectedValue(new Error("offline")), estimatePrices: vi.fn().mockRejectedValue(new Error("offline")) }).generateDraftProposal({ companyId: "tenant-a", prompt });
    expect(proposal.lines[0].quantity).toBe(86);
    expect(proposal.lines[0].unitPrice).toBeNull();
    expect(proposal.financials).toBeNull();
    expect(proposal.metadata.warnings).toContain("AI price estimation unavailable; unresolved prices remain for human review.");
  });
});
