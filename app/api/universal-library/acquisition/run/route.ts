import { NextResponse } from "next/server";
import { AcquisitionPolicyError, HttpJsonAcquisitionAdapter, PrismaAcquisitionRepository, PrismaUniversalLibraryRepository, RunControlledAcquisition, Ucl3AcquisitionStager } from "@/features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export const POST = withCompanyAuth(["OWNER", "ADMIN"], async (request, auth) => {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) throw ApiError.badRequest("PAYLOAD_TOO_LARGE", "Request payload is too large.");
  let body: unknown; try { body = await request.json(); } catch { throw ApiError.badRequest("INVALID_JSON", "Request body must be valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw ApiError.badRequest("INVALID_BODY", "Request body is invalid.");
  const value = body as Record<string, unknown>;
  if ("url" in value || "targetUrl" in value || "endpoint" in value) throw ApiError.badRequest("ARBITRARY_URL_FORBIDDEN", "Acquisition targets must come from governed source configuration.");
  if (typeof value.sourceId !== "string" || !value.sourceId.trim() || value.sourceId.length > 200) throw ApiError.badRequest("INVALID_SOURCE_ID", "sourceId is invalid.");
  if (typeof value.dryRun !== "boolean") throw ApiError.badRequest("INVALID_DRY_RUN", "dryRun must be boolean.");
  const limit = value.limit ?? 100;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 1000) throw ApiError.badRequest("INVALID_LIMIT", "limit must be between 1 and 1000.");
  if (value.cursor !== undefined && (typeof value.cursor !== "string" || value.cursor.length > 500)) throw ApiError.badRequest("INVALID_CURSOR", "cursor is invalid.");
  const acquisitionRepository = new PrismaAcquisitionRepository(prisma);
  const uclRepository = new PrismaUniversalLibraryRepository(prisma);
  const useCase = new RunControlledAcquisition(acquisitionRepository, new HttpJsonAcquisitionAdapter(), new Ucl3AcquisitionStager(uclRepository));
  try {
    const run = await useCase.execute({ sourceId: value.sourceId.trim(), initiatedByUserId: auth.user.id, dryRun: value.dryRun, limit: limit as number, cursor: value.cursor as string | undefined });
    return apiSuccess(run, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AcquisitionPolicyError) {
      const status = error.code.includes("QUOTA") || error.code === "RATE_LIMITED" || error.code === "GLOBAL_PILOT_LIMIT" ? 429 : error.code === "SOURCE_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status });
    }
    throw ApiError.internal("Acquisition run could not be completed.");
  }
});
