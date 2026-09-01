import type {
  CustomerSnapshotProps,
  Discount,
  QuotationLineInput,
  QuotationProposalProps,
} from "../../../domain/quotation";

export interface CreateQuotationDto
  extends QuotationProposalProps {
  companyId: string;
  customerId: string | null;
  priceListId?: string | null;

  /** Assigned by the canonical server policy in production create paths. */
  quotationNumber?: string;
  /** Optional hidden idempotency/family identity; never used as the visible number. */
  familyId?: string;

  currencyCode?: string;

  customer: CustomerSnapshotProps | null;

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
