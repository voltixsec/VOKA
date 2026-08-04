import type {
PriceList as PrismaPriceList,
PriceListItem as PrismaPriceListItem,
} from "../../../../../lib/generated/prisma/client";

import {
PriceList,
PriceListItem,
Price,
CurrencyCode,
PriceListCode,
PriceListId,
} from "../../../../domain/pricelist";

export class PriceListMapper {

  static toDomain(
    source: PrismaPriceList & {
      items: PrismaPriceListItem[];
    },
  ): PriceList {

    return new PriceList({

      id:
        new PriceListId(source.id),

      companyId:
        source.companyId,

      code:
        new PriceListCode(source.code),

      name:
        source.name,

      items:
        source.items.map(
          item =>
            new PriceListItem({

              id:
                item.id,

              catalogItemId:
                item.catalogItemId,

              price:
                new Price(
                  Number(item.price),
                ),

              currency:
                new CurrencyCode(
                  source.currencyCode,
                ),

              minimumQuantity:
                1,

            }),
        ),

    });

  }

}
