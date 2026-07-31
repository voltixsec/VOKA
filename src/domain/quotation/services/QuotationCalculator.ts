import { QuotationDomainError } from "../errors/QuotationDomainError";
import type { Discount } from "../types/DiscountType";
import type {
  CalculatedQuotationLine,
  QuotationLineInput,
} from "../types/QuotationLine";

const DECIMAL_FACTOR = 1000;

export interface QuotationTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface CalculatedQuotation {
  lines: CalculatedQuotationLine[];
  totals: QuotationTotals;
}

export class QuotationCalculator {
  static calculateLine(line: QuotationLineInput): CalculatedQuotationLine {
    this.validateLine(line);

    const subtotal = this.round(line.quantity * line.unitPrice);
    const discountAmount = this.calculateDiscount(
      subtotal,
      line.discount ?? null,
    );

    const taxableAmount = this.round(subtotal - discountAmount);
    const taxPercentage = line.taxPercentage ?? 0;
    const taxAmount = this.round(
      taxableAmount * (taxPercentage / 100),
    );

    return {
      ...line,
      itemName: line.itemName.trim(),
      taxPercentage,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount: this.round(taxableAmount + taxAmount),
    };
  }

  static calculate(
    lines: QuotationLineInput[],
    documentDiscount: Discount | null = null,
  ): CalculatedQuotation {
    if (lines.length === 0) {
      throw new QuotationDomainError(
        "Quotation must contain at least one line.",
      );
    }

    this.validateUniquePositions(lines);

    const calculatedLines = lines
      .map((line) => this.calculateLine(line))
      .sort((left, right) => left.position - right.position);

    const subtotal = this.round(
      calculatedLines.reduce(
        (sum, line) => sum + line.subtotal - line.discountAmount,
        0,
      ),
    );

    const discountAmount = this.calculateDiscount(
      subtotal,
      documentDiscount,
    );

    const taxBeforeDocumentDiscount = this.round(
      calculatedLines.reduce(
        (sum, line) => sum + line.taxAmount,
        0,
      ),
    );

    const taxRatio =
      subtotal > 0
        ? this.round(taxBeforeDocumentDiscount / subtotal)
        : 0;

    const taxAmount = this.round(
      taxBeforeDocumentDiscount - discountAmount * taxRatio,
    );

    const totalAmount = this.round(
      subtotal - discountAmount + taxAmount,
    );

    return {
      lines: calculatedLines,
      totals: {
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
      },
    };
  }

  private static calculateDiscount(
    baseAmount: number,
    discount: Discount | null,
  ): number {
    if (!discount) {
      return 0;
    }

    if (!Number.isFinite(discount.value) || discount.value < 0) {
      throw new QuotationDomainError(
        "Discount value must be a non-negative finite number.",
      );
    }

    if (discount.type === "PERCENTAGE") {
      if (discount.value > 100) {
        throw new QuotationDomainError(
          "Percentage discount cannot exceed 100.",
        );
      }

      return this.round(baseAmount * (discount.value / 100));
    }

    if (discount.type !== "FIXED") {
      throw new QuotationDomainError("Unsupported discount type.");
    }

    if (discount.value > baseAmount) {
      throw new QuotationDomainError(
        "Fixed discount cannot exceed the base amount.",
      );
    }

    return this.round(discount.value);
  }

  private static validateLine(line: QuotationLineInput): void {
    if (!Number.isInteger(line.position) || line.position < 1) {
      throw new QuotationDomainError(
        "Quotation line position must be a positive integer.",
      );
    }

    if (!line.itemName.trim()) {
      throw new QuotationDomainError(
        "Quotation line item name is required.",
      );
    }

    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new QuotationDomainError(
        "Quotation line quantity must be greater than zero.",
      );
    }

    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new QuotationDomainError(
        "Quotation line unit price cannot be negative.",
      );
    }

    const taxPercentage = line.taxPercentage ?? 0;

    if (
      !Number.isFinite(taxPercentage) ||
      taxPercentage < 0 ||
      taxPercentage > 100
    ) {
      throw new QuotationDomainError(
        "Tax percentage must be between 0 and 100.",
      );
    }
  }

  private static validateUniquePositions(
    lines: QuotationLineInput[],
  ): void {
    const positions = new Set<number>();

    for (const line of lines) {
      if (positions.has(line.position)) {
        throw new QuotationDomainError(
          `Duplicate quotation line position: ${line.position}.`,
        );
      }

      positions.add(line.position);
    }
  }

  private static round(value: number): number {
    return Math.round((value + Number.EPSILON) * DECIMAL_FACTOR) /
      DECIMAL_FACTOR;
  }
}