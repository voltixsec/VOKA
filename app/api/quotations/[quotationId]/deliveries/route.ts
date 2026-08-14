import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import {
  GetQuotationDeliveryHistoryUseCase,
  serializeQuotationDelivery,
} from "@/src/application/quotation-delivery";
import { PrismaQuotationDeliveryRepository } from "@/src/infrastructure/persistence/prisma/quotation-delivery/PrismaQuotationDeliveryRepository";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { QuotationDeliveryProviderConfiguration } from "@/src/infrastructure/delivery/QuotationDeliveryProviderConfiguration";

const useCase = new GetQuotationDeliveryHistoryUseCase(
  new PrismaQuotationRepository(),
  new PrismaQuotationDeliveryRepository(),
);

function quotationId(request: Request): string {
  const value = new URL(request.url).pathname.split("/").filter(Boolean).at(-2);
  if (!value || value === "quotations") {
    throw ApiError.badRequest("QUOTATION_ID_REQUIRED", "quotationId is required.");
  }
  return decodeURIComponent(value);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const result = await useCase.execute({
      companyId: company.companyId,
      quotationId: quotationId(request),
    });

    if (!result.success) {
      throw ApiError.notFound(result.error.code, result.error.message);
    }

    const availability = new QuotationDeliveryProviderConfiguration()
      .getAvailability();

    return apiSuccess(
      result.data.map(serializeQuotationDelivery),
      {
        meta: {
          channels: {
            EMAIL: { configured: availability.EMAIL.configured },
            WHATSAPP: {
              configured: availability.WHATSAPP.configured,
              locales: availability.WHATSAPP.locales,
            },
          },
        },
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  },
);
