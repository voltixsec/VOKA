export class QuotationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotationDomainError";
  }
}