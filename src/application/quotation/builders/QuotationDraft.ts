export interface QuotationDraftInput {

  customerId: string;

  priceListId: string | null;

  subtotal: number;

  discountPercentage: number;

  taxRate: number;

}

export class QuotationDraft {

  build(
    input: QuotationDraftInput,
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
