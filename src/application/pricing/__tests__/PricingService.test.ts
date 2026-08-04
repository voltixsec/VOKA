import { describe, expect, it } from "vitest";

import {
PricingService,
} from "../services";

describe(
"PricingService",
() => {

it(
"calculates subtotal",
async () => {

const service =
new PricingService();

const result =
await service.resolveUnitPrice({

companyId:"1",

priceListId:"1",

catalogItemId:"1",

quantity:5,

});

expect(
result.unitPrice,
).toBe(100);

expect(
result.subtotal,
).toBe(500);

});

});
