import type { Quotation } from "../../../domain/quotation";

export interface IQuotationRepository {
  existsByNumber(
    companyId: string,
    quotationNumber: string,
  ): Promise<boolean>;

  save(
    quotation: Quotation,
  ): Promise<void>;

  findById(
    id: string,
  ): Promise<Quotation | null>;

  update(
    quotation: Quotation,
  ): Promise<void>;

  delete(
    id: string,
  ): Promise<void>;
}