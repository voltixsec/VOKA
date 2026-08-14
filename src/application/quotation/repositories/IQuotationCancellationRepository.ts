import type { CancelQuotationDto } from "../dto/CancelQuotationDto";

export type CancelQuotationPersistenceResult =
  | { kind: "CANCELLED" }
  | { kind: "QUOTATION_NOT_FOUND" }
  | { kind: "QUOTATION_HAS_SALES_ORDER" };

export interface IQuotationCancellationRepository {
  cancel(
    params: CancelQuotationDto,
  ): Promise<CancelQuotationPersistenceResult>;
}
