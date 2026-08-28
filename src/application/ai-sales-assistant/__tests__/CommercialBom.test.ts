import { describe, expect, it, vi } from "vitest";
import { CatalogItem } from "@/features/catalog/domain/entities/CatalogItem";
import { UniqueEntityID } from "@/lib/core";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import { CompleteCommercialConversation } from "../../commercial-conversation/CompleteCommercialConversation";
import { commercializeSystemComponent } from "../services/commercialize-system-component";
import { resolveCommercialCatalog } from "../services/commercial-catalog";
import { CctvSystemTemplate, AccessControlSystemTemplate } from "../../../domain/smart-system";
import { validateExtractedSalesIntent } from "../dto/validateExtractedSalesIntent";

export const bomPrompt = "اعمل عرض سعر توريد وتركيب 180 كاميرا مراقبة شركة الأفق";
export function catalogProduct(id: string, name: string, unit = "Unit", extra: Partial<Parameters<typeof CatalogItem.create>[0]> = {}) {
  return CatalogItem.create({ companyId: "tenant", type: "PRODUCT", code: id, name, nameEn: name, unitId: unit, salePrice: 125, ...extra }, new UniqueEntityID(id)).getValue();
}
export function bomFixture(items: CatalogItem[] = [], options: { price?: number | null; truncate?: boolean } = {}) {
  const findAll = vi.fn().mockImplementation(async ({ companyId, search, type, take }) => {
    const found = items.filter((item) => item.companyId === companyId && item.type === type && [item.name, item.nameAr, item.nameEn, item.code].some((value) => value?.toLowerCase().includes(search.toLowerCase())));
    return options.truncate ? Array.from({ length: take }, () => found[0]).filter(Boolean) : found.slice(0, take);
  });
  const units = { findById: vi.fn().mockImplementation(async (symbol) => ({ symbol, isActive: true, nameAr: symbol === 'Unit' ? 'وحدة' : symbol === 'Roll' ? 'بكرة' : symbol === 'Set' ? 'طقم' : 'نقطة', nameEn: symbol })), findBySymbol: vi.fn().mockResolvedValue(null) };
  const price = vi.fn().mockResolvedValue(options.price === undefined ? 125 : options.price);
  const service = new AISalesAssistantService({ companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) }, customers: { findAll: vi.fn().mockResolvedValue([]) },
    catalogItems: { findAll }, units, pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: price },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
  } as any);
  return { service, findAll, units, price, conversation: new CompleteCommercialConversation(service) };
}
const storage = (proposal: Awaited<ReturnType<AISalesAssistantService["generateDraftProposal"]>>) => proposal.lines.find((line) => line.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")!;

describe("CCTV engineering → commercial BOM", () => {
  it("leaves non-CCTV component selection and review policy unchanged", () => {
    const system = new AccessControlSystemTemplate().calculate({ doors: 2, accessDirection: "ENTRY_ONLY", cableMetersPerDoor: 10 });
    expect(system.components.length).toBeGreaterThan(0);
    for (const component of system.components) {
      expect(commercializeSystemComponent(component, 'en', system)).toMatchObject({ text: component.nameEn, quantity: component.quantity, requestedUnitText: component.unit, commercialRequirement: undefined });
    }
  });
  it("does not accept provider-authored commercialization identity or sizing facts", () => {
    expect(validateExtractedSalesIntent({ lines: [{ text: "HDD", commercialRequirement: { quantity: 999, matchStatus: "COMMERCIAL_MATCH_CONFIRMED" } }] })).toBeNull();
  });
  it.each(["ar", "en"] as const)("commercializes every component with internal source/version/spec and professional names (%s)", async (sourceLocale) => {
    const { service } = bomFixture();
    const proposal = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt, sourceLocale });
    expect(proposal.smartSystem?.status).toBe("COMPLETE");
    expect(proposal.lines).toHaveLength(8);
    for (const line of proposal.lines) {
      expect(line.itemName).not.toMatch(/required|capacity|retention|assumption|ceil|مطلوبة|احتياج|حساب|337|467|TB/i);
      expect(line.description).toBeNull();
      expect(line.commercialRequirement).toMatchObject({ category: line.componentKey, reviewRequired: true, source: { ruleVersion: "1.2.0", requirement: { componentKey: line.componentKey } } });
      expect(line.commercialRequirement?.source.inputs.find((input) => input.name === "cameraCount")?.value).toBe(180);
      expect(line.itemName.replace(/IP|CCTV|NVR|PoE|CAT6|RJ45/gi, '')).not.toMatch(sourceLocale === 'ar' ? /[a-z]/i : /[\u0600-\u06ff]/);
    }
    expect(proposal.lines.find((line) => line.componentKey === "NVR_RECORDER")).toMatchObject({ quantity: 3, unitName: "Unit" });
    expect(proposal.lines.find((line) => line.componentKey === "POE_SWITCH")).toMatchObject({ quantity: 4, unitName: "Unit" });
    expect(proposal.lines.find((line) => line.componentKey === "CAT6_CABLING")).toMatchObject({ quantity: 18, unitName: "Roll" });
    expect(storage(proposal)).toMatchObject({ quantity: 1, unitName: "Package", unitPrice: null, itemCode: null, catalogItemId: null, priceSource: "NEEDS_CONFIRMATION", commercialRequirement: { matchStatus: "COMMERCIAL_ITEM_TEMPORARY" } });
    expect(proposal.reviewRequired).toBe(true);
  });

  it("matches a real tenant HDD, preserving its ID/code/unit/catalog price and preliminary allocation", async () => {
    const { service, findAll, price } = bomFixture([catalogProduct("HDD18", "Surveillance HDD 18TB")]);
    const proposal = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt, sourceLocale: "en" });
    expect(storage(proposal)).toMatchObject({ catalogItemId: "HDD18", itemCode: "HDD18", quantity: 26, unitName: "Unit", unitPrice: 125, priceSource: "CATALOG_MATCHED", quantitySource: "RULE_CALCULATED", reviewRequired: true, commercializationPending: false, commercialRequirement: { matchStatus: "COMMERCIAL_MATCH_CONFIRMED", matchBasis: "COMPATIBLE" } });
    expect(storage(proposal).formulaExplanation).toContain("ceil(467 TB / 18 TB");
    expect(storage(proposal).formulaExplanation).toContain("not a verified disk design");
    expect(price).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant", catalogItemId: "HDD18", quantity: 26 }));
    expect(findAll.mock.calls.every(([query]) => query.companyId === "tenant" && query.isActive === true)).toBe(true);
    expect(storage(proposal).itemName).toBe("Surveillance HDD 18TB");
    expect(storage(proposal).description).toBeNull();
  });

  it("finds Arabic product capacities without English catalog names", async () => {
    const { service } = bomFixture([catalogProduct("AR18", "قرص تخزين مراقبة ١٨ تيرابايت", "PCS", { nameEn: null, nameAr: "قرص تخزين مراقبة ١٨ تيرابايت" })]);
    expect(storage(await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt }))).toMatchObject({ catalogItemId: "AR18", quantity: 26, unitName: "PCS" });
  });

  it("retains ranked alternatives, explicitly selects and revalidates the same choice through voice/text replies", async () => {
    const { conversation } = bomFixture([catalogProduct("HDD18", "Surveillance HDD 18TB"), catalogProduct("HDD16", "Surveillance HDD 16TB")]);
    const first = await conversation.execute({ companyId: "tenant", reply: bomPrompt, replySource: "TEXT", locale: "en", documentMode: "QUOTATION" });
    const firstStorage = storage(first.canonicalProposal!);
    expect(firstStorage).toMatchObject({ catalogItemId: null, unitPrice: null, commercialRequirement: { matchStatus: "COMMERCIAL_MATCH_AMBIGUOUS" } });
    expect(firstStorage.catalogCandidates.map((option) => [option.id, option.quantity])).toEqual([["HDD18", 26], ["HDD16", 30]]);
    const second = await conversation.execute({ companyId: "tenant", draft: first, reply: "Surveillance HDD 16TB", replySource: "CHIP", locale: "en", selection: { catalog: { SURVEILLANCE_STORAGE_CAPACITY: { id: "HDD16", name: "Surveillance HDD 16TB" } } } });
    expect(storage(second.canonicalProposal!)).toMatchObject({ catalogItemId: "HDD16", quantity: 30, commercialRequirement: { matchBasis: "USER_SELECTED" } });
    for (const replySource of ["VOICE", "TEXT"] as const) {
      const next = await conversation.execute({ companyId: "tenant", draft: second, reply: "Warehouse", replySource, locale: "en", answer: { field: "projectName", value: "Warehouse" } });
      expect(next.id).toBe(first.id);
      expect(next.canonicalProposal?.lines).toEqual(second.canonicalProposal?.lines);
      expect(next.missingRequired.some((field) => field.key === "catalogChoice")).toBe(false);
      expect(next.executed).toBe(false);
      expect(next.requiresHumanReview).toBe(true);
    }
  });

  it.each([
    ["HDD without capacity", "Unit"], ["HDD 8TB / 18TB", "Unit"], ["HDD 8-18TB", "Unit"],
    ["NVR supports HDD up to 18TB", "Unit"], ["Surveillance HDD 18TB", "Package"], ["Surveillance HDD 18TB", "TB"],
  ])("does not invent capacity/pack conversion from %s sold in %s", async (name, unit) => {
    const { service } = bomFixture([catalogProduct("UNSAFE", name, unit)]);
    expect(storage(await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt }))).toMatchObject({ catalogItemId: null, itemCode: null, quantity: 1, unitName: "Package", unitPrice: null });
  });

  it("never binds cross-tenant, inactive, fabricated or stale catalog choices", async () => {
    const { service } = bomFixture([catalogProduct("OTHER", "HDD 18TB", "Unit", { companyId: "other" }), catalogProduct("INACTIVE", "HDD 18TB", "Unit", { isActive: false })]);
    const result = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt, selection: { catalog: { SURVEILLANCE_STORAGE_CAPACITY: { id: "fabricated", name: "HDD 18TB" } } } });
    expect(storage(result)).toMatchObject({ catalogItemId: null, itemCode: null, unitPrice: null });
  });

  it("does not mistake a capped catalog search for a unique compatible product", async () => {
    const { service } = bomFixture([catalogProduct("HDD18", "Surveillance HDD 18TB")], { truncate: true });
    expect(storage(await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt }))).toMatchObject({ catalogItemId: null, resolutionStatus: "AMBIGUOUS", commercialRequirement: { searchTruncated: true } });
  });

  it("calculates counts for compatible catalog channel/port capacities and retains roll units", async () => {
    const { service } = bomFixture([catalogProduct("NVR32", "32-Channel NVR"), catalogProduct("POE24", "24-Port PoE Switch"), catalogProduct("CAT6", "CAT6 UTP Cable 305m Roll", "Roll")]);
    const proposal = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt });
    expect(proposal.lines.find((line) => line.componentKey === "NVR_RECORDER")).toMatchObject({ catalogItemId: "NVR32", quantity: 6, unitName: "Unit" });
    expect(proposal.lines.find((line) => line.componentKey === "POE_SWITCH")).toMatchObject({ catalogItemId: "POE24", quantity: 9, unitName: "Unit" });
    expect(proposal.lines.find((line) => line.componentKey === "CAT6_CABLING")).toMatchObject({ catalogItemId: "CAT6", quantity: 18, unitName: "Roll" });
  });

  it("prefers one exact commercial match over compatible alternatives", async () => {
    const { service } = bomFixture([catalogProduct("EXACT", "Network Video Recorder NVR (64 Channels)"), catalogProduct("OTHER", "32-Channel NVR")]);
    const proposal = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt, sourceLocale: "en" });
    expect(proposal.lines.find((line) => line.componentKey === "NVR_RECORDER")).toMatchObject({ catalogItemId: "EXACT", quantity: 3, commercialRequirement: { matchBasis: "EXACT" } });
  });

  it("uses deterministic required metres, never commercializes metres as rolls", async () => {
    const system = new CctvSystemTemplate().calculate({ cameraCount: 200, cableMetersPerCamera: 26 });
    const line = commercializeSystemComponent(system.components.find((row) => row.componentKey === "CAT6_CABLING")!, "en", system);
    expect(line).toMatchObject({ quantity: 18, requestedUnitText: "Roll", commercialRequirement: { specification: { requiredCableMeters: 5200, metersPerRoll: 305 } } });
    const { findAll, units } = bomFixture([catalogProduct("METRES", "CAT6 UTP 305m", "m")]);
    expect((await resolveCommercialCatalog("tenant", line, "en", { findAll }, units)).matched).toBeUndefined();
  });

  it("keeps a catalog product with unknown price unresolved, never a fake zero", async () => {
    const { service } = bomFixture([catalogProduct("HDD18", "HDD 18TB")], { price: null });
    expect(storage(await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt }))).toMatchObject({ catalogItemId: "HDD18", unitPrice: null, priceSource: "NEEDS_CONFIRMATION", subtotal: null, reviewRequired: true });
  });

  it("preserves product/service separation and actual accessory/service sale units", async () => {
    const { service } = bomFixture([
      catalogProduct("CAM", "IP Surveillance Camera"), catalogProduct("RACK", "Network Rack Cabinet"),
      catalogProduct("SET", "RJ45 Connectors and Junction Boxes Set", "Set"),
      catalogProduct("INSTALL", "Installation, programming and commissioning", "Point", { type: "SERVICE" }),
    ]);
    const proposal = await service.generateDraftProposal({ companyId: "tenant", prompt: bomPrompt });
    expect(proposal.lines.find((line) => line.componentKey === "CCTV_CAMERAS")).toMatchObject({ catalogItemId: "CAM", quantity: 180, type: "PRODUCT" });
    expect(proposal.lines.find((line) => line.componentKey === "RACK_CABINET")).toMatchObject({ catalogItemId: "RACK", quantity: 1, quantitySource: "AI_ESTIMATED", reviewRequired: true });
    expect(proposal.lines.find((line) => line.componentKey === "CONNECTORS_AND_ACCESSORIES")).toMatchObject({ catalogItemId: "SET", quantity: 180, unitName: "Set" });
    expect(proposal.lines.find((line) => line.componentKey === "INSTALLATION_COMMISSIONING")).toMatchObject({ catalogItemId: "INSTALL", quantity: 180, unitName: "Point", type: "SERVICE" });
  });
});
