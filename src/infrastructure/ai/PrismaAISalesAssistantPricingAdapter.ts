import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { AISalesAssistantPricingPort } from "@/src/application/ai-sales-assistant/ports/AISalesAssistantPricingPort";
import { PricingService, type PricingDbClient } from "@/src/application/pricing/services/PricingService";
import { PriceListResolver } from "@/src/application/pricelist/services/PriceListResolver";
import { PrismaPriceListRepository } from "@/src/infrastructure/persistence/prisma/pricelist/PrismaPriceListRepository";

export class PrismaAISalesAssistantPricingAdapter
  implements AISalesAssistantPricingPort
{
  private readonly priceListResolver: PriceListResolver;
  private readonly pricingService: PricingService;

  constructor(prisma: PrismaClient) {
    this.priceListResolver = new PriceListResolver(
      new PrismaPriceListRepository(prisma),
    );
    this.pricingService = new PricingService(prisma as unknown as PricingDbClient);
  }

  async resolvePriceListId(input: {
    companyId: string;
    customerId?: string;
    currencyCode: string;
  }): Promise<string | null> {
    return this.priceListResolver.resolve({
      companyId: input.companyId,
      customerId: input.customerId,
      currencyCode: input.currencyCode,
    });
  }

  async resolveUnitPrice(input: {
    companyId: string;
    priceListId: string | null;
    catalogItemId: string;
    quantity: number;
  }): Promise<number> {
    const result = await this.pricingService.resolveUnitPrice({
      companyId: input.companyId,
      priceListId: input.priceListId ?? "",
      catalogItemId: input.catalogItemId,
      quantity: input.quantity,
    });

    return result.unitPrice;
  }
}
