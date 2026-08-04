export class Price {

  constructor(
    public readonly value: number,
  ) {

    if (value < 0) {
      throw new Error("Price cannot be negative.");
    }

  }

  toNumber(): number {
    return this.value;
  }

}
