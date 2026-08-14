export class SalesOrderDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesOrderDomainError";
  }
}
