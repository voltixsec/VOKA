import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput, type StoredPdfPageModel } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
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
  let extractedPages: StoredPdfPageModel | null = null;
  let processingState: "TEXT_EXTRACTED" | "STORED_PENDING_VISION" = "STORED_PENDING_VISION";
  let processingError: string | null = null;
  try {
    if (policy.kind === "PDF") {
      try {
        const inspection = inspectPdfBytes(bytes);
        extractedText = inspection.text;
        extractedPages = { version: 2, document: inspection.document, pages: inspection.pages };
        processingState = inspection.text.trim() ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
        // Extraction limitations are source truth too: keep them with the artifact, never silently drop them.
        const limitations = [...new Set([...inspection.document.limitations, ...inspection.pages.flatMap((page) => page.limitations ?? [])])];
        processingError = limitations.length ? limitations.join(" | ").slice(0, 2_000) : null;
      } catch {
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_PDF_UNREADABLE", "The PDF was received but its content could not be read safely.");
      }
    }
    // One citation per page that carries visible machine-readable text. The page locator is set only
    // when the page tree proved attribution; otherwise it stays null. Invisible-layer text is not cited.
    const citedPages = (extractedPages?.pages ?? []).filter((page) => page.text.trim());
    const pageAttributionReliable = extractedPages?.document.pageAttributionReliable ?? false;
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: input.file.name, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState, processingError, extractedText,
        extractedPages: extractedPages ? (JSON.parse(JSON.stringify(extractedPages)) as object) : undefined, createdByUserId: input.userId,
        citations: citedPages.length ? { create: citedPages.map((page) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: input.file.name,
          pageNumber: pageAttributionReliable && typeof page.pageNumber === "number" ? page.pageNumber : null,
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
