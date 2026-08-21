import { PrismaAcquisitionRepository } from "@/features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export const GET = withCompanyAuth(["OWNER", "ADMIN"], async (request) => {
  const raw = new URL(request.url).searchParams.get("limit"); const limit = raw ? Number(raw) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw ApiError.badRequest("INVALID_LIMIT", "limit must be between 1 and 100.");
  const runs = await new PrismaAcquisitionRepository(prisma).listRuns(limit);
  return apiSuccess(runs, { headers: { "Cache-Control": "no-store" } });
});
