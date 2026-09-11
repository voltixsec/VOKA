import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { ingestSourceArtifact, SourceArtifactPolicyError } from "@/src/application/source-artifacts/IngestSourceArtifact";

function fail(error: unknown): never {
  if (error instanceof SourceArtifactPolicyError) throw ApiError.badRequest(error.code, error.message);
  throw error;
}

function safeArtifact(artifact: Record<string, unknown>, citations: unknown[] = []) {
  return {
    id: artifact.id,
    originalFilename: artifact.originalFilename,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.sizeBytes,
    contentSha256: artifact.contentSha256,
    kind: artifact.kind,
    context: artifact.context,
    processingState: artifact.processingState,
    conversationRuntimeId: artifact.conversationRuntimeId,
    createdAt: artifact.createdAt,
    citations,
    hasExtractedText: typeof artifact.extractedText === "string" && artifact.extractedText.length > 0,
  };
}

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  try {
    const form = await request.formData();
    const file = form.get("file") ?? form.get("attachment");
    if (!(file instanceof File)) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_REQUIRED", "A file attachment is required.");
    const runtimeIdValue = form.get("conversationRuntimeId");
    const result = await ingestSourceArtifact({ companyId: company.companyId, userId: auth.user.id, file, context: form.get("context"), conversationRuntimeId: typeof runtimeIdValue === "string" ? runtimeIdValue : null });
    const { citations, ...artifact } = result.artifact;
    return apiSuccess({ artifact: safeArtifact(artifact, citations), idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { fail(error); }
});
