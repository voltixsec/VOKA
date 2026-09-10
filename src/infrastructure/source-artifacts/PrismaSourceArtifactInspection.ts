import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { SourceArtifactInspectionPort } from "@/src/application/source-artifacts";
import type { ToolCitation, ToolObservation } from "@/src/application/conversation-runtime";
import { LocalSourceArtifactStorage } from "./LocalSourceArtifactStorage";
import { parseBoqCandidates } from "./BoqCandidateParser";
import { extractPdfText } from "./PdfTextExtractor";

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
    let extractedText = artifact.extractedText?.trim() ?? "";
    if (!extractedText) {
      try { extractedText = extractPdfText(bytes).text.trim(); } catch { extractedText = ""; }
    }
    if (!extractedText || artifact.processingState === "FAILED") return { kind: input.kind, status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "STORED_PENDING_VISION", artifactId: artifact.id, summary: "The PDF was retained but machine-readable text could not be extracted.", evidence: evidence(citations), citations, createdAt: new Date().toISOString() };
    if (input.kind === "DRAWING_INSPECTION") return { kind: input.kind, status: "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE", artifactId: artifact.id, summary: "The PDF text was read and retained, but visual drawing analysis is not available in this sprint.", evidence: evidence(citations), citations, extractedText, createdAt: new Date().toISOString() };
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
    return { kind: input.kind, status: "COMPLETED", artifactId: artifact.id, summary: input.kind === "BOQ_INSPECTION" ? `Read ${extractedText.length} characters from ${artifact.originalFilename}; ${candidates.length} reviewable BOQ candidate(s) were found. No quantity was approved automatically.` : `Read ${extractedText.length} characters from ${artifact.originalFilename}.`, evidence: evidence(citations), citations, extractedText, requirementCandidates: candidates, createdAt: new Date().toISOString() };
  }
}

export { storage };
