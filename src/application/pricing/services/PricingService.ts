import type { ResolvePriceRequest } from "../dto/ResolvePriceRequest";
import type { ResolvePriceResult } from "../dto/ResolvePriceResult";

export interface PricingDbClient {
  priceListItem: {
    findFirst(args: unknown): Promise<{ price: unknown } | null>;
  };
  catalogItem: {
    findFirst(args: unknown): Promise<{ salePrice: unknown } | null>;
  };
}

export class PricingService {
  constructor(private readonly db?: PricingDbClient) {}

  async resolveUnitPrice(
    request: ResolvePriceRequest,
  ): Promise<ResolvePriceResult> {
    let resolvedPrice: number | null = null;

    if (this.db && request.priceListId && request.catalogItemId) {
      const itemPrice = await this.db.priceListItem.findFirst({
        where: {
          priceListId: request.priceListId,
          catalogItemId: request.catalogItemId,
          priceList: {
            companyId: request.companyId,
            isActive: true,
          },
        },
      });

      if (itemPrice !== null && itemPrice !== undefined) {
        resolvedPrice = Number(itemPrice.price);
      }
    }

    if (this.db && resolvedPrice === null && request.catalogItemId) {
      const catalogItem = await this.db.catalogItem.findFirst({
        where: {
          id: request.catalogItemId,
          companyId: request.companyId,
        },
      });

      if (catalogItem !== null && catalogItem !== undefined) {
        resolvedPrice = Number(catalogItem.salePrice);
      }
    }

    const unitPrice = resolvedPrice ?? 0;
    const subtotal = unitPrice * request.quantity;

    return {
      unitPrice,
      quantity: request.quantity,
      subtotal,
    };
  }
}
