import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import { AISalesAssistantExtractor } from "../services/AISalesAssistantExtractor";
import { CompleteCommercialConversation } from "../../commercial-conversation/CompleteCommercialConversation";
import { commercializeSystemComponent } from "../services/commercialize-system-component";
import { CctvSystemTemplate } from "../../../domain/smart-system";

const prompt = "اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة";

function service() {
  const catalog = vi.fn().mockResolvedValue([]);
  const estimatePrices = vi.fn().mockImplementation(async ({ lines }) => ({ prices: lines.map((line: { key: string }) => ({ key: line.key, price: 10 })) }));
  const brain = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockResolvedValue([]) }, catalogItems: { findAll: catalog },
    units: { findById: vi.fn(), findBySymbol: vi.fn() }, quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
  } as any, { extractIntent: vi.fn().mockResolvedValue({ lines: [{ text: "Required storage capacity 999 TB", quantity: 999 }] }), estimatePrices });
  return { brain, catalog, estimatePrices };
}

describe("engineering to commercial boundary", () => {
  it.each(["ar", "en"] as const)("keeps storage TB internal and quotes a provisional package, not a made-up drive design (%s)", async (locale) => {
    const { brain, estimatePrices } = service();
    const proposal = await brain.generateDraftProposal({ companyId: "tenant", prompt, sourceLocale: locale });
    const storage = proposal.lines.find((line) => line.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")!;
    expect(storage).toMatchObject({ quantity: 1, requestedUnitText: "Package", type: "CUSTOM", resolutionStatus: "CUSTOM", catalogItemId: null, commercializationPending: true, unitPrice: null, reviewRequired: true, description: null });
    expect(storage.itemName).toBe(locale === "ar" ? "حزمة توريد وحدات تخزين المراقبة" : "Surveillance storage supply package");
    expect(storage.itemName).not.toMatch(/337|999|18TB|capacity|مطلوبة/i);
    const requirement = proposal.smartSystem?.requirements?.find((item) => item.componentKey === storage.componentKey);
    expect(requirement).toMatchObject({ quantity: 337, unit: "TB", provenance: "CALCULATED" });
    expect(requirement?.formulaExplanation).toContain("130 cameras");
    expect(proposal.smartSystem?.status).toBe("COMPLETE");
    expect(proposal.lines.find((line) => line.componentKey === "CAT6_CABLING")).toMatchObject({ quantity: 13, requestedUnitText: "Roll" });
    expect(estimatePrices.mock.calls[0][0].lines.some((line: { name: string }) => line.name === storage.itemName)).toBe(false);
    expect(proposal.financials).toBeNull();
  });

  it("does not let stale catalog selection relabel a capacity requirement as one HDD", async () => {
    const { brain } = service();
    const proposal = await brain.generateDraftProposal({ companyId: "tenant", prompt, selection: { catalog: { SURVEILLANCE_STORAGE_CAPACITY: { id: "not-verified", name: "Surveillance HDD 18TB" } } } });
    expect(proposal.lines.find((line) => line.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")).toMatchObject({ catalogItemId: null, requestedUnitText: "Package", quantity: 1, commercializationPending: true });
  });

  it("reanalysis cannot replay an older raw engineering line from conversational state", async () => {
    const { brain } = service();
    const conversation = new CompleteCommercialConversation(brain);
    const first = await conversation.execute({ companyId: "tenant", reply: prompt, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION" });
    const legacy = structuredClone(first);
    const raw = legacy.canonicalProposal!.lines.find((line) => line.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")!;
    Object.assign(raw, { itemName: "Required storage capacity 337 TB", quantity: 337, unitName: "TB", requestedUnitText: "TB" });
    const next = await conversation.execute({ companyId: "tenant", draft: legacy, reply: "مصنع الشويخ الجديد", answer: { field: "projectName", value: "مصنع الشويخ الجديد" }, replySource: "VOICE", locale: "ar" });
    expect(next.id).toBe(first.id);
    expect(next.canonicalProposal?.lines).toEqual(first.canonicalProposal?.lines);
    expect(next.canonicalProposal?.smartSystem?.requirements).toEqual(first.canonicalProposal?.smartSystem?.requirements);
    expect(next.executed).toBe(false);
  });

  it("does not alter the deterministic engineering BOM or its formulas", () => {
    const engineering = new CctvSystemTemplate().calculate({ cameraCount: 130 });
    const before = structuredClone(engineering);
    const commercial = engineering.components.map((component) => commercializeSystemComponent(component, "en"));
    expect(engineering).toEqual(before);
    expect(commercial.find((line) => line.componentKey === "CAT6_CABLING")?.text).toBe("CAT6 network cable 305m roll");
  });

  it("keeps the same cable-roll allocation for extracted catalog resolution", async () => {
    const result = await new AISalesAssistantExtractor().extractIntent(prompt, "en");
    const cable = result.intent.lines.find((line) => line.componentKey === "CAT6_CABLING");
    expect(cable).toMatchObject({ quantity: 13, requestedUnitText: "Roll", description: null });
    expect(cable?.formulaExplanation).toContain("305m roll");
  });
});
