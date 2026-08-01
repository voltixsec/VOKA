import type { IPriceListRepository } from "../repositories";

export interface ResolvePriceListRequest {

  companyId: string;

  customerId?: string;

  currencyCode?: string;

}

export class PriceListResolver {

  constructor(
    private readonly repository: IPriceListRepository,
  ) {}

  async resolve(
    request: ResolvePriceListRequest,
  ): Promise<string | null> {

    if (!request.currencyCode) {
      return null;
    }

    const priceList =
      await this.repository.findDefault(
        request.companyId,
        request.currencyCode,
        request.customerId,
      );

    return priceList?.id.toString() ?? null;

  }

}
