export const DISCOUNT_TYPES = ["FIXED", "PERCENTAGE"] as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export interface Discount {
  type: DiscountType;
  value: number;
}