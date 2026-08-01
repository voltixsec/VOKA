export class PriceListCode {

  constructor(
    private readonly value: string,
  ) {

    if (!value.trim()) {
      throw new Error(
        "Price list code is required.",
      );
    }

  }

  toString(): string {
    return this.value;
  }

}
