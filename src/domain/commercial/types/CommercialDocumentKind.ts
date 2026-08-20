export enum CommercialDocumentKind {
  QUOTATION = "QUOTATION",
  SALES_ORDER = "SALES_ORDER",
  CONTRACT = "CONTRACT",
  INVOICE = "INVOICE",
  PAYMENT = "PAYMENT",
}

export type CommercialDocumentKindType = `${CommercialDocumentKind}`;

export function isCommercialDocumentKind(value: unknown): value is CommercialDocumentKind {
  return (
    typeof value === "string" &&
    Object.values(CommercialDocumentKind).includes(value as CommercialDocumentKind)
  );
}
