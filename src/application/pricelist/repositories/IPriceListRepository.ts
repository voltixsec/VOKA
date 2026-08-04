import type { PriceList } from "../../../domain/pricelist";

export interface IPriceListRepository {

  findDefault(
    companyId: string,
    currencyCode: string,
    customerId?: string,
  ): Promise<PriceList | null>;

}
