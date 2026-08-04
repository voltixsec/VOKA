export class CustomerName {

  private constructor(
    private readonly value: string,
  ) {}

  static create(
    value: string,
  ): CustomerName {

    const normalized = value.trim();

    if (normalized.length < 2) {
      throw new Error("Customer name is too short.");
    }

    if (normalized.length > 200) {
      throw new Error("Customer name is too long.");
    }

    return new CustomerName(normalized);

  }

  toString(): string {
    return this.value;
  }

}
