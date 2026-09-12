import type { ConversionProvider, ConversionRequest, ConversionResult } from "@/src/application/source-artifacts/ports";
import { UNAVAILABLE_CONVERSION_PROVIDER_ID, type ArtifactDerivationKind } from "@/src/domain/source-artifact";

/**
 * Phase 2A-9: the explicit unavailable conversion provider.
 *
 * VOKA ships no production DWG/RVT converter in this phase. This provider is
 * what the production factory resolves for every configuration: it performs
 * no conversion, produces no bytes, and reports the configuration reason
 * truthfully so the orchestrator can record a NOT_CONFIGURED derivation
 * instead of pretending a conversion happened or silently skipping it.
 */
export function unavailableConversionProvider(reason = "no conversion provider is configured in this deployment"): ConversionProvider {
  return {
    providerId: UNAVAILABLE_CONVERSION_PROVIDER_ID,
    converterVersion: "none",
    supportedDerivationKinds: ["DWG_TO_DXF", "RVT_TO_IFC"] as ArtifactDerivationKind[],
    convert: async (request: ConversionRequest): Promise<ConversionResult> => ({
      status: "UNAVAILABLE",
      reason,
      warnings: [],
      converterVersion: null,
    }),
  };
}
