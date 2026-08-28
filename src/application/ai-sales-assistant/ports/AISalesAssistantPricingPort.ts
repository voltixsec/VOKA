export interface AISalesAssistantPricingPort {
  resolvePriceDetails?(input: { companyId: string; priceListId: string | null; catalogItemId: string; quantity: number; currencyCode: string; companyCurrency: string }): Promise<{ price: number | null; source: "PRICE_LIST" | "CATALOG" | "UNRESOLVED" }>;
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
