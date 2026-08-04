import type {
  Discount,
  QuotationLineInput,
} from "../../../domain/quotation";

export interface UpdateQuotationDto {
  companyId: string;

  quotationId: string;

  lines: QuotationLineInput[];

  discount?: Discount | null;

  notes?: string | null;

  termsAndConditions?: string | null;
}