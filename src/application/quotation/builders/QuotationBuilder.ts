export interface QuotationBuilderInput {

  customerId: string;

  priceListId: string | null;

  subtotal: number;

  discountPercentage: number;

  taxRate: number;

}

export class QuotationBuilder {

  build(
    input: QuotationBuilderInput,
  ) {

    return {

      customerId:
        input.customerId,

      priceListId:
        input.priceListId,

      subtotal:
        input.subtotal,

      discountPercentage:
        input.discountPercentage,

      taxRate:
        input.taxRate,

    };

  }

}
