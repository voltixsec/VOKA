import type { DiscountType, QuotationLineType } from "../../quotation";
import type { CommercialDocumentKind } from "./CommercialDocumentKind";
import type { CommercialDocumentProvenance } from "../value-objects/CommercialDocumentProvenance";

export interface CommercialCustomerSnapshot {
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
}

export interface CommercialLineSnapshot {
  id?: string;
  sourceLineId?: string | null;
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
  discountType?: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  subtotal: number;
  totalAmount: number;
}

export interface CommercialTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface CommercialConversionContract {
  sourceKind: CommercialDocumentKind;
  sourceId: string;
  targetKind: CommercialDocumentKind;
  provenance: CommercialDocumentProvenance;
  idempotencyKey?: string | null;
}
