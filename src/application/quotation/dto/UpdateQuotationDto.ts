import type {
  Discount,
  QuotationLineInput,
  QuotationProposalProps,
} from "../../../domain/quotation";

export interface UpdateQuotationDto
  extends QuotationProposalProps {
  companyId: string;

  quotationId: string;

  lines: QuotationLineInput[];

  discount?: Discount | null;

  expiryDate?: Date | null;

  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;

  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  localizationSourceLocale?: "ar" | "en";
  taxRateRefreshLineIds?: string[];
}
