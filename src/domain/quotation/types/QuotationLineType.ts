export const QUOTATION_LINE_TYPES = [
  "PRODUCT",
  "SERVICE",
  "SHIPPING",
  "LABOR",
  "DISCOUNT",
  "CUSTOM",
] as const;

export type QuotationLineType = (typeof QUOTATION_LINE_TYPES)[number];