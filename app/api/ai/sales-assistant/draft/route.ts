import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { AISalesAssistantService } from "@/src/application/ai-sales-assistant";
import { SALES_ASSISTANT_PROMPT_MAX_LENGTH } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import { createSalesAssistantPort } from "@/src/infrastructure/ai/createSalesAssistantPort";
import { PrismaAISalesAssistantPricingAdapter } from "@/src/infrastructure/ai/PrismaAISalesAssistantPricingAdapter";
import { PrismaCatalogItemRepository } from "@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository";
import { PrismaUnitRepository } from "@/features/catalog/infrastructure/prisma/PrismaUnitRepository";
import { PrismaCompanyRepository } from "@/features/company/infrastructure/prisma/PrismaCompanyRepository";
import { PrismaCustomerRepository } from "@/features/customers/infrastructure/prisma/PrismaCustomerRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";

function createService(): AISalesAssistantService {
  const provider = createSalesAssistantPort();
  const pricing = new PrismaAISalesAssistantPricingAdapter(prisma);

  return new AISalesAssistantService(
    {
      companies: new PrismaCompanyRepository(prisma),
      customers: new PrismaCustomerRepository(prisma),
      catalogItems: new PrismaCatalogItemRepository(prisma),
      units: new PrismaUnitRepository(prisma),
      quotationReferences: new PrismaQuotationReferenceValidator(),
      pricing,
    },
    provider,
  );
}

type RequestBody = {
  prompt?: unknown;
  sourceLocale?: unknown;
};

export const POST = withCompanyAuth(
  [
    "OWNER",
    "ADMIN",
    "SALES",
  ],
  async (request, _auth, company) => {
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      throw ApiError.badRequest(
        "INVALID_JSON",
        "Invalid JSON request body.",
      );
    }

    if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
      throw ApiError.badRequest(
        "PROMPT_REQUIRED",
        "The prompt field is required and must be a non-empty string.",
        { field: "prompt" },
      );
    }

    const trimmedPrompt = body.prompt.trim();
    if (trimmedPrompt.length > SALES_ASSISTANT_PROMPT_MAX_LENGTH) {
      throw ApiError.badRequest(
        "PROMPT_TOO_LONG",
        `The prompt exceeds the maximum allowed length of ${SALES_ASSISTANT_PROMPT_MAX_LENGTH} characters.`,
        { field: "prompt" },
      );
    }

    let sourceLocale: "ar" | "en" | undefined;
    if (body.sourceLocale !== undefined) {
      if (body.sourceLocale === "ar" || body.sourceLocale === "en") {
        sourceLocale = body.sourceLocale;
      } else {
        throw ApiError.badRequest(
          "INVALID_LOCALE",
          "sourceLocale must be 'ar' or 'en'.",
          { field: "sourceLocale" },
        );
      }
    }

    try {
      const service = createService();
      const draftProposal = await service.generateDraftProposal({
        companyId: company.companyId,
        prompt: trimmedPrompt,
        sourceLocale,
      });

      return apiSuccess(draftProposal, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    } catch (err: any) {
      if (err.message === "ACTIVE_COMPANY_NOT_FOUND") {
        throw ApiError.notFound(
          "ACTIVE_COMPANY_NOT_FOUND",
          "The specified company was not found or is inactive.",
        );
      }

      // Safe error response without leaking internal errors
      throw ApiError.internal(
        "An unexpected error occurred while generating the sales proposal draft.",
      );
    }
  },
);
