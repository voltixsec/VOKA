export class ContractDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractDomainError";
  }
}
