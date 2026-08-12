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

export type QuotationLocalizationErrorCode =
  | "TRANSLATION_TIMEOUT"
  | "TRANSLATION_PROVIDER_ERROR"
  | "TRANSLATION_INVALID_RESPONSE"
  | "TRANSLATION_UNEXPECTED_ERROR";

export type QuotationLocalizationHeaderPatch = {
  customerNameAr?: string | null;
  customerNameEn?: string | null;

  projectNameAr?: string | null;
  projectNameEn?: string | null;

  attentionNameAr?: string | null;
  attentionNameEn?: string | null;

  subjectAr?: string | null;
  subjectEn?: string | null;

  briefAr?: string | null;
  briefEn?: string | null;

  notesAr?: string | null;
  notesEn?: string | null;

  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
};

export type QuotationLocalizationLinePatch = {
  id: string;

  itemNameAr?: string | null;
  itemNameEn?: string | null;

  descriptionAr?: string | null;
  descriptionEn?: string | null;

  unitNameAr?: string | null;
  unitNameEn?: string | null;
};

export type CompleteQuotationLocalizationParams = {
  companyId: string;
  quotationId: string;

  expectedSourceSignature: string;
  expectedClaimToken: string;

  header: QuotationLocalizationHeaderPatch;
  lines: QuotationLocalizationLinePatch[];

  completedAt: Date;
};

export type FailQuotationLocalizationParams = {
  companyId: string;
  quotationId: string;

  expectedSourceSignature: string;
  expectedClaimToken: string;

  errorCode: QuotationLocalizationErrorCode;
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
  completeLocalization(
    params: CompleteQuotationLocalizationParams,
  ): Promise<boolean>;
  failLocalization(
    params: FailQuotationLocalizationParams,
  ): Promise<boolean>;
}
