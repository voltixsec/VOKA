import { QuotationDomainError } from "../errors/QuotationDomainError";

const MAX_LENGTH = 50;

export class QuotationNumber {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value: string): QuotationNumber {
    const normalizedValue = value.trim().toUpperCase();

    if (!normalizedValue) {
      throw new QuotationDomainError("Quotation number is required.");
    }

    if (normalizedValue.length > MAX_LENGTH) {
      throw new QuotationDomainError(
        `Quotation number cannot exceed ${MAX_LENGTH} characters.`,
      );
    }

    return new QuotationNumber(normalizedValue);
  }

  equals(other: QuotationNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}