import { describe, it, expect } from "vitest";
import { IdentityResolutionService, IdentityResolutionContext } from "../IdentityResolutionService";
import { NormalizationPipelineService } from "../../normalization/NormalizationPipelineService";

describe("IdentityResolutionService", () => {
  const samplePayload = NormalizationPipelineService.normalize({
    name: "Hikvision IP Camera",
    manufacturerName: "Hikvision",
    modelNumber: "DS-2CD2143G0-I",
    identifiers: [
      { identifierType: "GTIN_13", value: "6931847101234" },
      { identifierType: "MPN", value: "DS-2CD2143G0-I" },
    ],
  });

  it("prioritizes existing source external ref match (Rule 1)", async () => {
    const context: IdentityResolutionContext = {
      findItemBySourceExternalRef: async () => ({ id: "item-src-1" }),
      findItemByGlobalIdentifier: async () => ({ id: "item-global-1" }),
    };

    const result = await IdentityResolutionService.resolveIdentity(
      samplePayload,
      "source-1",
      "ext-123",
      context
    );

    expect(result.status).toBe("MATCHED");
    expect(result.matchedItemId).toBe("item-src-1");
    expect(result.confidenceReason).toBe("EXISTING_SOURCE_EXTERNAL_REF");
  });

  it("matches exact GTIN/EAN/UPC identifier (Rule 2)", async () => {
    const context: IdentityResolutionContext = {
      findItemByGlobalIdentifier: async (type, val) => {
        if (type === "GTIN_13" && val === "6931847101234") {
          return { id: "item-gtin-1" };
        }
        return null;
      },
    };

    const result = await IdentityResolutionService.resolveIdentity(
      samplePayload,
      "source-1",
      "ext-123",
      context
    );

    expect(result.status).toBe("MATCHED");
    expect(result.matchedItemId).toBe("item-gtin-1");
    expect(result.confidenceReason).toBe("EXACT_GLOBAL_IDENTIFIER");
  });

  it("matches manufacturer + MPN (Rule 3)", async () => {
    const context: IdentityResolutionContext = {
      findItemByManufacturerMpn: async (_mId, mName, mpn) => {
        if (mName === "Hikvision" && mpn === "DS-2CD2143G0-I") {
          return { id: "item-mpn-1" };
        }
        return null;
      },
    };

    const payloadWithoutGtin = NormalizationPipelineService.normalize({
      name: "Hikvision IP Camera",
      manufacturerName: "Hikvision",
      identifiers: [{ identifierType: "MPN", value: "DS-2CD2143G0-I" }],
    });

    const result = await IdentityResolutionService.resolveIdentity(
      payloadWithoutGtin,
      "source-1",
      "ext-123",
      context
    );

    expect(result.status).toBe("MATCHED");
    expect(result.matchedItemId).toBe("item-mpn-1");
    expect(result.confidenceReason).toBe("EXACT_MANUFACTURER_MPN");
  });

  it("routes ambiguous multiple name matches to NEEDS_REVIEW without auto-merging", async () => {
    const context: IdentityResolutionContext = {
      findItemsByConservativeName: async () => [
        { id: "item-cand-1" },
        { id: "item-cand-2" },
      ],
    };

    const payloadNameOnly = NormalizationPipelineService.normalize({
      name: "Generic Camera",
    });

    const result = await IdentityResolutionService.resolveIdentity(
      payloadNameOnly,
      "source-1",
      "ext-123",
      context
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.matchedItemId).toBeNull();
    expect(result.confidenceReason).toBe("AMBIGUOUS_MULTIPLE_MATCHES");
  });
});
