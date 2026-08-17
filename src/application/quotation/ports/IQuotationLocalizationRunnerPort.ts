export interface IQuotationLocalizationRunnerPort {
  run(params: { companyId: string; quotationId: string }): Promise<string>;
}
