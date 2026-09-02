import type { Discount } from "./DiscountType";
import type { QuotationLineType } from "./QuotationLineType";

export type QuotationMarketPriceEvidence = {
  priceAmount: number | null;
  priceCurrency: string;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string | null;
  priceType: "LISTED_RETAIL" | "LISTED_WHOLESALE" | "PROMOTIONAL" | "FROM_PRICE" | "RANGE" | "UNKNOWN";
  priceSourceUrl: string;
  priceSourceTitle: string;
  priceObservedAt: string;
};

export type QuotationCommercialAttributes = {
  subtype?: string | null;
  resolution?: string | null;
  capacity?: string | null;
  channels?: number | null;
  diskBays?: number | null;
  ports?: number | null;
  packageSize?: string | null;
  material?: string | null;
  grade?: string | null;
  dimensions?: string | null;
  features?: string[];
};

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
  quantity: number | null;
  unitPrice: number | null;
  quantityStatus?: "PENDING" | "CONFIRMED";
  pricingStatus?: "PENDING" | "CONFIRMED";
  productSelectionStatus?: "PENDING" | "GENERIC" | "SELECTED";
  engineeringStatus?: "EXACT" | "ESTIMATED" | "CONFLICT";
  commercialPricingStatus?: "PENDING" | "MARKET_REFERENCE_AVAILABLE" | "CONFIRMED";
  commercialAttributes?: QuotationCommercialAttributes;
  brandName?: string | null;
  modelNumber?: string | null;
  provenance?: string | null;
  engineeringComponentKeys?: string[];
  /** External market reference only; never an approved selling price. */
  marketPrice?: QuotationMarketPriceEvidence | null;
  discount?: Discount | null;
  taxPercentage?: number;
}

export interface CalculatedQuotationLine extends QuotationLineInput {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}
