import type {
  Quotation,
  QuotationStatus,
} from "../../../domain/quotation";

export type QuotationListFilters = {
  companyId: string;
  status?: QuotationStatus;
  customerId?: string;
  search?: string;
  skip: number;
  take: number;
};

export type QuotationListResult = {
  quotations: Quotation[];
  total: number;
};

export type QuotationLocalizationClaimParams = {
  companyId: string;
  quotationId: string;
  claimToken?: string;
  leaseDurationMs: number;
};

export type QuotationLocalizationClaim = {
  claimToken: string;
  sourceSignature: string;
  attemptCount: number;
};

export interface IQuotationRepository {
  existsByNumber(
    companyId: string,
    quotationNumber: string,
  ): Promise<boolean>;

  save(
    quotation: Quotation,
  ): Promise<Quotation>;

  findById(
    companyId: string,
    id: string,
  ): Promise<Quotation | null>;

  findAll(
    filters: QuotationListFilters,
  ): Promise<QuotationListResult>;

  update(
    companyId: string,
    quotation: Quotation,
  ): Promise<void>;

  delete(
    companyId: string,
    id: string,
  ): Promise<void>;

  claimLocalization(
    params: QuotationLocalizationClaimParams,
  ): Promise<QuotationLocalizationClaim | null>;
}
