import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput } from "@/src/domain/source-artifact";
import { extractPdfText } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";

const storage = new LocalSourceArtifactStorage();

export async function ingestSourceArtifact(input: { companyId: string; userId: string; file: File; context: unknown; conversationRuntimeId?: string | null }) {
  const policy = validateSourceArtifactInput(input.file, input.context);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  validateSourceArtifactBytes(policy.kind, bytes);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.sourceArtifact.findFirst({ where: { companyId: input.companyId, contentSha256, originalFilename: input.file.name }, include: { citations: { orderBy: { pageNumber: "asc" } } } });
  if (existing) return { artifact: existing, idempotent: true };
  const stored = await storage.put(bytes, contentSha256);
  let extractedText: string | null = null;
  let extractedPages: Array<{ pageNumber: number | null; text: string; characterCount: number }> | null = null;
  let processingState: "TEXT_EXTRACTED" | "STORED_PENDING_VISION" = "STORED_PENDING_VISION";
  try {
    if (policy.kind === "PDF") {
      try {
        const extracted = extractPdfText(bytes);
        extractedText = extracted.text;
        extractedPages = extracted.pages;
        processingState = extracted.text.trim() ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
      } catch {
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_PDF_UNREADABLE", "The PDF was received but its content could not be read safely.");
      }
    }
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: input.file.name, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState, extractedText, extractedPages: extractedPages ?? undefined, createdByUserId: input.userId,
        citations: extractedText?.trim() ? { create: (extractedPages ?? []).map((page) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: input.file.name, pageNumber: page.pageNumber,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: page.text.slice(0, 500),
        })) } : undefined,
      },
      include: { citations: { orderBy: { pageNumber: "asc" } } },
    });
    return { artifact, idempotent: false };
  } catch (error) {
    // Keep immutable bytes: another tenant/request may already reference this hash.
    // Orphan cleanup requires a separate reference-aware maintenance operation.
    if (error instanceof SourceArtifactPolicyError) throw error;
    throw error;
  }
}

export { SourceArtifactPolicyError };
