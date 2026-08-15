export const SALES_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
] as const;

export type SalesOrderStatus =
  (typeof SALES_ORDER_STATUSES)[number];
