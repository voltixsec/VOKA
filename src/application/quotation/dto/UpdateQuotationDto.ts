import type {
  Discount,
  QuotationLineInput,
} from "../../../domain/quotation";

export interface UpdateQuotationDto {
  quotationId: string;

  lines: QuotationLineInput[];

  discount?: Discount | null;

  notes?: string | null;

  termsAndConditions?: string | null;
}