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
  const acceptancePrompt = "عايز أعمل عرض سعر توريد وتركيب 36 كاميرا مراقبة شركة الأفق";
  const entity = "شركة الأفق";

  it("uses structured customer entity only and preserves 36-camera system intent", async () => {
    const deps = dependencies([{ ...customer, name: entity }]);
    const provider = { extractIntent: vi.fn().mockResolvedValue({ customerMention: entity, lines: [] }), extractCustomerMention: vi.fn() };
    const proposal = await new AISalesAssistantService(deps as any, provider).generateDraftProposal({ companyId: "tenant-a", prompt: acceptancePrompt, sourceLocale: "ar" });
    expect(proposal.customer).toMatchObject({ id: "customer-1", mention: entity, status: "MATCHED" });
    expect(deps.customers.findAll.mock.calls.every(([input]) => input.companyId === "tenant-a" && input.search === entity)).toBe(true);
    expect(provider.extractCustomerMention).not.toHaveBeenCalled();
    expect(proposal.smartSystem?.status).toBe("COMPLETE");
    expect(proposal.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(36);
    const draft = applyCanonicalIntelligence(new ConversationalDraftEngine().advance({ reply: acceptancePrompt, replySource: "TEXT", locale: "ar" }), proposal);
    expect(draft.fields.customerId).toBe("customer-1");
    expect(draft.missingRequired).toEqual([]);
    expect(draft.executed).toBe(false);
  });

  it("corrects a sentence-shaped customer through the provider before tenant lookup", async () => {
    const deps = dependencies();
    const provider = { extractIntent: vi.fn().mockResolvedValue({ customerMention: acceptancePrompt, lines: [] }), extractCustomerMention: vi.fn().mockResolvedValue({ customerMention: entity }) };
    const proposal = await new AISalesAssistantService(deps as any, provider).generateDraftProposal({ companyId: "tenant-a", prompt: acceptancePrompt, sourceLocale: "ar" });
    expect(provider.extractCustomerMention).toHaveBeenCalledExactlyOnceWith(acceptancePrompt, "ar");
    expect(proposal.customer.mention).toBe(entity);
    expect(deps.customers.findAll.mock.calls.every(([input]) => input.search === entity)).toBe(true);
    const fused = applyCanonicalIntelligence(new ConversationalDraftEngine().advance({ reply: acceptancePrompt, replySource: "VOICE", locale: "ar" }), proposal);
    expect(fused.proposedCustomerName).toBe(entity);
    expect(fused.customerState).toBe("CUSTOMER_PROPOSED_UNREGISTERED");
    expect(fused.status).toBe("READY_FOR_REVIEW");
    expect(fused.fields.customerId).toBeNull();
    expect(fused.customerResolution.status).toBe("NOT_FOUND");
  });

  it("fallback isolates the trailing company when the provider is unavailable", async () => {
    const result = await new AISalesAssistantExtractor({ extractIntent: vi.fn().mockRejectedValue(new Error("unavailable")) }).extractIntent(acceptancePrompt, "ar");
    expect(result.intent.customerMention).toBe(entity);
    expect(result.intent.scopeType).toBe("SUPPLY_AND_INSTALLATION");
    expect(result.intent.smartSystem?.status).toBe("COMPLETE");
  });

  it("rejects a second polluted provider result and uses only the clean fallback", async () => {
    const result = await new AISalesAssistantExtractor({ extractIntent: vi.fn().mockResolvedValue({ customerMention: acceptancePrompt, lines: [] }), extractCustomerMention: vi.fn().mockResolvedValue({ customerMention: acceptancePrompt }) }).extractIntent(acceptancePrompt, "ar");
    expect(result.intent.customerMention).toBe(entity);
  });

  it("keeps partial customer matches as explicit choices even when only one is found", async () => {
    const provider = { extractIntent: vi.fn().mockResolvedValue({ customerMention: entity, lines: [] }) };
    const deps = dependencies([{ ...customer, name: `${entity} للتجارة` }, { ...customer, id: "customer-2", name: `${entity} للمقاولات` }]);
    const service = new AISalesAssistantService(deps as any, provider);
    const proposal = await service.generateDraftProposal({ companyId: "tenant-a", prompt: acceptancePrompt });
    const draft = applyCanonicalIntelligence(new ConversationalDraftEngine().advance({ reply: acceptancePrompt, replySource: "TEXT", locale: "ar" }), proposal);
    expect(draft.customerResolution.status).toBe("AMBIGUOUS");
    expect(draft.customerResolution.candidates).toHaveLength(2);
    expect(draft.clarification?.suggestions).toHaveLength(2);
    deps.customers.findAll.mockResolvedValue([{ ...customer, name: `${entity} للتجارة` }]);
    const single = await service.generateDraftProposal({ companyId: "tenant-a", prompt: acceptancePrompt });
    expect(single.customer).toMatchObject({ status: "AMBIGUOUS", id: null });
    expect(single.customer.candidates[0].id).toBe("customer-1");
  });

  it("carries every derived CCTV quantity explanation through catalog resolution", async () => {
    const proposal = await new AISalesAssistantService(dependencies() as any).generateDraftProposal({ companyId: "tenant-a", prompt: acceptancePrompt });
    const derived = proposal.lines.filter((line) => line.quantitySource === "RULE_CALCULATED" || line.quantitySource === "AI_ESTIMATED");
    expect(derived.length).toBeGreaterThanOrEqual(5);
    expect(derived.every((line) => Boolean(line.formulaExplanation))).toBe(true);
    expect(derived.every((line) => Boolean(line.formulaExplanationAr))).toBe(true);
    expect(derived.every((line) => Boolean(line.itemNameAr && line.itemNameEn))).toBe(true);
    const byKey = (key: string) => proposal.lines.find((line) => line.componentKey === key)!;
    expect(byKey("NVR_RECORDER").formulaExplanation).toContain("64 channels");
    expect(byKey("POE_SWITCH").formulaExplanation).toContain("48 ports - 2 reserved uplink ports");
    expect(byKey("SURVEILLANCE_STORAGE_CAPACITY")).toMatchObject({ requestedUnitText: "TB" });
    expect(byKey("SURVEILLANCE_STORAGE_CAPACITY").formulaExplanation).toContain("30 days");
    expect(byKey("RACK_CABINET")).toMatchObject({ quantitySource: "AI_ESTIMATED", quantity: 1 });
    expect(byKey("RACK_CABINET").formulaExplanation).toContain("single collection point");
    expect(byKey("CAT6_CABLING").formulaExplanation).toContain("305m roll");
    expect(byKey("CAT6_CABLING").formulaExplanationAr).toContain("305 متر/بكرة");
    expect(proposal.estimateNotice).toBe(true);
  });
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
