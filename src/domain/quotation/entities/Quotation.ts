import { QuotationDomainError } from "../errors/QuotationDomainError";
import {
  QuotationCalculator,
  type QuotationTotals,
} from "../services/QuotationCalculator";
import type { Discount } from "../types/DiscountType";
import type {
  CalculatedQuotationLine,
  QuotationLineInput,
} from "../types/QuotationLine";
import type { QuotationStatus } from "../types/QuotationStatus";
import {
  CustomerSnapshot,
  type CustomerSnapshotProps,
} from "../value-objects/CustomerSnapshot";
import { QuotationNumber } from "../value-objects/QuotationNumber";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export interface QuotationProps {
  id?: string;
  companyId: string;
  customerId: string;
  priceListId?: string | null;
  number: string;
  status?: QuotationStatus;
  issueDate?: Date;
  expiryDate?: Date | null;
  currencyCode?: string;
  customer: CustomerSnapshotProps;
  lines?: QuotationLineInput[];
  discount?: Discount | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  sentAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  cancelledAt?: Date | null;
}

export class Quotation {
  public readonly id?: string;
  public readonly companyId: string;
  public readonly customerId: string;
  public readonly priceListId: string | null;
  public readonly number: QuotationNumber;
  public readonly issueDate: Date;
  public readonly expiryDate: Date | null;
  public readonly currencyCode: string;
  public readonly customer: CustomerSnapshot;

  private _status: QuotationStatus;
  private _lines: CalculatedQuotationLine[];
  private _discount: Discount | null;
  private _totals: QuotationTotals;
  private _notes: string | null;
  private _termsAndConditions: string | null;
  private _sentAt: Date | null;
  private _approvedAt: Date | null;
  private _rejectedAt: Date | null;
  private _cancelledAt: Date | null;

  constructor(props: QuotationProps) {
    this.assertRequiredIdentifier(props.companyId, "Company id");
    this.assertRequiredIdentifier(props.customerId, "Customer id");

    const currencyCode = (props.currencyCode ?? "KWD")
      .trim()
      .toUpperCase();

    if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
      throw new QuotationDomainError(
        "Currency code must be a valid three-letter ISO-style code.",
      );
    }

    const issueDate = props.issueDate ?? new Date();
    const expiryDate = props.expiryDate ?? null;

    if (
      expiryDate &&
      expiryDate.getTime() < issueDate.getTime()
    ) {
      throw new QuotationDomainError(
        "Quotation expiry date cannot be before issue date.",
      );
    }

    this.id = props.id;
    this.companyId = props.companyId.trim();
    this.customerId = props.customerId.trim();
    this.priceListId = props.priceListId?.trim() || null;
    this.number = QuotationNumber.create(props.number);
    this.issueDate = issueDate;
    this.expiryDate = expiryDate;
    this.currencyCode = currencyCode;
    this.customer = new CustomerSnapshot(props.customer);

    this._status = props.status ?? "DRAFT";
    this._discount = props.discount ?? null;
    this._notes = props.notes?.trim() || null;
    this._termsAndConditions =
      props.termsAndConditions?.trim() || null;
    this._sentAt = props.sentAt ?? null;
    this._approvedAt = props.approvedAt ?? null;
    this._rejectedAt = props.rejectedAt ?? null;
    this._cancelledAt = props.cancelledAt ?? null;

    const initialLines = props.lines ?? [];

    if (initialLines.length === 0) {
      this._lines = [];
      this._totals = {
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      };
    } else {
      const calculated = QuotationCalculator.calculate(
        initialLines,
        this._discount,
      );

      this._lines = calculated.lines;
      this._totals = calculated.totals;
    }
  }

  get status(): QuotationStatus {
    return this._status;
  }

  get lines(): ReadonlyArray<CalculatedQuotationLine> {
    return this._lines;
  }

  get discount(): Discount | null {
    return this._discount;
  }

  get totals(): Readonly<QuotationTotals> {
    return this._totals;
  }

  get notes(): string | null {
    return this._notes;
  }

  get termsAndConditions(): string | null {
    return this._termsAndConditions;
  }

  get sentAt(): Date | null {
    return this._sentAt;
  }

  get approvedAt(): Date | null {
    return this._approvedAt;
  }

  get rejectedAt(): Date | null {
    return this._rejectedAt;
  }

  get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  replaceLines(lines: QuotationLineInput[]): void {
    this.assertDraft();

    const calculated = QuotationCalculator.calculate(
      lines,
      this._discount,
    );

    this._lines = calculated.lines;
    this._totals = calculated.totals;
  }

  setDiscount(discount: Discount | null): void {
    this.assertDraft();
    this._discount = discount;
    this.recalculate();
  }

  updateText(
    notes: string | null,
    termsAndConditions: string | null,
  ): void {
    this.assertDraft();
    this._notes = notes?.trim() || null;
    this._termsAndConditions =
      termsAndConditions?.trim() || null;
  }

  send(at: Date = new Date()): void {
    this.assertTransition(["DRAFT"], "SENT");

    if (this._lines.length === 0) {
      throw new QuotationDomainError(
        "Quotation cannot be sent without lines.",
      );
    }

    this._status = "SENT";
    this._sentAt = at;
  }

  approve(at: Date = new Date()): void {
    this.assertTransition(["SENT"], "APPROVED");
    this._status = "APPROVED";
    this._approvedAt = at;
  }

  reject(at: Date = new Date()): void {
    this.assertTransition(["SENT"], "REJECTED");
    this._status = "REJECTED";
    this._rejectedAt = at;
  }

  expire(): void {
    this.assertTransition(["DRAFT", "SENT"], "EXPIRED");
    this._status = "EXPIRED";
  }

  cancel(at: Date = new Date()): void {
    this.assertTransition(
      ["DRAFT", "SENT", "APPROVED"],
      "CANCELLED",
    );

    this._status = "CANCELLED";
    this._cancelledAt = at;
  }

  private recalculate(): void {
    if (this._lines.length === 0) {
      this._totals = {
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      };

      return;
    }

    const inputs: QuotationLineInput[] = this._lines.map((line) => ({
      id: line.id,
      catalogItemId: line.catalogItemId,
      taxRateId: line.taxRateId,
      position: line.position,
      type: line.type,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description,
      unitName: line.unitName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      taxPercentage: line.taxPercentage,
    }));

    const calculated = QuotationCalculator.calculate(
      inputs,
      this._discount,
    );

    this._lines = calculated.lines;
    this._totals = calculated.totals;
  }

  private assertDraft(): void {
    if (this._status !== "DRAFT") {
      throw new QuotationDomainError(
        "Only draft quotations can be modified.",
      );
    }
  }

  private assertTransition(
    allowedStatuses: QuotationStatus[],
    targetStatus: QuotationStatus,
  ): void {
    if (!allowedStatuses.includes(this._status)) {
      throw new QuotationDomainError(
        `Quotation cannot transition from ${this._status} to ${targetStatus}.`,
      );
    }
  }

  private assertRequiredIdentifier(
    value: string,
    label: string,
  ): void {
    if (!value.trim()) {
      throw new QuotationDomainError(`${label} is required.`);
    }
  }
}