import { describe, expect, it } from "vitest";
import { detectExplicitSystemIdentity } from "../explicit-system-normalizer";
import { asksForProductOptions, renderProductOptionsReply } from "../product-options";
import { resolveProductSelection } from "../product-selection";
import { buildSystemConfigurationGraph } from "../solution-graph";
import type { ConfirmedFact } from "../types";

const fact = (
  key: string,
  value: string | number,
): ConfirmedFact => ({
  key,
  value,
  provenance: "USER_EXPLICIT",
  evidence: String(value),
  updatedAt: "2026-08-31T00:00:00.000Z",
});

describe("explicit system identity and product option presentation", () => {
  it("detects ceramic deterministically from an explicit Arabic request", () => {
    expect(
      detectExplicitSystemIdentity(
        "\u0639\u0627\u064a\u0632 \u0639\u0631\u0636 \u0633\u0639\u0631 \u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628 \u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0623\u0631\u0636\u064a\u0627\u062a 60x60 \u0644\u0645\u0633\u0627\u062d\u0629 450 \u0645\u062a\u0631 \u0641\u064a \u0627\u0644\u0643\u0648\u064a\u062a",
        "ar",
        "2026-08-31T00:00:00.000Z",
      ),
    ).toMatchObject({
      key: "system.identity",
      value: "\u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0623\u0631\u0636\u064a\u0627\u062a",
      provenance: "USER_EXPLICIT",
    });
  });

  it("detects CCTV deterministically from an explicit English request", () => {
    expect(
      detectExplicitSystemIdentity(
        "Supply and install CCTV system with 24 cameras",
        "en",
        "2026-08-31T00:00:00.000Z",
      ),
    ).toMatchObject({
      key: "system.identity",
      value: "CCTV system",
    });
  });

  it("does not invent a system identity when no supported system is explicit", () => {
    expect(
      detectExplicitSystemIdentity(
        "\u0639\u0627\u064a\u0632 \u0623\u062c\u0647\u0632 \u0639\u0631\u0636 \u0633\u0639\u0631",
        "ar",
        "2026-08-31T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("reuses the broader SmartSystem detection safety net for access control", () => {
    expect(detectExplicitSystemIdentity("Supply and install access control for 8 doors", "en", "2026-08-31T00:00:00.000Z")).toMatchObject({ value: "Access control system", provenance: "USER_EXPLICIT" });
  });

  it("recognizes explicit product comparison intent", () => {
    expect(
      asksForProductOptions(
        "\u0627\u0628\u062f\u0623 \u0625\u0639\u062f\u0627\u062f \u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0628\u062f\u0627\u0626\u0644",
      ),
    ).toBe(true);

    expect(
      asksForProductOptions(
        "\u0647\u0627\u062a\u0644\u064a 3 \u0645\u0627\u0631\u0643\u0627\u062a \u0645\u0646\u0627\u0633\u0628\u0629",
      ),
    ).toBe(true);
  });

  it("renders at most three truthful catalog and research options", () => {
    const graph = buildSystemConfigurationGraph({
      "system.identity": fact(
        "system.identity",
        "\u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0623\u0631\u0636\u064a\u0627\u062a",
      ),
      "system.areaM2": fact("system.areaM2", 450),
      "system.tileSize": fact("system.tileSize", "60x60"),
    });

    graph.candidateProducts = [
      {
        id: "1",
        componentKey: "CERAMIC_TILES",
        name: "Option A",
        nameAr: "\u0627\u062e\u062a\u064a\u0627\u0631 \u0623",
        nameEn: "Option A",
        brand: "Brand A",
        model: null,
        sku: "A",
        price: null,
        source: "VERIFIED_CATALOG",
      },
      {
        id: "2",
        componentKey: "CERAMIC_TILES",
        name: "Option B",
        nameAr: null,
        nameEn: "Option B",
        brand: "Brand B",
        model: null,
        sku: null,
        price: null,
        source: "RESEARCHED",
        sourceUrl: "https://example.com/b",
      },
      {
        id: "3",
        componentKey: "CERAMIC_TILES",
        name: "Option C",
        nameAr: null,
        nameEn: "Option C",
        brand: "Brand C",
        model: null,
        sku: null,
        price: null,
        source: "RESEARCHED",
        sourceUrl: "https://example.com/c",
      },
      {
        id: "4",
        componentKey: "CERAMIC_TILES",
        name: "Option D",
        nameAr: null,
        nameEn: "Option D",
        brand: "Brand D",
        model: null,
        sku: null,
        price: null,
        source: "RESEARCHED",
        sourceUrl: "https://example.com/d",
      },
    ];

    const reply = renderProductOptionsReply(graph, "ar", true);

    expect(reply).toContain("\u0627\u062e\u062a\u064a\u0627\u0631 \u0623");
    expect(reply).toContain("Option B");
    expect(reply).toContain("Option C");
    expect(reply).not.toContain("Option D");
  });

  it("recommends on choose-for-me without approval, then approval updates the governed Sales BOM", () => {
    const confirmed = {
      "system.identity": fact("system.identity", "Ceramic flooring"), "system.areaM2": fact("system.areaM2", 450),
      "system.tileSize": fact("system.tileSize", "60x60"), "system.jurisdiction": fact("system.jurisdiction", "Kuwait"),
      "customer.name": fact("customer.name", "National Telecom"),
    };
    const graph = buildSystemConfigurationGraph(confirmed);
    graph.candidateProducts = [{ id: "catalog-1", componentKey: "CERAMIC_TILES", name: "Porcelain Stone", nameAr: null, nameEn: "Porcelain Stone", brand: "RAK", model: "PS-6060", sku: "PS", price: 9, source: "VERIFIED_CATALOG" }];
    const recommendation = resolveProductSelection({ graph, confirmed, message: "choose for me", locale: "en", now: "2026-08-31T01:00:00.000Z" });
    expect(Object.keys(recommendation.confirmed).some((key) => key.startsWith("product.selection."))).toBe(false);
    expect(recommendation.reply).toMatch(/not approved/i);
    const approved = resolveProductSelection({ graph, confirmed, message: "approve option 1", locale: "en", now: "2026-08-31T01:01:00.000Z" });
    const updated = buildSystemConfigurationGraph(approved.confirmed);
    expect(updated.salesBom.find((line) => line.id === "CERAMIC_TILES")).toMatchObject({ catalogItemId: "catalog-1", brand: "RAK", model: "PS-6060", unitPrice: 9, provenance: "VERIFIED_CATALOG" });
  });
});
