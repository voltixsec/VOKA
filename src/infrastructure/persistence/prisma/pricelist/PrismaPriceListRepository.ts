import { prisma } from "../../../../../lib/prisma";

import type {
  IPriceListRepository,
} from "../../../../application/pricelist/repositories";

import type {
  PriceList,
} from "../../../../domain/pricelist";

import {
  PriceListMapper,
} from "../mappers";

export class PrismaPriceListRepository
implements IPriceListRepository {

  constructor(
    private readonly db = prisma,
  ) {}

  async findDefault(
    companyId: string,
    currencyCode: string,
    customerId?: string,
  ): Promise<PriceList | null> {

    void customerId;

    const model =
      await this.db.priceList.findFirst({

        where: {
          companyId,
          currencyCode,
          isDefault: true,
          isActive: true,
        },

        include: {
          items: true,
        },

      });

    if (!model) {
      return null;
    }

    return PriceListMapper.toDomain(model);

  }

}
