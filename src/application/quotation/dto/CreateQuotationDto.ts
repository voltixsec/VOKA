import type {
  CustomerSnapshotProps,
  Discount,
  QuotationLineInput,
  QuotationProposalProps,
} from "../../../domain/quotation";

export interface CreateQuotationDto
  extends QuotationProposalProps {
  companyId: string;
  customerId: string;
  priceListId?: string | null;

  quotationNumber: string;

  currencyCode?: string;

  customer: CustomerSnapshotProps;

  lines: QuotationLineInput[];

  discount?: Discount | null;

  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;

  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;

  issueDate?: Date;

  expiryDate?: Date | null;

  localizationSourceLocale?: "ar" | "en";
}
