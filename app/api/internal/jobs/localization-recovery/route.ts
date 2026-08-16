import { timingSafeEqual } from "node:crypto";

import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { QuotationLocalizationJobRunner } from "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner";
import { QuotationLocalizationRecoveryService } from "@/src/infrastructure/translation/quotation/QuotationLocalizationRecoveryService";

export const runtime = "nodejs";

const repository = new PrismaQuotationRepository();
const runner = new QuotationLocalizationJobRunner(repository);
const recovery = new QuotationLocalizationRecoveryService(repository, runner);

function authorized(request: Request): boolean {
  const secret = process.env.VOKA_CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  const summary = await recovery.runBatch();
  return Response.json({ success: true, data: summary });
}
