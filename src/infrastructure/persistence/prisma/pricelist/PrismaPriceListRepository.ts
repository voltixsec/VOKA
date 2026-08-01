import type { PrismaClient } from "../../../../../lib/generated/prisma/client";

import type {
  IPriceListRepository,
} from "../../../../application/pricelist/repositories";

import type {
  PriceList,
} from "../../../../domain/pricelist";

export class PrismaPriceListRepository
implements IPriceListRepository {

  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  async findDefault(
    companyId: string,
    currencyCode: string,
    customerId?: string,
  ): Promise<PriceList | null> {

    void this.prisma;

    void companyId;

    void currencyCode;

    void customerId;

    return null;

  }

}
