import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { OcrPort, SourceArtifactInspectionPort } from "@/src/application/source-artifacts";
import { projectArtifactInspection, renderInspectionBrief, type ArtifactInspectionStatus } from "@/src/application/source-artifacts";
import type { ToolCitation, ToolObservation } from "@/src/application/conversation-runtime";
import { isStoredPdfPageModel, type ArtifactPage } from "@/src/domain/source-artifact";
import { LocalSourceArtifactStorage } from "./LocalSourceArtifactStorage";
import { parseBoqCandidates } from "./BoqCandidateParser";
import { extractPdfText } from "./PdfTextExtractor";
import { analyzePdfBytes } from "./DocumentInspectionAnalyzer";
import { analyzePdfBytesWithOcr, priorOcrFromStoredPages } from "./ocr/OcrDocumentAnalyzer";
import { createProductionOcrPort, resolveProductionOcrConfig } from "./ocr/createProductionOcrPort";

const storage = new LocalSourceArtifactStorage();

function citationsFor(artifact: { id: string; originalFilename: string; citations: Array<Record<string, unknown>> }) {
  return artifact.citations.map((citation) => ({
    id: String(citation.id), sourceArtifactId: artifact.id, sourceType: String(citation.sourceType), title: String(citation.title),
    pageNumber: typeof citation.pageNumber === "number" ? citation.pageNumber : null,
    sheet: typeof citation.sheet === "string" ? citation.sheet : null, section: typeof citation.section === "string" ? citation.section : null,
    lineLocator: typeof citation.lineLocator === "string" ? citation.lineLocator : null,
    url: typeof citation.url === "string" ? citation.url : null, publisher: typeof citation.publisher === "string" ? citation.publisher : null,
    provenance: String(citation.provenance), verificationState: String(citation.verificationState),
    confidence: citation.confidence == null ? null : Number(citation.confidence), supportedClaimSummary: String(citation.supportedClaimSummary),
  })) satisfies ToolCitation[];
}

function evidence(citations: ToolCitation[]) {
  return citations.map((citation) => ({ title: citation.title, url: citation.url ?? `artifact://${citation.sourceArtifactId ?? "unknown"}`, publisher: citation.publisher ?? "VOKA source artifact" }));
}

export class PrismaSourceArtifactInspection implements SourceArtifactInspectionPort {
  /**
   * Phase 2A-2B: the OCR engine is injected, defaulting to the production
   * resolution (real engine when `VOKA_OCR_ENGINE` is configured, otherwise
   * native-only analysis). Pass an explicit engine in tests; pass null to
   * force the native-only path.
   */
  constructor(private readonly ocr: OcrPort | null = createProductionOcrPort()) {}
  async inspect(input: Parameters<SourceArtifactInspectionPort["inspect"]>[0]): Promise<ToolObservation> {
    const artifact = await prisma.sourceArtifact.findFirst({ where: { id: input.artifactId, companyId: input.companyId }, include: { citations: { orderBy: [{ pageNumber: "asc" }, { observedAt: "asc" }] } } });
    if (!artifact) return { kind: input.kind, status: "UNAVAILABLE", artifactId: input.artifactId, summary: "The source artifact was not found for the active company.", evidence: [], citations: [], createdAt: new Date().toISOString() };
    const citations = citationsFor(artifact);
    let bytes: Buffer;
    try {
      bytes = await storage.get(artifact.storageRef);
      if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentSha256) throw new Error("SOURCE_ARTIFACT_HASH_MISMATCH");
    } catch {
      return { kind: input.kind, status: "UNAVAILABLE", artifactId: artifact.id, summary: "The source artifact record exists, but its retained bytes could not be verified.", evidence: evidence(citations), citations, createdAt: new Date().toISOString() };
    }
    if (artifact.kind === "IMAGE") {
      const status = input.kind === "DRAWING_INSPECTION" ? "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE" : "STORED_PENDING_VISION";
      return { kind: input.kind, status, artifactId: artifact.id, summary: status === "STORED_PENDING_VISION" ? "The image was received and retained, but no vision inspection was run." : "The drawing image was received and retained; visual drawing analysis is not available in this sprint.", evidence: evidence(citations), citations, createdAt: new Date().toISOString() };
    }
    // The brief language follows the runtime locale only; it is never inferred from the file contents.
    const briefLocale = input.locale ?? "en";
    // 2A-1C: run the accepted analysis layer (inspection -> classification -> observations)
    // so the assistant receives a bounded, governed projection instead of raw text.
    // A failure to analyze never becomes a claim that the file was analyzed.
    const projection = await projectPdf(bytes, artifact, input.governedFacts, this.ocr);
    let extractedText = artifact.extractedText?.trim() || projection.extractedText || "";
    if (!extractedText) {
      try { extractedText = extractPdfText(bytes).text.trim(); } catch { extractedText = ""; }
    }
    const artifactInspection = projection.summary;
    if (!extractedText || artifact.processingState === "FAILED") {
      return { kind: input.kind, status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "STORED_PENDING_VISION", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
    }
    if (input.kind === "DRAWING_INSPECTION") return { kind: input.kind, status: "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, extractedText, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
    const candidates = input.kind === "BOQ_INSPECTION" ? parseBoqCandidates(extractedText, artifact.id, citations) : [];
    if (candidates.length && input.runtimeId) {
      for (const candidate of candidates) {
        const stableKey = `runtime:${input.runtimeId}:${candidate.stableKey}`;
        const requirement = await prisma.requirement.upsert({
          where: { companyId_stableKey: { companyId: input.companyId, stableKey } },
          create: { companyId: input.companyId, stableKey, sourceContext: "SALES_ASSISTANT", description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", provenance: "SOURCE_ARTIFACT_TEXT", correctionTrace: { sourceArtifactId: artifact.id } },
          update: { description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", provenance: "SOURCE_ARTIFACT_TEXT" },
          select: { id: true },
        });
        if (candidate.citationId) await prisma.requirementCitation.upsert({ where: { requirementId_citationId: { requirementId: requirement.id, citationId: candidate.citationId } }, create: { requirementId: requirement.id, citationId: candidate.citationId, claimSummary: candidate.description }, update: { claimSummary: candidate.description } });
      }
    }
    return { kind: input.kind, status: "COMPLETED", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, extractedText, requirementCandidates: candidates, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
  }
}

/**
 * Runs the 2A-1B analyzer and projects it for the assistant. Analysis is best
 * effort: when it cannot run, the projection says the content was not inspected
 * rather than implying otherwise.
 *
 * Phase 2A-2B: when an OCR engine is available the OCR-augmented analyzer
 * runs instead, reusing persisted OCR results from ingest (the artifact bytes
 * were hash-verified above, so reuse is sound) and calling the engine only
 * for pages without one. A null engine keeps the native-only analysis.
 */
async function projectPdf(bytes: Buffer, artifact: { id: string; originalFilename: string; extractedPages?: unknown }, governedFacts: Parameters<SourceArtifactInspectionPort["inspect"]>[0]["governedFacts"], ocr: OcrPort | null) {
  try {
    const storedPages: ArtifactPage[] | undefined = isStoredPdfPageModel(artifact.extractedPages) ? artifact.extractedPages.pages : undefined;
    const analyzed = ocr
      ? await analyzePdfBytesWithOcr(bytes, ocr, {
        artifactId: artifact.id,
        priorOcr: priorOcrFromStoredPages(storedPages),
        maxOcrPages: resolveProductionOcrConfig().maxPages,
      })
      : analyzePdfBytes(bytes);
    const hasText = analyzed.inspection.text.trim().length > 0;
    const status: ArtifactInspectionStatus = analyzed.inspection.document.encrypted ? "ENCRYPTED" : hasText ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT";
    const summary = projectArtifactInspection({ artifactId: artifact.id, filename: artifact.originalFilename, kind: "PDF", analysis: analyzed, status, governedFacts });
    return { summary, extractedText: analyzed.inspection.text.trim() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return {
      summary: projectArtifactInspection({ artifactId: artifact.id, filename: artifact.originalFilename, kind: "PDF", analysis: null, status: "UNAVAILABLE", failure: `the PDF could not be analyzed safely (${reason})` }),
      extractedText: "",
    };
  }
}

export { storage };
