import { PrismaAcquisitionRepository } from "@/features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export const GET = withCompanyAuth(["OWNER", "ADMIN"], async (request) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-1) || "");
  if (typeof id !== "string" || !id || id.length > 200) throw ApiError.badRequest("INVALID_RUN_ID", "Run ID is invalid.");
  const run = await new PrismaAcquisitionRepository(prisma).getRun(id);
  if (!run) throw ApiError.notFound("RUN_NOT_FOUND", "Acquisition run was not found.");
  return apiSuccess(run, { headers: { "Cache-Control": "no-store" } });
});
