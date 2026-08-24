import type { Quotation } from "../../../domain/quotation";

export type CreateQuotationRevisionResult =
  | { kind: "CREATED"; quotation: Quotation }
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_CURRENT" }
  | { kind: "NOT_APPROVED" };

export interface IQuotationRevisionRepository {
  createFromApprovedSnapshot(
    companyId: string,
    quotationId: string,
  ): Promise<CreateQuotationRevisionResult>;

  findFamilyHistory(
    companyId: string,
    quotationId: string,
  ): Promise<Quotation[] | null>;
}
