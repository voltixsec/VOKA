export interface IQuotationSalesOrderGuard {
  existsBySourceQuotation(
    companyId: string,
    quotationId: string,
  ): Promise<boolean>;
}
