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
    companyId: string,
    id: string,
  ): Promise<Quotation | null>;

  update(
    companyId: string,
    quotation: Quotation,
  ): Promise<void>;

  delete(
    companyId: string,
    id: string,
  ): Promise<void>;
}