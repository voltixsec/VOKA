import type { QuotationLineType } from "../../../domain/quotation";

export interface ContractCatalogItemSnapshot {
  id: string;
  type: QuotationLineType;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string | null;
  itemNameEn: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  unitName: string | null;
  unitNameAr: string | null;
  unitNameEn: string | null;
  defaultTaxRateId: string | null;
}

export interface IContractReferenceResolver {
  isPriceListAvailable(input: {
    companyId: string;
    priceListId: string;
    currencyCode: string;
  }): Promise<boolean>;

  getCatalogItemSnapshot(
    companyId: string,
    catalogItemId: string,
  ): Promise<ContractCatalogItemSnapshot | null>;

  resolveTaxRatePercentage(
    companyId: string,
    taxRateId: string,
  ): Promise<number | null>;
}
