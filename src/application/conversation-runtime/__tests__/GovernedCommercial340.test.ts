import { describe, expect, it } from "vitest";
import { cctv340Scenario, candidates, marketPrice, now, proposal } from "./fixtures/cctv340";
import { resolveProductSelection } from "../product-selection";
import { buildSystemConfigurationGraph } from "../solution-graph";
import { renderGovernedResponse } from "../governed-workspace";

describe("exact governed 340-camera commercial coherence", () => {
  it("preserves split, approvals, capabilities and generic storage across real runtime turns", async () => {
    const journey = await cctv340Scenario();
    for (const state of [journey.split, journey.bulletApproved, journey.domeApproved, journey.nvrApproved, journey.confirmed, journey.rejected, journey.final]) {
      const bom = state.workspace!.commercialSolution.bom;
      expect(bom.filter((line) => /BULLET|DOME/.test(line.id)).map((line) => line.quantity)).toEqual([170, 170]);
      expect(bom.some((line) => line.id === "CCTV_CAMERAS")).toBe(false);
      expect(state.solutionGraph!.salesBom).toEqual(bom);
      expect(new Set(bom.map((line) => line.id)).size).toBe(bom.length);
    }
    const { final, rejected } = journey;
    const byId = (id: string) => final.workspace!.commercialSolution.bom.find((line) => line.id === id)!;
    expect(byId("CCTV_BULLET_CAMERA")).toMatchObject({ quantity: 170, model: "DS-2CD2T47", commercialAttributes: { subtype: "Bullet", resolution: "4MP" }, productSelectionStatus: "SELECTED", pricingStatus: "MARKET_REFERENCE_AVAILABLE", unitPrice: null, marketPrice });
    expect(byId("CCTV_DOME_CAMERA")).toMatchObject({ quantity: 170, model: "DS-2CD2147", commercialAttributes: { subtype: "Dome" }, productSelectionStatus: "SELECTED", marketPrice });
    expect(final.workspace!.products.approvedCandidateIds.sort()).toEqual(["bullet", "dome", "nvr"]);
    expect(journey.domeApproved.messages.at(-1)!.text).toContain("DS-2CD2147");
    expect(journey.nvrApproved.workspace!.commercialSolution.bom.find((line) => line.id === "NVR_RECORDER")!.quantity).toBe(7);
    expect(byId("NVR_RECORDER")).toMatchObject({ quantity: 6, model: "DS-9664NI-I16", commercialAttributes: { channels: 64, diskBays: 16 }, productSelectionStatus: "SELECTED", engineeringStatus: "EXACT", pricingStatus: "PENDING" });
    expect(byId("NVR_RECORDER").itemNameEn).toMatch(/DS-9664NI-I16.*64 Channel.*16 HDD Bays/);
    expect(byId("NVR_RECORDER").itemNameEn).not.toContain("8 HDD Bays");
    expect(byId("SURVEILLANCE_HDD")).toMatchObject({ quantity: 49, commercialAttributes: { capacity: "18TB" }, productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED", pricingStatus: "PENDING", unitPrice: null, calculationInputs: { requiredUsableTb: 882 } });
    expect(rejected.messages.at(-1)!.text).toContain("111 drives versus 96 available bays");
    expect(rejected.confirmedFacts["product.selection.SURVEILLANCE_HDD.id"]).toBeUndefined();
    expect(final.workspace!.products.candidates.some((candidate) => candidate.id === "wd8")).toBe(true);
    expect(byId("RACK_CABINET")).toMatchObject({ quantity: 1, quantityState: "PENDING", productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED" });
    expect(byId("CONNECTORS_AND_ACCESSORIES")).toMatchObject({ productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED" });
    expect(byId("CONNECTORS_AND_ACCESSORIES").catalogItemId).toBeUndefined();
    expect(byId("INSTALLATION_COMMISSIONING").itemNameEn).not.toMatch(/supply/i);
    expect(final.solutionGraph!.engineeringRuleSnapshot).toMatchObject({ trust: "ENGINEERING_DEFAULT", governmentVerified: false, values: { retentionDays: 30, bitrateMbps: 8, storageReservePercent: 0 } });
    expect(journey.toolsCalled.filter((kind) => kind === "JURISDICTION_RULE")).toHaveLength(1);
    expect(final.toolResults).toContainEqual(expect.objectContaining({ purpose: "JURISDICTION_RULE", status: "UNAVAILABLE" }));
    expect(final.suggestedReplies).toEqual(["Review installation"]);
  });

  it("recalculates compatible selected HDD packaging without retaining stale selection fields", async () => {
    const { final } = await cctv340Scenario();
    const candidate = { ...candidates[3], id: "wd16", name: "WD Purple 16TB", nameEn: "WD Purple 16TB", model: "Purple 16TB", capabilities: { capacityTb: 16 } };
    const result = resolveProductSelection({ confirmed: final.confirmedFacts, graph: { ...final.solutionGraph!, candidateProducts: [candidate] }, message: "Approve WD Purple 16TB", locale: "en", now });
    const graph = buildSystemConfigurationGraph(result.confirmed);
    expect(graph.salesBom.find((line) => line.id === "SURVEILLANCE_HDD")).toMatchObject({ quantity: 56, model: "Purple 16TB", commercialAttributes: { capacity: "16TB" }, productSelectionStatus: "SELECTED", pricingStatus: "PENDING" });
    expect(graph.compatibilityConflicts).toEqual([]);
  });

  it("renders only actual governed approvals even if the provider claims another product was approved", async () => {
    const { final } = await cctv340Scenario();
    const reply = renderGovernedResponse(proposal({ responseContent: "WD Purple 8TB is approved" }), "en", final.workspace);
    expect(reply).not.toContain("WD Purple");
    expect(reply).toContain("DS-9664NI-I16");
    const ar = renderGovernedResponse(proposal({ responseContent: "تم اعتماد WD Purple 8TB" }), "ar", final.workspace);
    expect(ar).not.toContain("WD Purple");
    expect(ar).toContain("DS-9664NI-I16");
  });

  it("rejects forged approval patches and retains one selection after a real replacement", async () => {
    const { final, turn } = await cctv340Scenario();
    const forged = await turn("Review storage", proposal({ responseContent: "The disk is approved", patches: [{ operation: "APPROVE", path: "products.candidates.wd8", value: "wd8", provenance: "AI_INFERRED", evidence: "Review storage" }] }));
    expect(forged.workspace!.products.approvedCandidateIds).toEqual(final.workspace!.products.approvedCandidateIds);
    expect(forged.confirmedFacts["product.selection.SURVEILLANCE_HDD.id"]).toBeUndefined();
    const replacement = { ...candidates[0], id: "replacement", model: "Bullet-New", name: "Replacement camera", nameEn: "Replacement camera", marketPrice: null };
    const result = resolveProductSelection({ graph: { ...final.solutionGraph!, candidateProducts: [replacement] }, confirmed: final.confirmedFacts, message: "Approve Bullet-New", locale: "en", now });
    expect(result.confirmed["product.selection.CCTV_BULLET_CAMERA.id"].value).toBe("replacement");
    expect(Object.keys(result.confirmed).some((key) => key.startsWith("product.selection.CCTV_BULLET_CAMERA.marketPrice."))).toBe(false);
  });

  it("removes rejected selection facts and displayed product identity together", async () => {
    const { turn } = await cctv340Scenario();
    const state = await turn("Do not approve that Bullet", proposal({ patches: [{ operation: "REJECT", path: "products.candidates.bullet", value: "bullet", provenance: "USER_CORRECTION", evidence: "Do not approve that Bullet" }] }));
    expect(state.workspace!.products.approvedCandidateIds).not.toContain("bullet");
    expect(state.confirmedFacts["product.selection.CCTV_BULLET_CAMERA.id"]).toBeUndefined();
    const bullet = state.workspace!.commercialSolution.bom.find((line) => line.id === "CCTV_BULLET_CAMERA")!;
    expect(bullet).toMatchObject({ quantity: 170, productSelectionStatus: "GENERIC", model: null, marketPrice: null, pricingStatus: "PENDING" });
    expect(bullet.itemNameEn).not.toContain("DS-2CD2T47");
  });

  it("preserves corrected NVR capabilities on reapproval and recalculates later retention corrections", async () => {
    const { turn } = await cctv340Scenario();
    const repeated = await turn("Approve Hikvision DS-9664NI-I16");
    expect(repeated.confirmedFacts["product.selection.NVR_RECORDER.capabilities.diskBays"]).toMatchObject({ value: 16, provenance: "USER_CORRECTION" });
    const corrected = await turn("Change retention to 60 days", proposal({ patches: [{ operation: "REPLACE", path: "facts.system.storageDays", value: 60, provenance: "USER_CORRECTION", evidence: "60 days" }] }));
    const storage = corrected.workspace!.commercialSolution.bom.filter((line) => line.id === "SURVEILLANCE_HDD");
    expect(storage).toHaveLength(1);
    expect(storage[0]).toMatchObject({ quantity: 98, engineeringStatus: "CONFLICT", calculationInputs: { storageDays: 60 } });
    expect(corrected.solutionGraph!.compatibilityConflicts).toContainEqual(expect.objectContaining({ code: "HDD_BAYS_EXCEEDED" }));
  });
});
