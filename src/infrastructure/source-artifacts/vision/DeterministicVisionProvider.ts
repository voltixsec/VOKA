import type { VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import {
  DETERMINISTIC_VISION_PROVIDER_ID,
  visualReliabilityFor,
  type VisualInspectionRequest,
  type VisualInspectionResult,
  type VisualInspectionStatus,
  type VisualObservationDraft,
} from "@/src/domain/source-artifact";

/**
 * Deterministic fixture provider for tests only.
 *
 * Fixtures are keyed by artifact id. A fixture is either a draft list (served
 * as COMPLETED) or a partial result for failure/limitation cases. An artifact
 * without a fixture yields NO_USABLE_OBSERVATIONS: the double never invents
 * observations. It must never be returned by the production factory.
 */
export type DeterministicVisualFixture =
  | VisualObservationDraft[]
  | {
    status?: VisualInspectionStatus;
    observations?: VisualObservationDraft[];
    confidence?: number | null;
    limitations?: string[];
    error?: string | null;
  };

export function deterministicVisionProvider(fixtures: Record<string, DeterministicVisualFixture>): VisualInspectionPort {
  return {
    providerId: DETERMINISTIC_VISION_PROVIDER_ID,
    inspect: async (request: VisualInspectionRequest): Promise<VisualInspectionResult> => {
      const fixture = fixtures[request.artifactId];
      if (!fixture) {
        return {
          pageNumber: request.pageNumber,
          observations: [],
          status: "NO_USABLE_OBSERVATIONS",
          confidence: null,
          reliability: "LOW",
          providerId: DETERMINISTIC_VISION_PROVIDER_ID,
          limitations: ["no fixture is registered for this artifact; the test double observed nothing"],
          error: null,
        };
      }
      const shaped = Array.isArray(fixture) ? { observations: fixture } : fixture;
      const observations = shaped.observations ?? [];
      const status = shaped.status ?? (observations.length ? "COMPLETED" : "NO_USABLE_OBSERVATIONS");
      const confidence = shaped.confidence ?? null;
      return {
        pageNumber: request.pageNumber,
        observations,
        status,
        confidence,
        reliability: visualReliabilityFor(confidence),
        providerId: DETERMINISTIC_VISION_PROVIDER_ID,
        limitations: shaped.limitations ?? [],
        error: shaped.error ?? null,
      };
    },
  };
}
