import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAX_SOURCE_ARTIFACT_BYTES, SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput } from "@/src/domain/source-artifact";
import { extractPdfText } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";

const storage = new LocalSourceArtifactStorage();

export async function ingestSourceArtifact(input: { companyId: string; userId: string; file: File; context: unknown; conversationRuntimeId?: string | null }) {
  const policy = validateSourceArtifactInput(input.file, input.context);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.byteLength !== input.file.size || bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_ARTIFACT_BYTES) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_SIZE_INVALID", "The attachment byte size is invalid.");
  validateSourceArtifactBytes(policy.kind, bytes);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.sourceArtifact.findFirst({ where: { companyId: input.companyId, contentSha256, originalFilename: input.file.name }, include: { citations: { orderBy: { pageNumber: "asc" } } } });
  if (existing) return { artifact: existing, idempotent: true };
  const stored = await storage.put(bytes, contentSha256);
  let extractedText: string | null = null;
  let extractedPages: Array<{ pageNumber: number; text: string; characterCount: number }> | null = null;
  let processingState: "TEXT_EXTRACTED" | "STORED_PENDING_VISION" = "STORED_PENDING_VISION";
  try {
    if (policy.kind === "PDF") {
      try {
        const extracted = extractPdfText(bytes);
        extractedText = extracted.text;
        extractedPages = extracted.pages;
        processingState = "TEXT_EXTRACTED";
      } catch {
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_PDF_UNREADABLE", "The PDF was received but its content could not be read safely.");
      }
    }
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: input.file.name, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState, extractedText, extractedPages, createdByUserId: input.userId,
        citations: policy.kind === "PDF" ? { create: (extractedPages?.length ? extractedPages : [{ pageNumber: 1, text: extractedText ?? "", characterCount: 0 }]).map((page) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: input.file.name, pageNumber: page.pageNumber,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: page.text.slice(0, 500) || "Machine-readable content retained from the uploaded PDF.",
        })) } : undefined,
      },
      include: { citations: { orderBy: { pageNumber: "asc" } } },
    });
    return { artifact, idempotent: false };
  } catch (error) {
    await storage.remove(stored.storageRef);
    if (error instanceof SourceArtifactPolicyError) throw error;
    throw error;
  }
}

export { SourceArtifactPolicyError };
