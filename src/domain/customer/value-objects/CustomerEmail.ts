export class CustomerEmail {

  private constructor(
    private readonly value: string,
  ) {}

  static create(
    value: string,
  ): CustomerEmail {

    const normalized = value.trim().toLowerCase();

    const regex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!regex.test(normalized)) {
      throw new Error("Invalid customer email.");
    }

    return new CustomerEmail(normalized);

  }

  toString(): string {

    return this.value;

  }

}
