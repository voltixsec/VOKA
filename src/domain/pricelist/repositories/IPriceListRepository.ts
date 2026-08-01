import { PriceList } from "../entities";

export interface IPriceListRepository {

  findDefault(
    companyId: string,
    currencyCode: string,
    customerId?: string,
  ): Promise<PriceList | null>;

}
