import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import type { CompanyRole } from "@/lib/auth";

import type {
  ApplicationResult,
} from "@/src/application/quotation";
import type { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

type QuotationActionUseCase = {
  execute(input: {
    companyId: string;
    quotationId: string;
  }): Promise<ApplicationResult<void>>;
};

type QuotationActionUseCaseFactory = new (
  repository: PrismaQuotationRepository,
) => QuotationActionUseCase;

export function getQuotationIdFromActionUrl(
  request: Request,
): string {
  const segments = new URL(request.url).pathname
    .split("/")
    .filter(Boolean);
  const quotationId = segments.at(-2);

  if (!quotationId) {
    throw ApiError.badRequest(
      "QUOTATION_ID_REQUIRED",
      "quotationId is required.",
    );
  }

  return decodeURIComponent(quotationId);
}

export function createQuotationActionHandler(
  allowedRoles: readonly CompanyRole[],
  UseCase: QuotationActionUseCaseFactory,
  repository: PrismaQuotationRepository,
) {
  const useCase = new UseCase(repository);

  return withCompanyAuth(
    allowedRoles,
    async (request, _auth, company) => {
      const quotationId =
        getQuotationIdFromActionUrl(request);
      const result = await useCase.execute({
        companyId: company.companyId,
        quotationId,
      });

      if (!result.success) {
        if (
          result.error.code ===
          "QUOTATION_NOT_FOUND"
        ) {
          throw ApiError.notFound(
            result.error.code,
            result.error.message,
          );
        }

        throw ApiError.badRequest(
          result.error.code,
          result.error.message,
        );
      }

      return apiSuccess(
        {
          quotationId,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    },
  );
}
