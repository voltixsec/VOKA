import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import {
  UNAVAILABLE_VISION_PROVIDER_ID,
  type VisualInspectionRequest,
  type VisualInspectionResult,
} from "@/src/domain/source-artifact";

/**
 * Explicit unavailable provider. Returned by the production factory when
 * vision is misconfigured, so the pipeline reports the configuration reason
 * instead of silently skipping visual inspection or substituting a test
 * double. It performs no inspection and returns no observations.
 */
export function unavailableVisionProvider(reason = "visual inspection is not available in this runtime"): VisualInspectionPort {
  return {
    providerId: UNAVAILABLE_VISION_PROVIDER_ID,
    inspect: async (request: VisualInspectionRequest): Promise<VisualInspectionResult> => ({
      pageNumber: request.pageNumber,
      observations: [],
      status: "UNAVAILABLE",
      confidence: null,
      reliability: "LOW",
      providerId: UNAVAILABLE_VISION_PROVIDER_ID,
      limitations: [reason],
      error: null,
    }),
  };
}
