import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { CancelQuotationUseCase } from "@/src/application/quotation";
import { PrismaQuotationCancellationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationCancellationRepository";
import { getQuotationIdFromActionUrl } from "../quotation-action";

const cancelQuotation = new CancelQuotationUseCase(
  new PrismaQuotationCancellationRepository(),
);

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const quotationId = getQuotationIdFromActionUrl(request);
    const result = await cancelQuotation.execute({
      companyId: company.companyId,
      quotationId,
    });

    if (!result.success) {
      if (result.error.code === "QUOTATION_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      if (result.error.code === "QUOTATION_HAS_SALES_ORDER") {
        throw ApiError.conflict(result.error.code, result.error.message);
      }
      throw ApiError.badRequest(result.error.code, result.error.message);
    }

    return apiSuccess(
      { quotationId },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
