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
import { prisma } from "@/lib/prisma";
import { createCompanyDocumentBrandSnapshot } from "@/src/domain/document/CompanyDocumentBrandSnapshot";

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

    const brand = await prisma.company.findUnique({
      where: { id: company.companyId },
      select: {
        name: true, nameAr: true, nameEn: true, addressAr: true, addressEn: true,
        poBox: true, phone: true, mobile: true, whatsapp: true,
        logoUrl: true, brandTheme: true,
      },
    });

    if (!brand) {
      throw ApiError.notFound("COMPANY_NOT_FOUND", "Company not found.");
    }

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
        documentBrandSnapshot: createCompanyDocumentBrandSnapshot({
          ...brand,
          nameEn: brand.nameEn ?? brand.name,
          brandTheme: brand.brandTheme,
        }),
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
