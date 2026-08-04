import { randomUUID } from "crypto";

export class CustomerId {

  private constructor(
    private readonly value: string,
  ) {}

  static create(
    value?: string,
  ): CustomerId {

    return new CustomerId(value ?? randomUUID());

  }

  toString(): string {

    return this.value;

  }

}
