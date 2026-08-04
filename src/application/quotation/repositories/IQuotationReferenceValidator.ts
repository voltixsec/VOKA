export type QuotationReferenceValidationInput = {
  companyId: string;
  customerId: string;
  priceListId?: string | null;
  catalogItemIds: string[];
  taxRateIds: string[];
};

export type InvalidQuotationReference = {
  code:
    | "CUSTOMER_NOT_FOUND"
    | "PRICE_LIST_NOT_FOUND"
    | "CATALOG_ITEM_NOT_FOUND"
    | "TAX_RATE_NOT_FOUND";
  message: string;
};

export interface IQuotationReferenceValidator {
  findInvalidReference(
    input: QuotationReferenceValidationInput,
  ): Promise<InvalidQuotationReference | null>;
}
