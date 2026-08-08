import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";

import {
  ApproveQuotationUseCase,
} from "@/src/application/quotation";
import {
  PrismaQuotationRepository,
} from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

import {
  getQuotationIdFromActionUrl,
} from "../quotation-action";

const repository =
  new PrismaQuotationRepository();

const approveQuotation =
  new ApproveQuotationUseCase(
    repository,
  );

export const POST = withCompanyAuth(
  [
    "OWNER",
    "ADMIN",
  ],
  async (
    request,
    auth,
    company,
  ) => {
    const quotationId =
      getQuotationIdFromActionUrl(
        request,
      );

    const result =
      await approveQuotation.execute({
        companyId:
          company.companyId,

        quotationId,

        approvedByName:
          auth.user.name?.trim() ||
          auth.user.email,

        approvedByRole:
          company.role,
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
          "Cache-Control":
            "no-store",
        },
      },
    );
  },
);
