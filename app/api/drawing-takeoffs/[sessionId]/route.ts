import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getDrawingTakeoffSnapshot } from '@/lib/reporting/drawing-takeoff';
import { assertTakeoffConfirmable, DrawingTakeoffPolicyError, validateTakeoffLines } from "@/src/domain/drawing-takeoff";

function policyError(error: unknown): never { if (error instanceof DrawingTakeoffPolicyError) throw ApiError.badRequest(error.code, error.message); throw error; }
function id(request: Request) { const parts = new URL(request.url).pathname.split("/").filter(Boolean); const value = parts.at(-1); if (!value || value === "drawing-takeoffs") throw ApiError.badRequest("TAKEOFF_ID_REQUIRED", "sessionId is required."); return decodeURIComponent(value); }
function serializeSession<T extends { sourceSha256: string; createdByUserId: string }>(session: T) { const { sourceSha256: _hash, createdByUserId: _actor, ...safe } = session; return safe; }

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const session = await getDrawingTakeoffSnapshot(company.companyId, id(request));
  return apiSuccess({ session }, { headers: { "Cache-Control": "private, no-store" } });
});

export const PATCH = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  try {
    const sessionId = id(request); const body = await request.json() as Record<string, unknown>;
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new DrawingTakeoffPolicyError("TAKEOFF_VERSION_REQUIRED", "The current takeoff version is required.");
    const lines = validateTakeoffLines(body.lines);
    if (body.confirm === true) assertTakeoffConfirmable(lines);
    const session = await prisma.$transaction(async (tx) => {
      const updated = await tx.drawingTakeoffSession.updateMany({ where: { id: sessionId, companyId: company.companyId, version: expectedVersion, status: "REVIEW_REQUIRED" }, data: { version: { increment: 1 }, status: body.confirm === true ? "CONFIRMED" : "REVIEW_REQUIRED", confirmedAt: body.confirm === true ? new Date() : null } });
      if (updated.count !== 1) { const owned = await tx.drawingTakeoffSession.findFirst({ where: { id: sessionId, companyId: company.companyId }, select: { id: true } }); if (!owned) throw ApiError.notFound("TAKEOFF_NOT_FOUND", "Takeoff session was not found."); throw ApiError.conflict("TAKEOFF_CONFLICT", "The takeoff changed or can no longer be edited. Reload it."); }
      await tx.drawingTakeoffLine.deleteMany({ where: { sessionId } });
      await tx.drawingTakeoffLine.createMany({ data: lines.map((line) => ({ ...line, sessionId, confirmedById: line.isConfirmed ? auth.user.id : null, confirmedAt: line.isConfirmed ? new Date() : null })) });
      return tx.drawingTakeoffSession.findFirstOrThrow({ where: { id: sessionId, companyId: company.companyId }, include: { lines: { orderBy: { position: "asc" } } } });
    });
    return apiSuccess({ session: serializeSession(session) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { policyError(error); }
});
