import { describe, expect, it, vi } from "vitest";
import { CctvSystemTemplate, resolveCommercialPackaging, type EngineeringRuleProfile } from "@/src/domain/smart-system";
import { buildSystemConfigurationGraph, ConversationRuntime, emptySystemConfigurationGraph, resolveProductSelection, synchronizeWorkspace, type CandidateProduct, type ConfirmedFact, type ConversationBrainPort, type ConversationToolPort, type FlexibleTurnProposal, type SolutionBomLine } from "../index";

const now = "2026-09-02T00:00:00.000Z";
const fact = (key: string, value: string | number, provenance: ConfirmedFact["provenance"] = "USER_EXPLICIT"): ConfirmedFact => ({ key, value, provenance, evidence: String(value), updatedAt: now });

describe("generic engineering-to-commercial resolution", () => {
  const proposal = (patches: FlexibleTurnProposal["patches"] = []): FlexibleTurnProposal => ({ responseMode: "ACK", intent: "UPDATE", patches, researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null, responseContent: "Updated.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [] });

  it("resolves estimated CCTV storage into integer sellable HDDs, not an abstract TB sale line", () => {
    const graph = buildSystemConfigurationGraph({
      "system.identity": fact("system.identity", "CCTV"),
      "system.cameraCount": fact("system.cameraCount", 340),
      "system.resolutionMp": fact("system.resolutionMp", 4),
      "system.jurisdiction": fact("system.jurisdiction", "Kuwait"),
    });
    const storage = graph.salesBom.find((line) => line.id === "SURVEILLANCE_HDD");
    expect(storage).toMatchObject({ itemNameEn: "Surveillance hard disk drive, 18TB", unitName: "Unit", quantityState: "CONFIRMED", productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED", pricingStatus: "PENDING", commercialAttributes: { capacity: "18TB" } });
    expect(Number.isInteger(storage?.quantity)).toBe(true);
    expect(storage?.quantity).toBeGreaterThan(0);
    expect(graph.salesBom.some((line) => line.id === "SURVEILLANCE_STORAGE_CAPACITY" || line.unitName === "TB")).toBe(false);
    expect(graph.engineeringCalculations.find((item) => item.key === "SURVEILLANCE_HDD.quantity")).toMatchObject({ status: "ESTIMATED" });
  });

  it("converts engineering meters into indivisible purchasing rolls", () => {
    expect(resolveCommercialPackaging({ requiredQuantity: 1_500, requiredUnit: "m", packageQuantity: 305, packageUnit: "roll", status: "EXACT" })).toMatchObject({ commercialQuantity: 5, packageUnit: "roll", status: "EXACT" });
  });

  it("converts ceramic area including wastage into governed box quantity when package coverage exists", () => {
    const graph = buildSystemConfigurationGraph({
      "system.identity": fact("system.identity", "Ceramic flooring"),
      "system.areaM2": fact("system.areaM2", 450),
      "ceramic.wastagePercent": fact("ceramic.wastagePercent", 10),
      "ceramic.packageAreaM2": fact("ceramic.packageAreaM2", 1.44),
    });
    expect(graph.salesBom.find((line) => line.id === "CERAMIC_TILES")).toMatchObject({ quantity: 344, unitName: "box", engineeringStatus: "EXACT" });
  });

  it("recalculates from better inputs and replaces the previous calculation key", () => {
    const base = { "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 340), "system.resolutionMp": fact("system.resolutionMp", 4) };
    const estimated = buildSystemConfigurationGraph(base);
    const exact = buildSystemConfigurationGraph({ ...base, "system.storageDays": fact("system.storageDays", 60, "USER_CORRECTION") });
    expect(exact.engineeringCalculations.filter((item) => item.key === "SURVEILLANCE_HDD.quantity")).toHaveLength(1);
    expect(exact.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")?.quantity).toBeGreaterThan(estimated.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")?.quantity ?? 0);
  });

  it("uses an authoritative jurisdiction profile without hardcoding it globally", () => {
    const profile: EngineeringRuleProfile = { id: "kw-authority", name: "Verified Kuwait retention", jurisdiction: "Kuwait", version: "2026-1", trust: "VERIFIED_AUTHORITY", authoritySource: "https://authority.example/retention", values: { retentionDays: 90, codec: "H.265", resolutionMp: 4, fps: 15, bitrateMbps: 8, storageReservePercent: 10, nvrUtilizationPercent: 80, poeReservedPorts: 2, cableMetersPerCamera: 30, cableRollMeters: 305, rackAllowance: 1, storageDriveCapacityTb: 18 } };
    const result = new CctvSystemTemplate({ jurisdiction: "Kuwait", verifiedJurisdictionProfile: profile }).calculate({ cameraCount: 8, resolutionMp: 4 });
    expect(result.engineeringRules).toMatchObject({ governmentVerified: true, authoritySource: profile.authoritySource });
    expect(result.inputs.find((item) => item.name === "storageDays")?.value).toBe(90);
  });

  it("requests authoritative jurisdiction research and feeds verified evidence into strict calculation", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal([
      { operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "facts.system.cameraCount", value: 8, evidence: "8 cameras", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "facts.system.jurisdiction", value: "Kuwait", evidence: "Kuwait", provenance: "USER_EXPLICIT" },
    ]) };
    const execute = vi.fn(async ({ request }: Parameters<ConversationToolPort["execute"]>[0]) => ({
      kind: "RESEARCH" as const, purpose: request.purpose, status: "COMPLETED" as const, summary: "verified retention",
      evidence: [{ title: "Authority rule", url: "https://authority.gov.kw/retention", publisher: "authority.gov.kw" }],
      engineeringRules: [{ systemType: "CCTV", jurisdiction: "Kuwait", profileId: "kw-retention", profileVersion: "2026", authoritySourceUrl: "https://authority.gov.kw/retention", authoritySourceTitle: "Authority rule", sourceType: "GOVERNMENT_AUTHORITY" as const, values: { retentionDays: 90 } }],
      createdAt: now,
    }));
    const state = await new ConversationRuntime(brain, { execute }, () => now, () => "id").execute({ state: null, message: "CCTV for 8 cameras in Kuwait", locale: "en", source: "TEXT", companyId: "c1" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ kind: "RESEARCH", purpose: "JURISDICTION_RULE" }) }));
    expect(state.solutionGraph?.engineeringRuleSnapshot).toMatchObject({ id: "kw-retention", trust: "VERIFIED_AUTHORITY", authoritySource: "https://authority.gov.kw/retention", fieldSources: { retentionDays: "VERIFIED_AUTHORITY", bitrateMbps: "ENGINEERING_DEFAULT" } });
    expect(state.solutionGraph?.engineeringCalculations.find((item) => item.key === "SURVEILLANCE_HDD.quantity")?.inputs?.storageDays).toBe(90);
  });

  it("falls back to an estimated professional default when authoritative evidence is unavailable", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal([
      { operation: "SET", path: "facts.system.identity", value: "CCTV", evidence: "CCTV", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "facts.system.cameraCount", value: 8, evidence: "8 cameras", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "facts.system.jurisdiction", value: "Kuwait", evidence: "Kuwait", provenance: "USER_EXPLICIT" },
    ]) };
    const execute = vi.fn(async ({ request }: Parameters<ConversationToolPort["execute"]>[0]) => ({ kind: "RESEARCH" as const, purpose: request.purpose, status: "UNAVAILABLE" as const, summary: "no authority evidence", evidence: [], createdAt: now }));
    const state = await new ConversationRuntime(brain, { execute }, () => now, () => "id").execute({ state: null, message: "CCTV for 8 cameras in Kuwait", locale: "en", source: "TEXT", companyId: "c1" });
    expect(state.solutionGraph?.engineeringRuleSnapshot).toMatchObject({ trust: "ENGINEERING_DEFAULT", governmentVerified: false, authoritySource: null });
    expect(state.solutionGraph?.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")).toMatchObject({ engineeringStatus: "ESTIMATED" });
    expect(JSON.stringify(state.solutionGraph)).not.toMatch(/mandatory|law|required by Kuwait/i);
  });

  it("recalculates recorder and disk quantities from approved product capabilities", () => {
    const capabilities = { channels: 32, diskBays: 2, maxHddCapacityTb: 18, supportedCodec: "H.265" as const, incomingBandwidthMbps: 256, raidSupported: true };
    const candidate: CandidateProduct = { id: "nvr-1", componentKey: "NVR_RECORDER", name: "Acme NVR", nameAr: null, nameEn: "Acme NVR", brand: "Acme", model: "N32", sku: null, price: null, source: "RESEARCHED", capabilities };
    const baseFacts = { "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 64), "system.jurisdiction": fact("system.jurisdiction", "Kuwait") };
    const selected = resolveProductSelection({ graph: { ...emptySystemConfigurationGraph(), candidateProducts: [candidate] }, confirmed: baseFacts, message: "Approve Acme N32", locale: "en", now }).confirmed;
    const graph = buildSystemConfigurationGraph(selected);
    expect(graph.salesBom.find((line) => line.id === "NVR_RECORDER")).toMatchObject({ quantity: 5, brand: "Acme", model: "N32", engineeringStatus: "EXACT" });
    expect(graph.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")).toMatchObject({ quantity: 10 });
    expect(graph.compatibilityConflicts).toEqual([]);
  });

  it("surfaces an incompatible approved recorder instead of silently accepting the design", () => {
    const candidate: CandidateProduct = { id: "nvr-bad", componentKey: "NVR_RECORDER", name: "Legacy NVR", nameAr: null, nameEn: "Legacy NVR", brand: "Acme", model: "Legacy", sku: null, price: null, source: "RESEARCHED", capabilities: { channels: 64, diskBays: 8, maxHddCapacityTb: 18, supportedCodec: "H.264", incomingBandwidthMbps: 512 } };
    const baseFacts = { "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 64) };
    const selected = resolveProductSelection({ graph: { ...emptySystemConfigurationGraph(), candidateProducts: [candidate] }, confirmed: baseFacts, message: "Approve Acme Legacy", locale: "en", now }).confirmed;
    const graph = buildSystemConfigurationGraph(selected);
    expect(graph.compatibilityConflicts).toContainEqual(expect.objectContaining({ code: "RECORDER_CODEC_INCOMPATIBLE" }));
    expect(graph.readiness.pendingBeforeFinalIssue).toContain("Compatibility review");
  });

  it("makes the storage number reproducible from the exact resolved rule snapshot", () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 340), "system.jurisdiction": fact("system.jurisdiction", "Kuwait") });
    const snapshot = graph.engineeringRuleSnapshot!;
    const expectedTb = Math.ceil(340 * snapshot.values.bitrateMbps * 86_400 * snapshot.values.retentionDays / 8 / 1_000_000 * (1 + snapshot.values.storageReservePercent / 100));
    const storage = graph.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")!;
    const calculation = graph.engineeringCalculations.find((item) => item.key === "SURVEILLANCE_HDD.quantity")!;
    expect(storage.calculationInputs).toMatchObject({ requiredUsableTb: expectedTb, bitrateMbps: snapshot.values.bitrateMbps, storageDays: snapshot.values.retentionDays });
    expect(calculation.ruleSnapshot).toEqual(snapshot);
    expect(snapshot).toMatchObject({ id: "cctv-engineering-default", version: "1.0.0", trust: "ENGINEERING_DEFAULT", jurisdiction: "Kuwait", authoritySource: null, overriddenFields: [] });
  });

  it("keeps the exact 340-camera governed structure, approvals, storage architecture, and independent commercial states coherent", () => {
    const marketPrice = { priceAmount: 39, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "unit", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://supplier.example/4mp", priceSourceTitle: "Kuwait camera listing", priceObservedAt: now };
    const bullet: CandidateProduct = { id: "bullet-4mp", componentKey: "CCTV_BULLET_CAMERA", name: "Hikvision 4MP Bullet", nameAr: null, nameEn: "Hikvision 4MP Bullet Camera", brand: "Hikvision", model: "DS-2CD2T47", sku: null, price: null, source: "RESEARCHED", marketPrice };
    const dome: CandidateProduct = { ...bullet, id: "dome-4mp", componentKey: "CCTV_DOME_CAMERA", name: "Hikvision 4MP Dome", nameEn: "Hikvision 4MP Dome Camera", model: "DS-2CD2147" };
    const nvr: CandidateProduct = { id: "nvr-i16", componentKey: "NVR_RECORDER", name: "Hikvision DS-9664NI-I16", nameAr: null, nameEn: "Hikvision DS-9664NI-I16 Network Video Recorder", brand: "Hikvision", model: "DS-9664NI-I16", sku: null, price: null, source: "RESEARCHED", capabilities: { channels: 64, diskBays: 16, maxHddCapacityTb: 18, supportedCodec: "H.265", incomingBandwidthMbps: 512, raidSupported: true } };
    const incompatibleHdd: CandidateProduct = { id: "wd-purple-8tb", componentKey: "SURVEILLANCE_HDD", name: "WD Purple 8TB", nameAr: null, nameEn: "WD Purple 8TB Surveillance HDD", brand: "Western Digital", model: "Purple 8TB", sku: null, price: null, source: "RESEARCHED" };
    const baseFacts = {
      "system.identity": fact("system.identity", "CCTV"),
      "system.jurisdiction": fact("system.jurisdiction", "Kuwait"),
      "scope.type": fact("scope.type", "SUPPLY_AND_INSTALLATION"),
      "system.cameraCount": fact("system.cameraCount", 340),
      "system.resolutionMp": fact("system.resolutionMp", 4),
      "customer.name": fact("customer.name", "Kuwait Customer"),
      "attention.name": fact("attention.name", "Eng. Ahmad"),
    };
    const initialGraph = buildSystemConfigurationGraph(baseFacts);
    const cameraParent = initialGraph.salesBom.find((line) => line.id === "CCTV_CAMERAS")!;
    const cameraLine = (id: string, subtype: string): SolutionBomLine => ({
      ...cameraParent, id, componentKeys: [id], itemName: `4MP IP ${subtype} Camera`, itemNameAr: `كاميرا ${subtype} شبكية 4MP`,
      itemNameEn: `4MP IP ${subtype} Camera`, description: `${subtype}; 4MP`, quantity: 170, provenance: "USER_EXPLICIT",
      commercialAttributes: { subtype, resolution: "4MP" }, productSelectionStatus: "GENERIC", engineeringStatus: "EXACT", pricingStatus: "PENDING",
    });
    const governedLines = initialGraph.salesBom.flatMap((line) => line.id === "CCTV_CAMERAS" ? [cameraLine("CCTV_BULLET_CAMERA", "Bullet"), cameraLine("CCTV_DOME_CAMERA", "Dome")] : [line]);
    const candidates = [bullet, dome, nvr, incompatibleHdd];
    const prior = synchronizeWorkspace(undefined, baseFacts, { ...initialGraph, salesBom: governedLines, engineeringBom: governedLines, candidateProducts: candidates }, now);
    const first = resolveProductSelection({ graph: { ...initialGraph, candidateProducts: candidates }, confirmed: baseFacts, message: "Approve DS-2CD2T47", locale: "en", now }).confirmed;
    const second = resolveProductSelection({ graph: { ...initialGraph, candidateProducts: candidates }, confirmed: first, message: "Approve DS-2CD2147", locale: "en", now }).confirmed;
    const selected = resolveProductSelection({ graph: { ...initialGraph, candidateProducts: candidates }, confirmed: second, message: "Approve DS-9664NI-I16", locale: "en", now }).confirmed;
    const recalculated = buildSystemConfigurationGraph(selected);
    const workspace = synchronizeWorkspace(prior, selected, { ...recalculated, candidateProducts: candidates }, now);
    const byId = (id: string) => workspace.commercialSolution.bom.find((line) => line.id === id)!;

    expect(workspace.commercialSolution.bom.filter((line) => /BULLET|DOME/.test(line.id)).map((line) => [line.id, line.quantity])).toEqual([["CCTV_BULLET_CAMERA", 170], ["CCTV_DOME_CAMERA", 170]]);
    expect(byId("CCTV_BULLET_CAMERA")).toMatchObject({ brand: "Hikvision", model: "DS-2CD2T47", productSelectionStatus: "SELECTED", engineeringStatus: "EXACT", pricingStatus: "MARKET_REFERENCE_AVAILABLE", marketPrice });
    expect(byId("CCTV_DOME_CAMERA")).toMatchObject({ brand: "Hikvision", model: "DS-2CD2147", productSelectionStatus: "SELECTED" });
    expect(byId("NVR_RECORDER")).toMatchObject({ quantity: 6, brand: "Hikvision", model: "DS-9664NI-I16", productSelectionStatus: "SELECTED", engineeringStatus: "EXACT", pricingStatus: "PENDING", commercialAttributes: { channels: 64, diskBays: 16 } });
    expect(byId("NVR_RECORDER").itemNameEn).toMatch(/DS-9664NI-I16.*64 Channel.*16 HDD Bays/);
    expect(byId("SURVEILLANCE_HDD")).toMatchObject({ quantity: 49, productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED", pricingStatus: "PENDING", commercialAttributes: { capacity: "18TB" } });
    expect(byId("SURVEILLANCE_HDD").itemNameEn).toContain("18TB");
    expect(workspace.products.approvedCandidateIds).toEqual(expect.arrayContaining(["bullet-4mp", "dome-4mp", "nvr-i16"]));
    expect(workspace.products.approvedCandidateIds).not.toContain("wd-purple-8tb");
    expect(byId("RACK_CABINET")).toMatchObject({ quantity: 1, quantityState: "PENDING", productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED" });
    expect(byId("CONNECTORS_AND_ACCESSORIES")).toMatchObject({ productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED" });
    expect(byId("INSTALLATION_COMMISSIONING").itemNameEn).not.toMatch(/supply/i);
  });
});
