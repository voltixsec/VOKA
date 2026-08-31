import { after } from "next/server";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { createCommercialHandoffQuotationService } from "@/src/infrastructure/ai/createCommercialHandoffQuotationService";
import { verifyCommercialHandoff } from "@/src/infrastructure/ai/CommercialHandoffToken";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { QuotationLocalizationJobRunner } from "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner";

const service = createCommercialHandoffQuotationService();
const localizationRunner = new QuotationLocalizationJobRunner(new PrismaQuotationRepository());

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, _auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.handoffToken !== "string" || !body.handoffToken.trim()) throw ApiError.badRequest("COMMERCIAL_HANDOFF_TOKEN_REQUIRED", "A signed commercial handoff is required.");
  if (body.locale !== "ar" && body.locale !== "en") throw ApiError.badRequest("COMMERCIAL_HANDOFF_LOCALE_INVALID", "locale must be ar or en.");
  let handoff;
  try {
    handoff = await verifyCommercialHandoff(body.handoffToken, company.companyId);
  } catch {
    throw ApiError.forbidden("COMMERCIAL_HANDOFF_INVALID", "The commercial handoff is invalid or belongs to another company.");
  }
  const result = await service.execute({ companyId: company.companyId, handoff, locale: body.locale });
  if ((result.status === "CREATED" || result.status === "EXISTING") && result.localizationPending) {
    after(() => localizationRunner.run({ companyId: company.companyId, quotationId: result.quotationId }));
  }
  return apiSuccess(result, { status: result.status === "CREATED" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
});
