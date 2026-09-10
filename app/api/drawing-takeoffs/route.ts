import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { DrawingTakeoffPolicyError, validateDrawingUpload } from "@/src/domain/drawing-takeoff";
import { ingestSourceArtifact, SourceArtifactPolicyError } from "@/src/application/source-artifacts/IngestSourceArtifact";

function policyError(error: unknown): never { if (error instanceof DrawingTakeoffPolicyError) throw ApiError.badRequest(error.code, error.message); throw error; }
function serializeSession<T extends { sourceSha256: string; createdByUserId: string }>(session: T) { const { sourceSha256: _hash, createdByUserId: _actor, ...safe } = session; return safe; }

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (_request, _auth, company) => {
  const sessions = await prisma.drawingTakeoffSession.findMany({ where: { companyId: company.companyId }, include: { lines: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return apiSuccess({ sessions: sessions.map(serializeSession) }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  try {
    const form = await request.formData(); const file = form.get("drawing");
    if (!(file instanceof File)) throw new DrawingTakeoffPolicyError("DRAWING_REQUIRED", "A PDF drawing is required.");
    const input = validateDrawingUpload(file, form.get("intent"));
    let artifact;
    try {
      artifact = (await ingestSourceArtifact({ companyId: company.companyId, userId: auth.user.id, file, context: "TAKEOFF" })).artifact;
    } catch (error) {
      if (error instanceof SourceArtifactPolicyError) throw new DrawingTakeoffPolicyError("DRAWING_CONTENT_INVALID", error.message);
      throw error;
    }
    const sourceSha256 = artifact.contentSha256;
    const existing = await prisma.drawingTakeoffSession.findUnique({ where: { companyId_sourceSha256_userIntent: { companyId: company.companyId, sourceSha256, userIntent: input.userIntent } }, include: { lines: true } });
    if (existing) {
      if (!existing.sourceArtifactId) {
        await prisma.drawingTakeoffSession.updateMany({ where: { id: existing.id, companyId: company.companyId, sourceSha256, sourceArtifactId: null }, data: { sourceArtifactId: artifact.id } });
      }
      const linked = await prisma.drawingTakeoffSession.findFirst({ where: { id: existing.id, companyId: company.companyId }, include: { lines: true } });
      return apiSuccess({ session: serializeSession(linked ?? existing), idempotent: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const session = await prisma.drawingTakeoffSession.create({ data: { companyId: company.companyId, createdByUserId: auth.user.id, sourceArtifactId: artifact.id, ...input, sourceSha256 }, include: { lines: true } });
    return apiSuccess({ session: serializeSession(session), idempotent: false, analysis: { status: "EXTERNAL_PENDING", message: "Automated drawing extraction is not configured. Add reviewable observations without inventing quantities." } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { policyError(error); }
});
