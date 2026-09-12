import type { ConversionProvider } from "@/src/application/source-artifacts/ports";
import { UNAVAILABLE_CONVERSION_PROVIDER_ID } from "@/src/domain/source-artifact";
import { unavailableConversionProvider } from "./UnavailableConversionProvider";

// NOTE: this module must never import the deterministic test-double provider.
// Production derivation is either a separately authorized real provider or an
// explicit unavailable fallback; there is no silent path from "unconfigured"
// to fabricated output.

/**
 * Phase 2A-9: production conversion resolution.
 *
 * - `VOKA_CONVERSION_PROVIDER` unset/""/"off"/"none" -> the explicit
 *   unavailable provider: derivation records NOT_CONFIGURED truthfully;
 * - any other value -> the explicit unavailable provider naming the
 *   unsupported configuration. No known provider ships in this phase, so no
 *   configuration can resolve to a real converter yet.
 *
 * The deterministic test double is never returned here, under any
 * environment. Tests assert that structurally.
 */

/** Minimal environment surface the factory reads; `process.env` satisfies it. */
export type ProductionConversionEnv = Record<string, string | undefined>;

export const SUPPORTED_CONVERSION_PROVIDER_IDS: readonly string[] = [];

export function resolveProductionConversionConfig(env: ProductionConversionEnv = process.env): { provider: string } {
  return { provider: (env.VOKA_CONVERSION_PROVIDER ?? "").trim().toLowerCase() };
}

/**
 * Resolves the production conversion provider. Always a provider object —
 * never null, never a test double — so orchestration can always record an
 * explicit NOT_CONFIGURED lineage instead of skipping derivation silently.
 */
export function createProductionConversionProvider(env: ProductionConversionEnv = process.env): ConversionProvider {
  const config = resolveProductionConversionConfig(env);
  if (!config.provider || config.provider === "off" || config.provider === "none") {
    return unavailableConversionProvider(
      "no conversion provider is configured: set VOKA_CONVERSION_PROVIDER to an authorized provider; export the file from the authoring application instead",
    );
  }
  if (!SUPPORTED_CONVERSION_PROVIDER_IDS.includes(config.provider)) {
    return unavailableConversionProvider(
      `unknown conversion provider "${config.provider}"; no conversion provider is supported in this deployment, so the file was not converted`,
    );
  }
  // Unreachable in this phase: SUPPORTED_CONVERSION_PROVIDER_IDS is empty, so
  // every configured id resolves above. A future authorized provider is added
  // here behind its own configuration checks.
  return unavailableConversionProvider(`the conversion provider "${config.provider}" is not available in this deployment`);
}

export { UNAVAILABLE_CONVERSION_PROVIDER_ID };
