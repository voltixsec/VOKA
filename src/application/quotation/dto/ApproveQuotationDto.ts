export interface ApproveQuotationDto {
  companyId: string;

  quotationId: string;

  approvedByName?: string;

  approvedByRole?: string;
}
