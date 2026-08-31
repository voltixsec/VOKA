import { describe, expect, it } from "vitest";
import type { ConfirmedFact } from "../types";
import {
  promotePendingCandidateFacts,
  reduceFactProposals,
} from "../fact-reducer";
import { buildSystemConfigurationGraph } from "../solution-graph";
import { adaptCommercialHandoffToQuotationDraft } from "../quotation-handoff";

function explicitFact(
  key: string,
  value: string | number | boolean,
): ConfirmedFact {
  return {
    key,
    value,
    provenance: "USER_EXPLICIT",
    evidence: String(value),
    updatedAt: "2026-08-31T18:00:00.000Z",
  };
}

describe("Conversation solution approval state sync", () => {
  it("promotes approved ceramic estimates and rebuilds the exact governed workspace and draft state", () => {
    const base: Record<string, ConfirmedFact> = {
      "system.identity": explicitFact("system.identity", "سيراميك أرضيات"),
      "system.jurisdiction": explicitFact("system.jurisdiction", "الكويت"),
      "system.areaM2": explicitFact("system.areaM2", 450),
      "system.tileSize": explicitFact("system.tileSize", "60x60"),
      "system.qualityTier": explicitFact("system.qualityTier", "MID"),
      "scope.type": explicitFact(
        "scope.type",
        "SUPPLY_AND_INSTALLATION",
      ),
      "ceramic.wastagePercent": explicitFact(
        "ceramic.wastagePercent",
        10,
      ),
    };

    const proposed = reduceFactProposals(
      base,
      [
        {
          key: "ceramic.adhesiveBags",
          value: 100,
          provenance: "AI_INFERRED",
          evidence: "Estimated adhesive requirement",
        },
        {
          key: "ceramic.groutKg",
          value: 200,
          provenance: "AI_INFERRED",
          evidence: "Estimated grout requirement",
        },
        {
          key: "ceramic.skirtingLm",
          value: 132,
          provenance: "AI_INFERRED",
          evidence: "Estimated skirting requirement",
        },
        {
          key: "ceramic.skirtingHeightCm",
          value: 10,
          provenance: "AI_INFERRED",
          evidence: "Estimated skirting height",
        },
        {
          key: "ceramic.levelingThicknessCm",
          value: 3,
          provenance: "AI_INFERRED",
          evidence: "Estimated leveling thickness",
        },
      ],
      "احسبلي الكميات التقريبية",
      "2026-08-31T18:01:00.000Z",
      "proposal-ceramic-1",
    );

    expect(proposed.confirmed["ceramic.adhesiveBags"]).toBeUndefined();

    expect(
      proposed.candidates.filter(
        (candidate) => candidate.status === "PENDING_APPROVAL",
      ),
    ).toHaveLength(5);

    const beforeApproval = buildSystemConfigurationGraph(
      proposed.confirmed,
    );

    expect(
      beforeApproval.engineeringBom.find(
        (line) => line.id === "CERAMIC_TILES",
      )?.quantity,
    ).toBe(1375);

    expect(
      beforeApproval.salesBom.find(
        (line) => line.id === "CERAMIC_TILES",
      ),
    ).toMatchObject({
      quantity: 495,
      unitName: "m²",
    });

    expect(
      beforeApproval.salesBom.find(
        (line) => line.id === "CERAMIC_ADHESIVE",
      )?.quantity,
    ).toBeNull();

    const approved = promotePendingCandidateFacts(
      proposed.confirmed,
      proposed.candidates,
      "اعتمد",
      "2026-08-31T18:02:00.000Z",
    );

    expect(approved.promotedKeys.sort()).toEqual(
      [
        "ceramic.adhesiveBags",
        "ceramic.groutKg",
        "ceramic.levelingThicknessCm",
        "ceramic.skirtingHeightCm",
        "ceramic.skirtingLm",
      ].sort(),
    );

    for (const key of approved.promotedKeys) {
      expect(approved.confirmed[key]?.provenance).toBe(
        "USER_APPROVED",
      );
      expect(approved.confirmed[key]?.evidence).toBe("اعتمد");
    }

    const graph = buildSystemConfigurationGraph(
      approved.confirmed,
    );

    expect(
      graph.engineeringBom.find(
        (line) => line.id === "CERAMIC_TILES",
      ),
    ).toMatchObject({
      quantity: 1375,
      unitName: "tile",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_TILES",
      ),
    ).toMatchObject({
      quantity: 495,
      unitName: "m²",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_ADHESIVE",
      ),
    ).toMatchObject({
      quantity: 100,
      unitName: "bag",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_GROUT",
      ),
    ).toMatchObject({
      quantity: 200,
      unitName: "kg",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_SKIRTING",
      ),
    ).toMatchObject({
      quantity: 132,
      unitName: "lm",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_LEVELING",
      ),
    ).toMatchObject({
      quantity: 450,
      unitName: "m²",
    });

    expect(
      graph.salesBom.find(
        (line) => line.id === "CERAMIC_LABOR",
      ),
    ).toMatchObject({
      quantity: 450,
      unitName: "m²",
    });

    expect(
      graph.engineeringCalculations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "ceramic.baseTiles",
          value: "1250",
        }),
        expect.objectContaining({
          key: "ceramic.procurementTiles",
          value: "1375",
        }),
        expect.objectContaining({
          key: "ceramic.levelingVolumeM3",
          value: "13.5 m³",
        }),
      ]),
    );
    const handoffLines = graph.salesBom.map((line) => ({ catalogItemId: line.catalogItemId ?? null, itemName: line.itemName, itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn, description: line.description, unitName: line.unitName, quantity: line.quantity, unitPrice: line.unitPrice, type: line.type, authority: line.provenance === "VERIFIED_CATALOG" ? "VERIFIED_DATABASE" as const : line.provenance === "RESEARCHED" ? "RESEARCHED" as const : "DETERMINISTIC_DERIVATION" as const, quantityState: line.quantityState, priceState: line.priceState, componentKeys: line.componentKeys, brand: line.brand, model: line.model }));
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: { runtimeId: "runtime-1", confirmedFacts: { ...approved.confirmed, "customer.name": explicitFact("customer.name", "National Telecom") }, commercialLines: handoffLines, toolEvidence: [], createdAt: "2026-08-31T18:00:00.000Z" }, customer: { status: "RESOLVED", id: "customer-1", name: "National Telecom" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null }, locale: "en" });
    expect(draft?.lines.map((line) => ({ itemNameEn: line.itemNameEn, quantity: line.quantity, unitName: line.unitName }))).toEqual(graph.salesBom.map((line) => ({ itemNameEn: line.itemNameEn, quantity: line.quantity, unitName: line.unitName })));
  });
});
