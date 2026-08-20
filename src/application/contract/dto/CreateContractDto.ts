import type { DiscountType, QuotationLineType, QuotationScopeType } from "../../../domain/quotation";
import type { MilestoneAmountType } from "../../../domain/contract";

export interface CreateContractLineInput {
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
  discountValue?: number;
  taxPercentage?: number;
}

export interface CreateContractMilestoneInput {
  position: number;
  title: string;
  titleAr?: string | null;
  titleEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  amountType: MilestoneAmountType | `${MilestoneAmountType}`;
  percentage?: number | null;
  fixedAmount?: number | null;
  dueDate?: string | Date | null;
}

export interface CreateContractDto {
  companyId: string;
  customerId: string;
  provenance?: {
    origin: "DIRECT" | "QUOTATION" | "SALES_ORDER" | "CONTRACT";
    sourceKind?: "QUOTATION" | "SALES_ORDER" | "CONTRACT" | null;
    sourceId?: string | null;
  };
  priceListId?: string | null;
  currencyCode?: string;
  contractDate?: string | Date;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  projectName?: string | null;
  projectNameAr?: string | null;
  projectNameEn?: string | null;
  attentionName?: string | null;
  attentionNameAr?: string | null;
  attentionNameEn?: string | null;
  scopeType?: QuotationScopeType | null;
  discountType?: DiscountType | null;
  discountValue?: number;
  lines: CreateContractLineInput[];
  milestones?: CreateContractMilestoneInput[];
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  actor: {
    userId?: string | null;
    name: string;
    role: string;
  };
}
