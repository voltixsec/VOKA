export interface ResolvePriceResult {

  unitPrice: number;
  source?: "PRICE_LIST" | "CATALOG" | "UNRESOLVED";

  quantity: number;

  subtotal: number;

}
