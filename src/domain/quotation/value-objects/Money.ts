import { QuotationDomainError } from "../errors/QuotationDomainError";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_SCALE = 3;
const DECIMAL_FACTOR = 10 ** DECIMAL_SCALE;

export interface MoneyProps {
  amount: number;
  currencyCode: string;
}

export class Money {
  public readonly amount: number;
  public readonly currencyCode: string;

  private constructor(props: MoneyProps) {
    this.amount = Money.round(props.amount);
    this.currencyCode = props.currencyCode;
  }

  static create(amount: number, currencyCode: string): Money {
    if (!Number.isFinite(amount)) {
      throw new QuotationDomainError("Money amount must be a finite number.");
    }

    const normalizedCurrencyCode = currencyCode.trim().toUpperCase();

    if (!CURRENCY_CODE_PATTERN.test(normalizedCurrencyCode)) {
      throw new QuotationDomainError(
        "Currency code must be a valid three-letter ISO-style code.",
      );
    }

    return new Money({
      amount,
      currencyCode: normalizedCurrencyCode,
    });
  }

  static zero(currencyCode: string): Money {
    return Money.create(0, currencyCode);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.create(
      this.amount + other.amount,
      this.currencyCode,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.create(
      this.amount - other.amount,
      this.currencyCode,
    );
  }

  multiply(multiplier: number): Money {
    if (!Number.isFinite(multiplier)) {
      throw new QuotationDomainError(
        "Money multiplier must be a finite number.",
      );
    }

    return Money.create(
      this.amount * multiplier,
      this.currencyCode,
    );
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  equals(other: Money): boolean {
    return (
      this.currencyCode === other.currencyCode &&
      this.amount === other.amount
    );
  }

  toJSON(): MoneyProps {
    return {
      amount: this.amount,
      currencyCode: this.currencyCode,
    };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyCode !== other.currencyCode) {
      throw new QuotationDomainError(
        `Currency mismatch: ${this.currencyCode} and ${other.currencyCode}.`,
      );
    }
  }

  private static round(value: number): number {
    return Math.round((value + Number.EPSILON) * DECIMAL_FACTOR) /
      DECIMAL_FACTOR;
  }
}