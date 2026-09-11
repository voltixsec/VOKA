import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { citationPageNumber, pdfProcessingState, SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput, type ExtractedPdf } from "@/src/domain/source-artifact";
import { extractPdfText } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";

const storage = new LocalSourceArtifactStorage();

const CITATION_ORDER = [{ pageNumber: "asc" as const }, { observedAt: "asc" as const }];

type PdfProcessing = { processingState: "TEXT_EXTRACTED" | "TEXT_NOT_EXTRACTABLE"; extractedText: string | null; extractedPages: ExtractedPdf["pages"] | null; citations: Array<{ pageNumber: number | null; supportedClaimSummary: string }> };

/** Truthful PDF processing: no page reference, extracted text, or success claim that the extractor did not produce. */
function processPdf(bytes: Buffer): PdfProcessing {
  let extracted: ExtractedPdf;
  try { extracted = extractPdfText(bytes); }
  catch { throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_PDF_UNREADABLE", "The PDF was received but its content could not be read safely."); }
  const processingState = pdfProcessingState(extracted);
  if (processingState === "TEXT_NOT_EXTRACTABLE") return { processingState, extractedText: null, extractedPages: null, citations: [] };
  const citations = extracted.pages.length
    ? extracted.pages.map((page) => ({ pageNumber: page.pageNumber, supportedClaimSummary: page.text.slice(0, 500) }))
    : [{ pageNumber: citationPageNumber(extracted), supportedClaimSummary: extracted.text.slice(0, 500) }];
  return { processingState, extractedText: extracted.text, extractedPages: extracted.pages.length ? extracted.pages : null, citations };
}

export async function ingestSourceArtifact(input: { companyId: string; userId: string; file: File; context: unknown; conversationRuntimeId?: string | null }) {
  const policy = validateSourceArtifactInput(input.file, input.context);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  validateSourceArtifactBytes(policy.kind, bytes);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const where = { companyId: input.companyId, contentSha256, originalFilename: input.file.name };
  const existing = await prisma.sourceArtifact.findFirst({ where, include: { citations: { orderBy: CITATION_ORDER } } });
  if (existing) return { artifact: existing, idempotent: true };
  // Extraction runs before any storage write so a policy failure never leaves bytes behind.
  const pdf = policy.kind === "PDF" ? processPdf(bytes) : null;
  const processingState = pdf?.processingState ?? "STORED_PENDING_VISION";
  // Content-addressed storage is shared across every SourceArtifact with the same hash (any tenant, any filename).
  // Bytes are therefore never removed on a failed database write: another record may already reference them and a
  // retry re-uses them idempotently. Orphaned bytes are a bounded storage cost, never a data-loss risk.
  const stored = await storage.put(bytes, contentSha256);
  try {
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: input.file.name, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState,
        extractedText: pdf?.extractedText ?? null, extractedPages: pdf?.extractedPages ?? undefined, createdByUserId: input.userId,
        citations: pdf?.citations.length ? { create: pdf.citations.map((citation) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: input.file.name, pageNumber: citation.pageNumber,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: citation.supportedClaimSummary,
        })) } : undefined,
      },
      include: { citations: { orderBy: CITATION_ORDER } },
    });
    return { artifact, idempotent: false };
  } catch (error) {
    // A concurrent identical upload can win the unique race; return that record instead of failing the retry.
    const raced = await prisma.sourceArtifact.findFirst({ where, include: { citations: { orderBy: CITATION_ORDER } } }).catch(() => null);
    if (raced) return { artifact: raced, idempotent: true };
    throw error;
  }
}

export { SourceArtifactPolicyError };
