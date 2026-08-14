import type { CustomerSnapshotProps } from "../../../domain/quotation";

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

export type AvailableQuotationTaxRate = {
  id: string;
  name: string;
  percentage: number;
  isSystem: boolean;
};

export interface IQuotationReferenceValidator {
  findInvalidReference(
    input: QuotationReferenceValidationInput,
  ): Promise<InvalidQuotationReference | null>;
  getCustomerSnapshot(
    companyId: string,
    customerId: string,
  ): Promise<CustomerSnapshotProps | null>;
  resolveTaxRatePercentages(
    companyId: string,
    taxRateIds: string[],
    options?: { activeOnly?: boolean },
  ): Promise<ReadonlyMap<string, number>>;
  listAvailableTaxRates(
    companyId: string,
  ): Promise<AvailableQuotationTaxRate[]>;
}
