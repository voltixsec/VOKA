import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { SourceArtifactInspectionPort } from "@/src/application/source-artifacts";
import type { ToolCitation, ToolObservation } from "@/src/application/conversation-runtime";
import type { ArtifactPage } from "@/src/domain/source-artifact";
import { LocalSourceArtifactStorage } from "./LocalSourceArtifactStorage";
import { parseBoqCandidates } from "./BoqCandidateParser";

const storage = new LocalSourceArtifactStorage();

type PersistedCitation = {
  id: string; sourceType: string; title: string; pageNumber: number | null; sheet: string | null; section: string | null; lineLocator: string | null;
  url: string | null; publisher: string | null; provenance: string; verificationState: string; confidence: unknown; supportedClaimSummary: string;
};

function citationsFor(artifact: { id: string; citations: PersistedCitation[] }): ToolCitation[] {
  return artifact.citations.map((citation) => ({
    id: citation.id, sourceArtifactId: artifact.id, sourceType: citation.sourceType, title: citation.title,
    pageNumber: citation.pageNumber, sheet: citation.sheet, section: citation.section, lineLocator: citation.lineLocator,
    url: citation.url, publisher: citation.publisher, provenance: citation.provenance, verificationState: citation.verificationState,
    confidence: citation.confidence == null ? null : Number(citation.confidence), supportedClaimSummary: citation.supportedClaimSummary,
  }));
}

function evidence(citations: ToolCitation[]) {
  return citations.map((citation) => ({ title: citation.title, url: citation.url ?? `artifact://${citation.sourceArtifactId ?? "unknown"}`, publisher: citation.publisher ?? "VOKA source artifact" }));
}

function persistedPages(value: unknown): ArtifactPage[] | null {
  if (!Array.isArray(value)) return null;
  const pages = value.flatMap((item) => {
    const page = item as Partial<ArtifactPage> | null;
    return page && Number.isInteger(page.pageNumber) && typeof page.text === "string" ? [{ pageNumber: page.pageNumber as number, text: page.text, characterCount: page.text.length }] : [];
  });
  return pages.length ? pages : null;
}

export class PrismaSourceArtifactInspection implements SourceArtifactInspectionPort {
  async inspect(input: Parameters<SourceArtifactInspectionPort["inspect"]>[0]): Promise<ToolObservation> {
    const now = () => new Date().toISOString();
    // Tenant ownership is part of the lookup itself: another company's artifact id is indistinguishable from a missing one.
    const artifact = await prisma.sourceArtifact.findFirst({ where: { id: input.artifactId, companyId: input.companyId }, include: { citations: { orderBy: [{ pageNumber: "asc" }, { observedAt: "asc" }] } } });
    if (!artifact) return { kind: input.kind, status: "UNAVAILABLE", artifactId: input.artifactId, summary: "The source artifact was not found for the active company.", evidence: [], citations: [], createdAt: now() };
    const citations = citationsFor(artifact);
    try {
      const bytes = await storage.get(artifact.storageRef);
      if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentSha256) throw new Error("SOURCE_ARTIFACT_HASH_MISMATCH");
    } catch {
      return { kind: input.kind, status: "UNAVAILABLE", artifactId: artifact.id, summary: "The source artifact record exists, but its retained bytes could not be verified.", evidence: evidence(citations), citations, createdAt: now() };
    }
    if (artifact.kind === "IMAGE") {
      const status = input.kind === "DRAWING_INSPECTION" ? "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE" : "STORED_PENDING_VISION";
      return { kind: input.kind, status, artifactId: artifact.id, summary: status === "STORED_PENDING_VISION" ? "The image was received and retained, but no vision inspection was run." : "The drawing image was received and retained; visual drawing analysis is not available in this sprint.", evidence: evidence(citations), citations, createdAt: now() };
    }
    // Only text the bounded extractor genuinely produced at ingestion is inspectable; nothing is re-derived or assumed here.
    const extractedText = artifact.processingState === "TEXT_EXTRACTED" ? artifact.extractedText?.trim() ?? "" : "";
    if (artifact.processingState === "FAILED") return { kind: input.kind, status: "UNAVAILABLE", artifactId: artifact.id, summary: "The PDF was retained, but its processing failed; no content is available for inspection.", evidence: evidence(citations), citations, createdAt: now() };
    if (!extractedText) return { kind: input.kind, status: "TEXT_NOT_EXTRACTABLE", artifactId: artifact.id, summary: "The PDF was retained, but it contains no machine-readable text (scanned or image-only). No content was analyzed.", evidence: evidence(citations), citations, createdAt: now() };
    if (input.kind === "DRAWING_INSPECTION") return { kind: input.kind, status: "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE", artifactId: artifact.id, summary: "The PDF text was read and retained, but visual drawing analysis is not available in this sprint.", evidence: evidence(citations), citations, extractedText, createdAt: now() };
    const candidates = input.kind === "BOQ_INSPECTION"
      ? parseBoqCandidates({ text: extractedText, artifactId: artifact.id, citations, pages: persistedPages(artifact.extractedPages), scope: { context: "SALES_ASSISTANT", conversationRuntimeId: input.conversationRuntimeId ?? artifact.conversationRuntimeId } })
      : [];
    const ownedCitationIds = new Set(citations.map((citation) => citation.id));
    for (const candidate of candidates) {
      const requirement = await prisma.requirement.upsert({
        where: { companyId_stableKey: { companyId: input.companyId, stableKey: candidate.stableKey } },
        create: { companyId: input.companyId, stableKey: candidate.stableKey, sourceContext: "SALES_ASSISTANT", description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", provenance: "SOURCE_ARTIFACT_TEXT", correctionTrace: { sourceArtifactId: artifact.id } },
        update: { description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", provenance: "SOURCE_ARTIFACT_TEXT" },
        select: { id: true },
      });
      // Link only the citation proven for this specific line; uncertain lines stay unlinked for human review.
      if (candidate.citationId && ownedCitationIds.has(candidate.citationId)) {
        await prisma.requirementCitation.upsert({ where: { requirementId_citationId: { requirementId: requirement.id, citationId: candidate.citationId } }, create: { requirementId: requirement.id, citationId: candidate.citationId, claimSummary: candidate.description }, update: { claimSummary: candidate.description } });
      }
    }
    const summary = input.kind === "BOQ_INSPECTION"
      ? `Read ${extractedText.length} characters from ${artifact.originalFilename}; ${candidates.length} reviewable BOQ candidate(s) were found. No quantity was approved automatically.`
      : `Read ${extractedText.length} characters from ${artifact.originalFilename}.`;
    return { kind: input.kind, status: "COMPLETED", artifactId: artifact.id, summary, evidence: evidence(citations), citations, extractedText, requirementCandidates: candidates, createdAt: now() };
  }
}

export { storage };
