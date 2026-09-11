import type { ArtifactAnalysisInput, VisualInspectionPort } from "@/src/application/source-artifacts";
import {
  normalizeVisualDrafts,
  shouldRequestVision,
  type ImageInspection,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-3 image analyzer: the single place where a vision provider meets
 * the governed pipeline.
 *
 * - the domain gate decides whether the image may be sent to a provider
 *   (supported type, within the byte cap); anything else stays uninspected
 *   with the reason kept as a limitation;
 * - without a configured provider the image stays undescribed and the
 *   analysis records that vision was not attempted;
 * - provider output is normalized through the domain vocabulary boundary, so
 *   unknown types, empty descriptions, and over-long text can never reach
 *   the governed layer;
 * - a provider failure (including a thrown error) is contained as an
 *   attempted-but-unused inspection; this analyzer never throws for provider
 *   reasons.
 */
export async function analyzeImageBytesWithVision(
  imageBytes: Uint8Array,
  mimeType: string,
  vision: VisualInspectionPort | null,
  options: { artifactId: string; maxImageBytes: number },
): Promise<ArtifactAnalysisInput> {
  const inspection: ImageInspection = {
    format: "IMAGE",
    mimeType,
    sizeBytes: imageBytes.byteLength,
    text: "",
    pages: [],
    document: { pageCount: null, pageAttributionReliable: false, encrypted: false, limitations: [] },
  };
  const gate = shouldRequestVision({ mimeType, byteLength: imageBytes.byteLength, maxImageBytes: options.maxImageBytes });
  if (!gate.requested) {
    return { inspection, classification: null, observations: [], limitations: [gate.reason], vision: { attempted: false, providerId: null } };
  }
  if (!vision) {
    return {
      inspection,
      classification: null,
      observations: [],
      limitations: ["visual inspection is not available in this runtime; the image was stored but not described"],
      vision: { attempted: false, providerId: null },
    };
  }
  try {
    const result = await vision.inspect({ artifactId: options.artifactId, imageBytes, mimeType, pageNumber: null, reason: gate.reason });
    if (result.status !== "COMPLETED") {
      const detail = result.status === "UNAVAILABLE"
        ? "the vision provider is unavailable"
        : result.status === "NO_USABLE_OBSERVATIONS"
          ? "the vision provider returned no usable observations"
          : `visual inspection failed${result.error ? `: ${result.error}` : ""}`;
      return {
        inspection,
        classification: null,
        observations: [],
        limitations: [detail, ...result.limitations],
        vision: { attempted: true, providerId: result.providerId },
      };
    }
    // Standalone images have no page provenance: the page number is forced to
    // null here rather than trusted from the provider echo.
    const normalized = normalizeVisualDrafts(result.observations, { providerId: result.providerId, pageNumber: null });
    return {
      inspection,
      classification: null,
      observations: normalized.observations,
      limitations: [
        "visual observations describe image content as seen; they are not verified facts, approved quantities, selected products, or engineering assessments",
        ...result.limitations,
        ...normalized.limitations,
      ],
      vision: { attempted: true, providerId: result.providerId },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown provider failure";
    return {
      inspection,
      classification: null,
      observations: [],
      limitations: [`visual inspection failed (${detail.slice(0, 200)})`],
      vision: { attempted: true, providerId: vision.providerId },
    };
  }
}
