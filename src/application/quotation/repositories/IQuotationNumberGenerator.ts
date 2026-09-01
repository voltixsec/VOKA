export interface IQuotationNumberGenerator {
  generate(companyId: string, issueDate: Date): Promise<string>;
}
