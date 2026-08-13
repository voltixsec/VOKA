import type { CompanyDocumentBrandSnapshot } from "../../../domain/document/CompanyDocumentBrandSnapshot";

export interface ApproveQuotationDto {
  companyId: string;

  quotationId: string;

  approvedByName?: string;

  approvedByRole?: string;
  documentBrandSnapshot: CompanyDocumentBrandSnapshot;
}
