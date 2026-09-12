/**
 * Phase 2A-10: the materialization dispatcher.
 *
 * One artifact produces ONE materialization, and the dispatcher is the only
 * place that decides which channel adapters run. It is pure: it receives the
 * accepted 2A inspection/analysis payloads and never touches bytes, the
 * database, the network, or a parser. The infrastructure service
 * (`LocalEvidenceMaterialization`) produces those payloads from hash-verified
 * retained bytes by calling the accepted analyzers directly — never through the
 * assistant inspection path, which is the only path that can create a
 * Requirement.
 *
 * Channel decisions, in order:
 *
 *   PDF   → native text channel, plus the OCR channel when OCR produced
 *           observations. Hidden text never becomes evidence because the
 *           accepted inspection never exposed it as an observation.
 *   IMAGE → the visual channel; the drawing-vision channel when the caller
 *           explicitly asked for a drawing reading.
 *   XLSX  → the workbook channel.
 *   DXF   → the CAD channel.
 *   IFC   → the BIM channel.
 *   DWG/RVT → a proprietary ORIGINAL. Nothing is parsed and no claim is made:
 *           the family's voice is the governed derived sibling, and this
 *           materialization records coverage and limitations only.
 *
 * No channel is chosen from a document role, so changing a role can never
 * change which evidence exists.
 */

import {
  MATERIALIZER_VERSIONS,
  PROPRIETARY_ORIGINAL_MATERIALIZER_VERSION,
  UNAVAILABLE_MATERIALIZER_VERSION,
  buildMaterializationId,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import type {
  ArtifactPage,
  DxfAnalysis,
  IfcAnalysis,
  ObservedFact,
  SpreadsheetAnalysis,
} from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { materializeDxfClaims } from "./DxfMaterializer";
import { materializeIfcClaims } from "./IfcMaterializer";
import { materializePdfClaims } from "./PdfMaterializer";
import { materializeSpreadsheetClaims } from "./SpreadsheetMaterializer";
import { materializeVisionClaims } from "./VisionMaterializer";

export type GeometrySummary = { regionCount: number; providerIds: string[] } | null;

/** What the accepted channels produced for one artifact. Nothing is invented here. */
export type AcceptedArtifactEvidence =
  | {
    kind: "PDF";
    pages: readonly ArtifactPage[];
    nativeObservations: readonly ObservedFact[];
    /** OCR-derived observations only. Never merged with native text. */
    ocrObservations: readonly ObservedFact[];
    ocrEngines: readonly string[];
    documentLimitations: readonly string[];
    truncated: boolean;
    /** The accepted drawing pass, when one ran and actually produced readings. */
    drawing?: { observations: readonly ObservedFact[]; providerIds: readonly string[]; limitations: readonly string[] };
  }
  | {
    kind: "IMAGE";
    /** Visual observations only; a text observation never takes this path. */
    observations: readonly ObservedFact[];
    providerIds: readonly string[];
    channel: "IMAGE_VISION" | "DRAWING_VISION";
    geometrySummary: GeometrySummary;
    limitations: readonly string[];
    truncated: boolean;
  }
  | { kind: "DRAWING_STRUCTURED"; observations: readonly ObservedFact[]; limitations: readonly string[]; truncated: boolean }
  | { kind: "XLSX"; analysis: SpreadsheetAnalysis }
  | { kind: "DXF"; analysis: DxfAnalysis }
  | { kind: "IFC"; analysis: IfcAnalysis }
  | { kind: "PROPRIETARY_ORIGINAL"; sourceFormat: string; reason: string }
  | { kind: "UNAVAILABLE"; reason: string };

export type DocumentMaterializerInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  runId: string | null;
  createdAt: string;
  evidence: AcceptedArtifactEvidence;
  /** Extra channel limitations the reader discovered before analysis. */
  readerLimitations?: readonly string[];
};

export const PROPRIETARY_ORIGINAL_LIMITATION =
  "a proprietary original is not parsed by VOKA: its comparison voice is the governed derived artifact, and no claim is made about content VOKA never read";

export const UNREADABLE_ARTIFACT_LIMITATION =
  "the retained bytes of this artifact could not be read and verified, so it contributed no comparison evidence";

function emptyMaterialization(input: {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializerVersion: string;
  limitations: readonly string[];
  unavailable: boolean;
}): MaterializedArtifact {
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: buildMaterializationId({
      companyId: input.artifact.companyId,
      sourceArtifactId: input.artifact.artifactId,
      artifactSha256: input.artifact.contentSha256,
      materializerVersion: input.materializerVersion,
    }),
    materializerVersion: input.materializerVersion,
    readingChannels: [],
    coverage: "PARTIAL",
    claims: [],
    truncated: false,
    truncationReasons: [],
    warnings: [],
    limitations: [...input.limitations],
    unavailable: input.unavailable,
  };
}

/**
 * Materializes one artifact's comparison evidence.
 *
 * The caller is responsible only for having verified the bytes; every channel
 * decision and every bound is applied here and inside the channel adapters.
 */
export function materializeArtifact(input: DocumentMaterializerInput): MaterializedArtifact {
  const readerLimitations = input.readerLimitations ?? [];

  switch (input.evidence.kind) {
    case "PDF": {
      const drawing = input.evidence.drawing
        ? materializeVisionClaims({
          artifact: input.artifact,
          lineage: input.lineage,
          materializationId: "",
          runId: input.runId,
          createdAt: input.createdAt,
          observations: input.evidence.drawing.observations,
          providerIds: input.evidence.drawing.providerIds,
          channel: "DRAWING_VISION",
          limitations: [...input.evidence.drawing.limitations, ...readerLimitations],
          truncated: false,
          geometrySummary: null,
        })
        : null;
      const native = materializePdfClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        pages: input.evidence.pages,
        observations: input.evidence.nativeObservations,
        documentLimitations: [...input.evidence.documentLimitations, ...readerLimitations],
        truncated: input.evidence.truncated,
        ocrEngines: [],
      });
      const ocr = materializePdfClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        pages: input.evidence.pages,
        observations: input.evidence.ocrObservations,
        documentLimitations: [...input.evidence.documentLimitations, ...readerLimitations],
        truncated: input.evidence.truncated,
        ocrEngines: input.evidence.ocrEngines,
      });
      const claims: NormalizedEvidenceClaim[] = [...native.claims, ...ocr.claims, ...(drawing?.claims ?? [])];
      const readingChannels = [...new Set([...native.readingChannels, ...ocr.readingChannels, ...(drawing?.readingChannels ?? [])])];
      const truncated = native.truncated || ocr.truncated || Boolean(drawing?.truncated);
      return {
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: MATERIALIZER_VERSIONS.PDF_NATIVE_TEXT,
        }),
        materializerVersion: MATERIALIZER_VERSIONS.PDF_NATIVE_TEXT,
        readingChannels,
        coverage: truncated ? "PARTIAL" : "COMPLETE",
        claims,
        truncated,
        truncationReasons: [...new Set([...native.truncationReasons, ...ocr.truncationReasons, ...(drawing?.truncationReasons ?? [])])],
        warnings: [],
        limitations: [...new Set([...native.limitations, ...ocr.limitations, ...(drawing?.limitations ?? [])])],
        unavailable: false,
      };
    }
    case "IMAGE": {
      const materialized = materializeVisionClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        observations: input.evidence.observations,
        providerIds: input.evidence.providerIds,
        channel: input.evidence.channel,
        limitations: [...input.evidence.limitations, ...readerLimitations],
        truncated: input.evidence.truncated,
        geometrySummary: input.evidence.geometrySummary,
      });
      return {
        ...materialized,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: materialized.materializerVersion,
        }),
      };
    }
    case "DRAWING_STRUCTURED": {
      const materialized = materializeVisionClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        observations: input.evidence.observations,
        providerIds: [],
        channel: "DRAWING_STRUCTURED",
        limitations: [...input.evidence.limitations, ...readerLimitations],
        truncated: input.evidence.truncated,
        geometrySummary: null,
      });
      return {
        ...materialized,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: materialized.materializerVersion,
        }),
      };
    }
    case "XLSX": {
      const materialized = materializeSpreadsheetClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        analysis: input.evidence.analysis,
      });
      return {
        ...materialized,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: materialized.materializerVersion,
        }),
        limitations: [...new Set([...materialized.limitations, ...readerLimitations])],
      };
    }
    case "DXF": {
      const materialized = materializeDxfClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        analysis: input.evidence.analysis,
      });
      return {
        ...materialized,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: materialized.materializerVersion,
        }),
        limitations: [...new Set([...materialized.limitations, ...readerLimitations])],
      };
    }
    case "IFC": {
      const materialized = materializeIfcClaims({
        artifact: input.artifact,
        lineage: input.lineage,
        materializationId: "",
        runId: input.runId,
        createdAt: input.createdAt,
        analysis: input.evidence.analysis,
      });
      return {
        ...materialized,
        materializationId: buildMaterializationId({
          companyId: input.artifact.companyId,
          sourceArtifactId: input.artifact.artifactId,
          artifactSha256: input.artifact.contentSha256,
          materializerVersion: materialized.materializerVersion,
        }),
        limitations: [...new Set([...materialized.limitations, ...readerLimitations])],
      };
    }
    case "PROPRIETARY_ORIGINAL":
      return emptyMaterialization({
        artifact: input.artifact,
        lineage: input.lineage,
        materializerVersion: PROPRIETARY_ORIGINAL_MATERIALIZER_VERSION,
        limitations: [PROPRIETARY_ORIGINAL_LIMITATION, input.evidence.reason, ...readerLimitations],
        unavailable: false,
      });
    case "UNAVAILABLE":
      return emptyMaterialization({
        artifact: input.artifact,
        lineage: input.lineage,
        materializerVersion: UNAVAILABLE_MATERIALIZER_VERSION,
        limitations: [UNREADABLE_ARTIFACT_LIMITATION, input.evidence.reason, ...readerLimitations],
        unavailable: true,
      });
  }
}
