import { QuotationDomainError } from "../errors/QuotationDomainError";
import type { Quotation } from "../entities/Quotation";

export type QuotationReadinessIssue = "CUSTOMER_REQUIRED" | "LINE_REQUIRED" | "PRODUCT_SELECTION_REQUIRED" | "QUANTITY_REQUIRED" | "PRICE_REQUIRED";

export class QuotationFinalizationValidator {
  static inspect(quotation: Quotation): QuotationReadinessIssue[] {
    const issues = new Set<QuotationReadinessIssue>();
    if (!quotation.customerIdOrNull || !quotation.customerOrNull) issues.add("CUSTOMER_REQUIRED");
    if (!quotation.lines.length) issues.add("LINE_REQUIRED");
    for (const line of quotation.lines) {
      if (line.productSelectionStatus === "PENDING") issues.add("PRODUCT_SELECTION_REQUIRED");
      if (line.quantity === null) issues.add("QUANTITY_REQUIRED");
      if (line.unitPrice === null) issues.add("PRICE_REQUIRED");
    }
    return [...issues];
  }

  static assertFinalizable(quotation: Quotation): void {
    const issues = this.inspect(quotation);
    if (issues.length) throw new QuotationDomainError(`Quotation is incomplete: ${issues.join(", ")}.`);
  }
}
