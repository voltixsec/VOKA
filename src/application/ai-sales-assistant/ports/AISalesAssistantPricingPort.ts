export interface AISalesAssistantPricingPort {
  resolvePriceListId(input: {
    companyId: string;
    customerId?: string;
    currencyCode: string;
  }): Promise<string | null>;

  resolveUnitPrice(input: {
    companyId: string;
    priceListId: string | null;
    catalogItemId: string;
    quantity: number;
  }): Promise<number>;
}
