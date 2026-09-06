import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import { AISalesAssistantExtractor } from "../services/AISalesAssistantExtractor";
import { CompleteCommercialConversation } from "../../commercial-conversation/CompleteCommercialConversation";
import { commercializeSystemComponent, salesEngineeringRequirement } from "../services/commercialize-system-component";
import { CctvSystemTemplate, type SystemComponent } from "../../../domain/smart-system";

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
  const engineDrive = () => new CctvSystemTemplate().calculate({ cameraCount: 130 })
    .components.find((item) => item.componentKey === "SURVEILLANCE_HDD")!;

  it("projects proven capacity with governed context and preserves the original source", () => {
    const drive = engineDrive();
    const before = structuredClone(drive);
    const projected = salesEngineeringRequirement(drive);
    expect(projected).toMatchObject({ componentKey: "SURVEILLANCE_STORAGE_CAPACITY", quantity: 337, unit: "TB", provenance: drive.provenance });
    expect(projected.formulaExplanation).toBe("130 cameras, 8 Mbps, 30 days: 337 TB required.");
    expect(projected).not.toBe(drive);
    expect(projected.specification).toBe(drive.specification);
    expect(commercializeSystemComponent(drive, "en").commercialRequirement?.source.requirement).toBe(drive);
    expect(drive).toEqual(before);
  });

  const invalidSpecifications: Array<[string, unknown]> = [
    ["missing specification", undefined],
    ["missing capacity", {}],
    ...[undefined, null, "invalid", "337", NaN, Infinity, -Infinity, 0, -1, true]
      .map((value): [string, unknown] => [`capacity ${String(value)}`, { requiredUsableTb: value }]),
  ];
  it.each(invalidSpecifications)("preserves the original component for %s without fabricating capacity", (_label, specification) => {
    const drive = { ...engineDrive(), specification: specification as SystemComponent["specification"] };
    const before = structuredClone(drive);
    const result = salesEngineeringRequirement(drive);
    expect(result).toBe(drive);
    expect(result.componentKey).toBe("SURVEILLANCE_HDD");
    expect(Number.isNaN(result.quantity)).toBe(false);
    expect(result.formulaExplanation).not.toMatch(/undefined|null|NaN/);
    expect(drive).toEqual(before);
  });

  it.each([undefined, null, NaN, Infinity, "undefined", "null", "NaN"])("omits unavailable governed context (%s) from the capacity explanation", (value) => {
    const drive = {
      ...engineDrive(),
      specification: { requiredUsableTb: 337, bitrateMbps: value, storageDays: value },
      calculationInputs: { cameraCount: value },
      formulaExplanation: undefined,
    } as unknown as SystemComponent;
    const before = structuredClone(drive);
    const result = salesEngineeringRequirement(drive);
    expect(result.quantity).toBe(337);
    expect(result.formulaExplanation).toBe("337 TB required.");
    expect(result.formulaExplanation).not.toMatch(/undefined|null|NaN/);
    expect(drive).toEqual(before);
  });

  it("projects current engine drive packaging to capacity without mutating its provenance", () => {
    const engineering = new CctvSystemTemplate().calculate({ cameraCount: 130 });
    const drive = engineering.components.find((item) => item.componentKey === "SURVEILLANCE_HDD")!;
    const before = structuredClone(drive);
    const line = commercializeSystemComponent(drive, "en", engineering);
    expect(line).toMatchObject({ componentKey: "SURVEILLANCE_STORAGE_CAPACITY", quantity: 1, requestedUnitText: "Package", requestedPrice: null, commercializationPending: true });
    expect(line.commercialRequirement?.specification.requiredUsableTb).toBe(337);
    expect(line.commercialRequirement?.source.requirement).toEqual(before);
    expect(drive).toEqual(before);
    expect(drive).toMatchObject({ quantity: 19, unit: "Unit", specification: { driveCapacityTb: 18 } });
  });
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
    const customerFacing = JSON.stringify({ lines: proposal.lines.map(({ commercialRequirement: _internal, formulaExplanation: _formula, formulaExplanationAr: _formulaAr, provenance: _provenance, quantitySource: _quantitySource, ...line }) => line), notes: proposal.notes, terms: proposal.termsAndConditions });
    expect(customerFacing).not.toMatch(/engineeringRules|authoritySource|governmentVerified|ENGINEERING_DEFAULT|VERIFIED_AUTHORITY|ruleConflict/);
    expect(proposal.smartSystem?.engineeringRules?.version).toBe("1.0.0");
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
    const commercial = engineering.components.map((component) => commercializeSystemComponent(component, "en", engineering));
    expect(engineering).toEqual(before);
    expect(commercial.find((line) => line.componentKey === "CAT6_CABLING")?.text).toBe("CAT6 network cable 305m roll");
    expect(commercial.every((line) => !("engineeringRules" in line))).toBe(true);
    expect(commercial[0].commercialRequirement?.source.ruleVersion).toBe(engineering.templateVersion);
  });

  it("keeps the same cable-roll allocation for extracted catalog resolution", async () => {
    const result = await new AISalesAssistantExtractor().extractIntent(prompt, "en");
    const cable = result.intent.lines.find((line) => line.componentKey === "CAT6_CABLING");
    expect(cable).toMatchObject({ quantity: 13, requestedUnitText: "Roll", description: null });
    expect(cable?.formulaExplanation).toContain("305m roll");
  });
});
