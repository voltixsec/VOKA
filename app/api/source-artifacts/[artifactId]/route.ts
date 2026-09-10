import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function artifactId(request: Request) {
  const value = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  if (!value) throw ApiError.badRequest("SOURCE_ARTIFACT_ID_REQUIRED", "artifactId is required.");
  return decodeURIComponent(value);
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const artifact = await prisma.sourceArtifact.findFirst({ where: { id: artifactId(request), companyId: company.companyId }, include: { citations: { orderBy: { pageNumber: "asc" } } } });
  if (!artifact) throw ApiError.notFound("SOURCE_ARTIFACT_NOT_FOUND", "The source artifact was not found.");
  return apiSuccess({ artifact: { id: artifact.id, originalFilename: artifact.originalFilename, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, contentSha256: artifact.contentSha256, kind: artifact.kind, context: artifact.context, processingState: artifact.processingState, citations: artifact.citations, hasExtractedText: Boolean(artifact.extractedText) } }, { headers: { "Cache-Control": "private, no-store" } });
});
