import type {
ResolvePriceRequest,
} from "../dto/ResolvePriceRequest";

import type {
ResolvePriceResult,
} from "../dto/ResolvePriceResult";

export interface IPriceResolver {

  resolve(
    request: ResolvePriceRequest,
  ): Promise<ResolvePriceResult>;

}
