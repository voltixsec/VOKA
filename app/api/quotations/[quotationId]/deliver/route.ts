import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import {
  DeliverQuotationUseCase,
  serializeQuotationDelivery,
} from "@/src/application/quotation-delivery";
import { isQuotationDeliveryChannel } from "@/src/domain/quotation-delivery";
import { UnavailableQuotationDeliveryGateway } from "@/src/infrastructure/delivery/UnavailableQuotationDeliveryGateway";
import { GenerateQuotationDocumentUseCase } from "@/src/application/document";
import { PrismaQuotationDocumentProvider } from "@/src/infrastructure/document/PrismaQuotationDocumentProvider";
import { PdfKitQuotationDocumentRenderer } from "@/src/infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer";
import { PrismaQuotationDeliveryRepository } from "@/src/infrastructure/persistence/prisma/quotation-delivery/PrismaQuotationDeliveryRepository";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

const useCase = new DeliverQuotationUseCase(
  new PrismaQuotationRepository(),
  new PrismaQuotationDeliveryRepository(),
  new PrismaQuotationDocumentProvider(
    new GenerateQuotationDocumentUseCase(
      new PrismaQuotationRepository(),
      new PdfKitQuotationDocumentRenderer(),
    ),
  ),
  new UnavailableQuotationDeliveryGateway(),
);

function quotationId(request: Request): string {
  const value = new URL(request.url).pathname.split("/").filter(Boolean).at(-2);
  if (!value || value === "quotations") {
    throw ApiError.badRequest("QUOTATION_ID_REQUIRED", "quotationId is required.");
  }
  return decodeURIComponent(value);
}

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!isQuotationDeliveryChannel(body.channel)) {
      throw ApiError.badRequest(
        "DELIVERY_CHANNEL_INVALID",
        "channel must be EMAIL or WHATSAPP.",
        { field: "channel" },
      );
    }
    if (typeof body.recipient !== "string" || !body.recipient.trim()) {
      throw ApiError.badRequest(
        "DELIVERY_RECIPIENT_REQUIRED",
        "recipient is required.",
        { field: "recipient" },
      );
    }
    if (body.locale !== "ar" && body.locale !== "en") {
      throw ApiError.badRequest(
        "DELIVERY_LOCALE_INVALID",
        "locale must be ar or en.",
        { field: "locale" },
      );
    }

    const result = await useCase.execute({
      companyId: company.companyId,
      quotationId: quotationId(request),
      channel: body.channel,
      recipient: body.recipient,
      locale: body.locale,
    });

    if (!result.success) {
      if (result.error.code === "QUOTATION_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      throw ApiError.badRequest(result.error.code, result.error.message);
    }

    return apiSuccess(serializeQuotationDelivery(result.data), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  },
);
