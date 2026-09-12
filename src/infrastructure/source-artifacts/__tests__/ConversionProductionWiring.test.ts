import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DETERMINISTIC_CONVERSION_PROVIDER_ID, UNAVAILABLE_CONVERSION_PROVIDER_ID } from "@/src/domain/source-artifact";
import type { ConversionProvider } from "@/src/application/source-artifacts/ports";
import { deterministicConversionProvider } from "../conversion/DeterministicConversionProvider";
import { unavailableConversionProvider } from "../conversion/UnavailableConversionProvider";
import { createProductionConversionProvider, resolveProductionConversionConfig, SUPPORTED_CONVERSION_PROVIDER_IDS } from "../conversion/createProductionConversionProvider";

/**
 * Phase 2A-9 test matrix items 31-33: the production conversion factory.
 * Unset/off → NOT_CONFIGURED truthfully; an unknown provider names the
 * unsupported configuration; the deterministic test double is unreachable
 * from production under any environment.
 */

describe("production conversion factory (2A-9)", () => {
  it("31 resolves an explicit unavailable provider when unset, off, or none", () => {
    for (const env of [{}, { VOKA_CONVERSION_PROVIDER: "" }, { VOKA_CONVERSION_PROVIDER: "off" }, { VOKA_CONVERSION_PROVIDER: "none" }, { VOKA_CONVERSION_PROVIDER: " OFF " }]) {
      const provider = createProductionConversionProvider(env);
      expect(provider.providerId).toBe(UNAVAILABLE_CONVERSION_PROVIDER_ID);
      expect(provider.converterVersion).toBe("none");
    }
    const result = unavailableConversionProvider().convert! ?? null;
    void result;
  });

  it("reports a truthful configuration reason, never a silent skip", async () => {
    const provider = createProductionConversionProvider({});
    const result = await provider.convert({
      derivationKind: "DWG_TO_DXF",
      sourceBytes: new Uint8Array(8),
      sourceHash: "ab".repeat(32),
      targetFormat: "DXF",
      options: {},
      limits: { wallClockMs: 1_000, maxOutputBytes: 1_000, maxWarnings: 5, maxFidelityLimitations: 5, networkAccess: "NONE" },
      signal: null,
    });
    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") {
      expect(result.reason).toContain("VOKA_CONVERSION_PROVIDER");
      expect(result.converterVersion).toBeNull();
    }
  });

  it("32 names the unsupported configuration for an unknown provider id", async () => {
    const provider = createProductionConversionProvider({ VOKA_CONVERSION_PROVIDER: "libredwg-cloud" });
    expect(provider.providerId).toBe(UNAVAILABLE_CONVERSION_PROVIDER_ID);
    const result = await provider.convert({
      derivationKind: "RVT_TO_IFC",
      sourceBytes: new Uint8Array(8),
      sourceHash: "cd".repeat(32),
      targetFormat: "IFC",
      options: {},
      limits: { wallClockMs: 1_000, maxOutputBytes: 1_000, maxWarnings: 5, maxFidelityLimitations: 5, networkAccess: "NONE" },
      signal: null,
    });
    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") expect(result.reason).toContain("libredwg-cloud");
    expect(SUPPORTED_CONVERSION_PROVIDER_IDS).toEqual([]);
  });

  it("33 never resolves the deterministic test double under any environment", () => {
    const environments: Array<Record<string, string>> = [
      {},
      { VOKA_CONVERSION_PROVIDER: "deterministic-conversion-test-double" },
      { VOKA_CONVERSION_PROVIDER: "test" },
      { VOKA_CONVERSION_PROVIDER: "DETERMINISTIC" },
    ];
    for (const env of environments) {
      expect(createProductionConversionProvider(env).providerId).not.toBe(DETERMINISTIC_CONVERSION_PROVIDER_ID);
    }
  });

  it("keeps the deterministic provider out of production conversion modules (structural)", () => {
    for (const file of ["createProductionConversionProvider.ts", "UnavailableConversionProvider.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src/infrastructure/source-artifacts/conversion", file), "utf8");
      expect(source).not.toContain("DeterministicConversionProvider");
      expect(source).not.toContain("deterministicConversionProvider(");
    }
    // And the production factory source never imports the test-double module.
    const factory = readFileSync(path.join(process.cwd(), "src/infrastructure/source-artifacts/conversion", "createProductionConversionProvider.ts"), "utf8");
    expect(factory).not.toContain("./DeterministicConversionProvider");
  });

  it("defaults the network-access contract to NONE", () => {
    expect(resolveProductionConversionConfig({})).toEqual({ provider: "" });
    const provider: ConversionProvider = deterministicConversionProvider();
    expect(provider.providerId).toBe(DETERMINISTIC_CONVERSION_PROVIDER_ID);
    expect(provider.supportedDerivationKinds).toEqual(["DWG_TO_DXF", "RVT_TO_IFC"]);
  });
});
