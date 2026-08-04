import type { PricingService } from "../../pricing/services";
import type { PriceListResolver } from "../../pricelist/services";
import type { CustomerResolver } from "../../customer/services";

export interface CreateQuotationRequest {

  companyId: string;

  customerName: string;

  customerEmail?: string;

  catalogItemId: string;

  quantity: number;

  currencyCode: string;

}

export class CreateQuotationFlow {

  constructor(
    private readonly customerResolver: CustomerResolver,
    private readonly priceListResolver: PriceListResolver,
    private readonly pricingService: PricingService,
  ) {}

  async execute(
    request: CreateQuotationRequest,
  ) {

    const customer =
      await this.customerResolver.resolve(
        request.companyId,
        request.customerName,
        request.customerEmail,
      );

    const priceListId =
      await this.priceListResolver.resolve({

        companyId:
          request.companyId,

        customerId:
          customer.id.toString(),

        currencyCode:
          request.currencyCode,

      });

    const pricing =
      await this.pricingService.resolveUnitPrice({

        companyId:
          request.companyId,

        priceListId:
          priceListId ?? "",

        catalogItemId:
          request.catalogItemId,

        quantity:
          request.quantity,

      });

    return {

      customerId:
        customer.id.toString(),

      priceListId,

      unitPrice:
        pricing.unitPrice,

      quantity:
        pricing.quantity,

      subtotal:
        pricing.subtotal,

    };

  }

}
