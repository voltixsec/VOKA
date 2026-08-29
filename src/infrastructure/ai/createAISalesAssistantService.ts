import { prisma } from "@/lib/prisma";
import { AISalesAssistantService } from "@/src/application/ai-sales-assistant";
import { PrismaCatalogItemRepository } from "@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository";
import { PrismaUnitRepository } from "@/features/catalog/infrastructure/prisma/PrismaUnitRepository";
import { PrismaCompanyRepository } from "@/features/company/infrastructure/prisma/PrismaCompanyRepository";
import { PrismaCustomerRepository } from "@/features/customers/infrastructure/prisma/PrismaCustomerRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";
import { PrismaAISalesAssistantPricingAdapter } from "./PrismaAISalesAssistantPricingAdapter";
import { createSalesAssistantPort } from "./createSalesAssistantPort";

export function createAISalesAssistantService() {
  const provider = createSalesAssistantPort();
  return new AISalesAssistantService({
    terms: { async find(companyId, scopeType, locale) {
      const template = await prisma.companyQuotationTermsTemplate.findUnique({ where: { companyId_scopeType: { companyId, scopeType } }, select: { termsAr: true, termsEn: true } });
      return (locale === "ar" ? template?.termsAr : template?.termsEn) ?? null;
    } },
    companies: new PrismaCompanyRepository(prisma),
    customers: new PrismaCustomerRepository(prisma),
    catalogItems: new PrismaCatalogItemRepository(prisma),
    units: new PrismaUnitRepository(prisma),
    quotationReferences: new PrismaQuotationReferenceValidator(),
    pricing: new PrismaAISalesAssistantPricingAdapter(prisma),
  }, provider, provider && "researchSystem" in provider ? provider as import("@/src/application/agentic-commercial-intelligence").CommercialSystemResearchPort : null);
}
