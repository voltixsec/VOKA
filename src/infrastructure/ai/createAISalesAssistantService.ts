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
  return new AISalesAssistantService({
    companies: new PrismaCompanyRepository(prisma),
    customers: new PrismaCustomerRepository(prisma),
    catalogItems: new PrismaCatalogItemRepository(prisma),
    units: new PrismaUnitRepository(prisma),
    quotationReferences: new PrismaQuotationReferenceValidator(),
    pricing: new PrismaAISalesAssistantPricingAdapter(prisma),
  }, createSalesAssistantPort());
}
