export const QUOTATION_STATUSES = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];