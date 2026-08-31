import { describe, expect, it } from "vitest";
import { buildSystemConfigurationGraph, type ConfirmedFact } from "../index";

const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });
const facts = (values: Record<string, string | number>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fact(key, value)]));

describe("System Configuration Graph", () => {
  it("builds separate ceramic engineering and concise Sales BOMs with genuine pending values", () => {
    const graph = buildSystemConfigurationGraph(facts({ "system.identity": "سيراميك أرضيات", "system.areaM2": 450, "system.tileSize": "60x60", "scope.type": "SUPPLY_AND_INSTALLATION" }));
    expect(graph.system?.key).toBe("CERAMIC_FLOORING");
    expect(graph.engineeringCalculations).toContainEqual(expect.objectContaining({ key: "ceramic.baseTiles", value: "1250" }));
    expect(graph.engineeringBom.find((line) => line.id === "CERAMIC_ADHESIVE")?.itemNameEn).toContain("suitable for tile and substrate");
    expect(graph.salesBom.find((line) => line.id === "CERAMIC_TILES")).toMatchObject({ itemNameAr: "سيراميك أرضيات 60x60 سم", quantity: 450, unitPrice: null, priceState: "PENDING" });
    expect(graph.salesBom.find((line) => line.id === "CERAMIC_ADHESIVE")?.quantity).toBeNull();
  });

  it("retains rich governed gypsum decomposition", () => {
    const graph = buildSystemConfigurationGraph(facts({ "system.identity": "نظام جبس بورد", "system.areaM2": 2000, "system.layersCount": 1, "scope.type": "SUPPLY_AND_INSTALLATION" }));
    expect(graph.engineeringBom.length).toBeGreaterThan(5);
    expect(graph.engineeringBom.map((line) => line.id)).toEqual(expect.arrayContaining(["GYPSUM_BOARDS", "DRYWALL_SCREWS", "JOINT_COMPOUND", "GYPSUM_LABOR"]));
    expect(graph.salesBom.every((line) => !line.description)).toBe(true);
  });

  it("keeps FM-200 sizing absent and safety-critical until governed enclosure inputs exist", () => {
    const graph = buildSystemConfigurationGraph(facts({ "system.identity": "FM-200" }));
    expect(graph.engineeringBom).toEqual([]);
    expect(graph.salesBom).toEqual([]);
    expect(graph.unresolvedDecisions).toContainEqual(expect.objectContaining({ key: "fm200.protectedVolume", safetyCritical: true }));
  });
});
