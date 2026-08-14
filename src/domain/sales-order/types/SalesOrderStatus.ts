export const SALES_ORDER_STATUSES = ["DRAFT"] as const;

export type SalesOrderStatus =
  (typeof SALES_ORDER_STATUSES)[number];
