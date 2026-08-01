import type {
ResolvePriceRequest,
} from "../dto/ResolvePriceRequest";

import type {
ResolvePriceResult,
} from "../dto/ResolvePriceResult";

export class PricingService {

  async resolveUnitPrice(
    request: ResolvePriceRequest,
  ): Promise<ResolvePriceResult> {

    //
    // Temporary pricing implementation.
    // Next Sprint:
    // Read from PriceListRepository.
    //

    const unitPrice = 100;

    const subtotal =
      unitPrice *
      request.quantity;

    return {

      unitPrice,

      quantity:
        request.quantity,

      subtotal,

    };

  }

}
