import type { Discount } from "./DiscountType";
import type { QuotationLineType } from "./QuotationLineType";

export interface QuotationLineInput {
  id?: string;
  catalogItemId?: string | null;
  taxRateId?: string | null;
  position: number;
  type: QuotationLineType;
  itemCode?: string | null;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unitName?: string | null;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  discount?: Discount | null;
  taxPercentage?: number;
}

export interface CalculatedQuotationLine extends QuotationLineInput {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}