export class CommercialDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialDomainError";
  }
}
