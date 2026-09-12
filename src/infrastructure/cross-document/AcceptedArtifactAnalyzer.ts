/**
 * Phase 2A-10: turns accepted 2A inspection channels into the dispatcher's
 * evidence shape.
 *
 * It calls the ACCEPTED analyzers directly — `analyzePdfBytes`,
 * `analyzePdfBytesWithOcr`, `analyzeImageBytesWithVision`,
 * `analyzeDxfBytes`, `analyzeIfcBytes`, `analyzeXlsxBytes` — and never goes
 * through the assistant inspection path. That matters: the assistant path is
 * the only place a Requirement can be created, and Phase 2A-10 must not create
 * one. It also means the `LegacyBoqCandidateParser` is not part of this
 * contract.
 *
 * Nothing here fetches, converts, or follows a reference. A DWG/RVT original is
 * identified from its own bytes and then left alone: its comparison voice is the
 * governed derived sibling.
 */

import { analyzePdfBytes } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";
import { analyzePdfBytesWithOcr, type OcrAugmentedAnalysis, type PriorOcrPage } from "@/src/infrastructure/source-artifacts/ocr/OcrDocumentAnalyzer";
import { analyzeImageBytesWithVision } from "@/src/infrastructure/source-artifacts/vision/ImageInspectionAnalyzer";
import { analyzeDrawingPages, analyzeImageBytesAsDrawing, resolveDrawingVisionLimits, type DrawingVisionLimits } from "@/src/infrastructure/source-artifacts/vision/DrawingInspectionAnalyzer";
import { analyzeXlsxBytes } from "@/src/infrastructure/source-artifacts/spreadsheet/SpreadsheetInspectionAnalyzer";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf/DxfInspectionAnalyzer";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc/IfcInspectionAnalyzer";
import type { OcrPort, VisualInspectionPort } from "@/src/application/source-artifacts";
import type { PageRasterizerPort } from "@/src/infrastructure/source-artifacts/ocr/PageRasterizer";
import {
  detectDwgOriginalFormat,
  detectRvtOriginalFormat,
  type ObservedFact,
} from "@/src/domain/source-artifact";
import type { SourceArtifactRef } from "@/src/application/cross-document/ports";
import type { AcceptedArtifactEvidence } from "@/src/application/cross-document/materialization/DocumentMaterializer";

/** Everything the accepted analyzers can be given. All of it is optional. */
export type AcceptedAnalyzerConfig = {
  ocr?: OcrPort | null;
  vision?: VisualInspectionPort | null;
  rasterizer?: PageRasterizerPort | null;
  /** Explicit opt-in. Never derived from a document role, a user, or a filename. */
  drawingVision?: boolean;
  drawingLimits?: DrawingVisionLimits;
  maxOcrPages?: number;
  maxImageBytes?: number;
};

export interface AcceptedArtifactAnalyzerPort {
  analyze(input: { artifact: SourceArtifactRef; bytes: Uint8Array; priorOcr?: readonly PriorOcrPage[] }): Promise<AcceptedArtifactEvidence>;
}

const DEFAULT_MAX_OCR_PAGES = 25;
const DEFAULT_MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** OCR-derived observations are separated from native ones; they are never merged. */
function splitByTextSource(observations: readonly ObservedFact[]): { native: ObservedFact[]; ocr: ObservedFact[] } {
  const native: ObservedFact[] = [];
  const ocr: ObservedFact[] = [];
  for (const observation of observations) {
    if (observation.origin?.textSource === "OCR") ocr.push(observation);
    else if (observation.visualOrigin) continue;
    else native.push(observation);
  }
  return { native, ocr };
}

export function createAcceptedArtifactAnalyzer(config: AcceptedAnalyzerConfig = {}): AcceptedArtifactAnalyzerPort {
  const drawingLimits = config.drawingLimits ?? resolveDrawingVisionLimits();

  return {
    async analyze({ artifact, bytes, priorOcr }): Promise<AcceptedArtifactEvidence> {
      switch (artifact.kind) {
        case "PDF": {
          const ocr = config.ocr ?? null;
          const analyzed = ocr
            ? await analyzePdfBytesWithOcr(bytes, ocr, {
              artifactId: artifact.artifactId,
              priorOcr: priorOcr ? [...priorOcr] : undefined,
              maxOcrPages: config.maxOcrPages ?? DEFAULT_MAX_OCR_PAGES,
            })
            : analyzePdfBytes(bytes);
          const { native, ocr: ocrObservations } = splitByTextSource(analyzed.observations);
          const drawingEvidence = config.drawingVision
            ? await drawingEvidenceForPdf({ bytes, analyzed, config, drawingLimits, artifactId: artifact.artifactId })
            : null;
          return {
            kind: "PDF",
            pages: analyzed.inspection.pages,
            nativeObservations: native,
            ocrObservations,
            ocrEngines: "ocr" in analyzed ? [...(analyzed as OcrAugmentedAnalysis).ocr.engines] : [],
            documentLimitations: [...analyzed.limitations, ...analyzed.inspection.document.limitations],
            truncated: false,
            ...(drawingEvidence ? { drawing: drawingEvidence } : {}),
          };
        }
        case "IMAGE": {
          const drawing = config.drawingVision && config.vision
            ? await analyzeImageBytesAsDrawing(bytes, artifact.mimeType, config.vision, {
              artifactId: artifact.artifactId,
              maxImageBytes: config.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
            })
            : null;
          if (drawing) {
            const pass = drawing.pass;
            return {
              kind: "IMAGE",
              observations: drawing.analysis.observations,
              providerIds: pass.providers,
              channel: "DRAWING_VISION",
              geometrySummary: pass.drafts.length ? { regionCount: pass.drafts.length, providerIds: [...pass.providers] } : null,
              limitations: drawing.analysis.limitations,
              truncated: false,
            };
          }
          const analyzed = await analyzeImageBytesWithVision(bytes, artifact.mimeType, config.vision ?? null, {
            artifactId: artifact.artifactId,
            maxImageBytes: config.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
          });
          return {
            kind: "IMAGE",
            observations: analyzed.observations,
            providerIds: analyzed.vision?.providerId ? [analyzed.vision.providerId] : [],
            channel: "IMAGE_VISION",
            geometrySummary: null,
            limitations: analyzed.limitations,
            truncated: false,
          };
        }
        case "XLSX":
          return { kind: "XLSX", analysis: await analyzeXlsxBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType }) };
        case "DXF":
          return { kind: "DXF", analysis: analyzeDxfBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType }) };
        case "IFC":
          return { kind: "IFC", analysis: analyzeIfcBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType }) };
        case "DWG": {
          const decision = detectDwgOriginalFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
          return {
            kind: "PROPRIETARY_ORIGINAL",
            sourceFormat: decision.versionLabel ? `DWG ${decision.versionLabel}` : "DWG",
            reason: decision.reason,
          };
        }
        case "RVT": {
          const decision = detectRvtOriginalFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
          return {
            kind: "PROPRIETARY_ORIGINAL",
            sourceFormat: decision.decision === "RVT" ? "RVT" : decision.decision,
            reason: decision.reason,
          };
        }
        default:
          return { kind: "UNAVAILABLE", reason: `the artifact kind ${artifact.kind} has no accepted Phase 2A-10 reading channel` };
      }
    },
  };
}

/**
 * The 2A-4 drawing pass over an already-produced PDF analysis.
 *
 * Only visual observations the accepted gate qualified are returned; a failed
 * or unconfigured pass returns null rather than an empty reading that could be
 * mistaken for "the drawing states nothing".
 */
async function drawingEvidenceForPdf(input: {
  bytes: Uint8Array;
  analyzed: ReturnType<typeof analyzePdfBytes>;
  config: AcceptedAnalyzerConfig;
  drawingLimits: DrawingVisionLimits;
  artifactId: string;
}): Promise<{ observations: readonly ObservedFact[]; providerIds: string[]; limitations: string[] } | null> {
  const context = {
    artifactId: input.artifactId,
    pdfBytes: input.bytes,
    vision: input.config.vision ?? null,
    intent: "DRAWING_INSPECTION" as const,
    limits: input.drawingLimits,
    ...(input.config.rasterizer ? { rasterizer: input.config.rasterizer } : {}),
  };
  try {
    const pass = await analyzeDrawingPages(input.analyzed, context);
    if (!pass.pass.used) return null;
    const observations = pass.analysis.observations.filter((observation) => Boolean(observation.visualOrigin));
    if (!observations.length) return null;
    return { observations, providerIds: [...pass.pass.providers], limitations: [...pass.analysis.limitations, ...pass.pass.limitations] };
  } catch {
    // A refused or failed drawing pass never becomes evidence, and it never
    // becomes a claim either: the limitation is disclosed by the caller.
    return null;
  }
}
