import { CurrencyCode } from "../value-objects/CurrencyCode";
import { Price } from "../value-objects/Price";

export interface PriceListItemProps {

  id: string;

  catalogItemId: string;

  price: Price;

  currency: CurrencyCode;

  minimumQuantity: number;

}

export class PriceListItem {

  constructor(
    readonly props: PriceListItemProps,
  ) {

    if (props.minimumQuantity < 1) {
      throw new Error(
        "Minimum quantity must be greater than zero.",
      );
    }

  }

}
