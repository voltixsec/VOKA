export class CurrencyCode {

  constructor(
    public readonly value: string,
  ) {

    const code = value.trim().toUpperCase();

    if (code.length !== 3) {
      throw new Error(
        "Currency code must contain exactly 3 characters.",
      );
    }

  }

  toString(): string {
    return this.value;
  }

}
