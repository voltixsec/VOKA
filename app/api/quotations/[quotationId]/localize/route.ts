import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";

import { GetQuotationUseCase } from "@/src/application/quotation";
import { QuotationLocalizationRepairService } from "@/src/application/quotation/services/QuotationLocalizationRepairService";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { QuotationLocalizationJobRunner } from "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner";

import { getQuotationIdFromActionUrl } from "../quotation-action";
import { serializeQuotation } from "../../serialize-quotation";

export const runtime = "nodejs";

const repository = new PrismaQuotationRepository();
const getQuotation = new GetQuotationUseCase(repository);
const localizationJobRunner = new QuotationLocalizationJobRunner(repository);
const repairService = new QuotationLocalizationRepairService(
  repository,
  localizationJobRunner,
);

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const quotationId = getQuotationIdFromActionUrl(request);

    const result = await getQuotation.execute({
      companyId: company.companyId,
      quotationId,
    });

    if (!result.success) {
      throw ApiError.notFound(
        result.error.code,
        result.error.message,
      );
    }

    const quotation = result.data;

    if (quotation.status === "APPROVED") {
      throw ApiError.badRequest(
        "QUOTATION_APPROVED_IMMUTABLE",
        "Approved quotations are immutable and cannot be re-localized.",
      );
    }

    if (quotation.status !== "DRAFT") {
      throw ApiError.badRequest(
        "QUOTATION_NOT_DRAFT",
        "Only draft quotations can be re-localized.",
      );
    }

    const repairResult = await repairService.repairDraftQuotation(quotation);

    if (!repairResult.repaired) {
      if (repairResult.reason === "APPROVED_IMMUTABLE") {
        throw ApiError.badRequest(
          "QUOTATION_APPROVED_IMMUTABLE",
          "Approved quotations are immutable and cannot be re-localized.",
        );
      }
      if (repairResult.reason === "NOT_DRAFT") {
        throw ApiError.badRequest(
          "QUOTATION_NOT_DRAFT",
          "Only draft quotations can be re-localized.",
        );
      }
    }

    const reloaded = await getQuotation.execute({
      companyId: company.companyId,
      quotationId,
    });

    const updatedData = reloaded.success ? reloaded.data : quotation;

    return apiSuccess(
      serializeQuotation(updatedData),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  },
);
