import { describe, expect, it } from "vitest";

import { mapBulkEnvelopeToRawPayload } from "../mapBulkEnvelopeToRawPayload";

describe("mapBulkEnvelopeToRawPayload", () => {
  it("maps a bulk envelope payload and envelope-level identifiers", () => {
    const mapped = mapBulkEnvelopeToRawPayload(
      {
        schemaVersion: "1.0",
        entityType: "PRODUCT_MODEL",
        externalKey: "hikvision:ds-2cd2143",
        payload: {
          name: "Hikvision Dome",
          manufacturer: "Hikvision",
          brand: "Hikvision",
          modelNumber: "DS-2CD2143G0-I",
        },
        identifiers: [
          { type: "GTIN_13", value: "6931847101234" },
        ],
        aliases: [
          { value: "Dome Camera", locale: "EN" },
        ],
      },
      "PRODUCT_MODEL",
      "hikvision:ds-2cd2143",
    );

    expect(mapped.name).toBe("Hikvision Dome");
    expect(mapped.type).toBe("PRODUCT");
    expect(mapped.manufacturerName).toBe("Hikvision");
    expect(mapped.brandName).toBe("Hikvision");
    expect(mapped.modelNumber).toBe("DS-2CD2143G0-I");
    expect(mapped.identifiers).toEqual([
      {
        identifierType: "GTIN_13",
        value: "6931847101234",
        source: null,
      },
    ]);
    expect(mapped.aliases?.[0]?.alias).toBe("Dome Camera");
  });

  it("falls back to the external key when no commercial name is present", () => {
    const mapped = mapBulkEnvelopeToRawPayload(
      {
        payload: {},
      },
      "RELATION",
      "relation:camera:system",
    );

    expect(mapped.name).toBe("relation:camera:system");
    expect(mapped.type).toBe("CUSTOM");
  });

  it("maps SERVICE and SYSTEM entity types", () => {
    expect(
      mapBulkEnvelopeToRawPayload(
        { payload: { name: "Install" } },
        "SERVICE",
        "svc-1",
      ).type,
    ).toBe("SERVICE");

    expect(
      mapBulkEnvelopeToRawPayload(
        { payload: { name: "CCTV" } },
        "SYSTEM",
        "sys-1",
      ).type,
    ).toBe("SYSTEM");
  });
});
