import type {
  CustomerSnapshotProps,
  Discount,
  QuotationLineInput,
} from "../../../domain/quotation";

export interface CreateQuotationDto {
  companyId: string;
  customerId: string;
  priceListId?: string | null;

  quotationNumber: string;

  currencyCode?: string;

  customer: CustomerSnapshotProps;

  lines: QuotationLineInput[];

  discount?: Discount | null;

  notes?: string | null;

  termsAndConditions?: string | null;

  issueDate?: Date;

  expiryDate?: Date | null;
}