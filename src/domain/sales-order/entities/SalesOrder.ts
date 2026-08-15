import type {
  DiscountType,
  QuotationLineType,
  QuotationScopeType,
} from "../../quotation";
import { SalesOrderDomainError } from "../errors/SalesOrderDomainError";
import type { SalesOrderStatus } from "../types/SalesOrderStatus";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export type SalesOrderCustomerSnapshot = {
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
};

export type SalesOrderLineSnapshot = {
  id?: string;
  sourceQuotationLineId: string;
  catalogItemId?: string | null;
  taxRateId?: string | null;
  position: number;
  type: QuotationLineType;
  itemCode?: string | null;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unitName?: string | null;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  discountType?: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  subtotal: number;
  totalAmount: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type SalesOrderActor = {
  userId?: string | null;
  name: string;
  role: string;
};

export type SalesOrderProps = {
  id?: string;
  companyId: string;
  sourceQuotationId: string;
  sourceQuotationNumber: string;
  number: string;
  status?: SalesOrderStatus;
  customerId: string;
  priceListId?: string | null;
  currencyCode: string;
  orderDate: Date;
  customer: SalesOrderCustomerSnapshot;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  projectName?: string | null;
  projectNameAr?: string | null;
  projectNameEn?: string | null;
  attentionName?: string | null;
  attentionNameAr?: string | null;
  attentionNameEn?: string | null;
  scopeType?: QuotationScopeType | null;
  discountType?: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  sourceApprovedAt: Date;
  sourceApprovedByName: string;
  sourceApprovedByRole: string;
  createdByUserId: string | null;
  createdByName: string;
  createdByRole: string;
  confirmedAt?: Date | null;
  confirmedByUserId?: string | null;
  confirmedByName?: string | null;
  confirmedByRole?: string | null;
  cancelledAt?: Date | null;
  cancelledByUserId?: string | null;
  cancelledByName?: string | null;
  cancelledByRole?: string | null;
  cancellationReason?: string | null;
  lines: SalesOrderLineSnapshot[];
  createdAt?: Date;
  updatedAt?: Date;
};

export class SalesOrder {
  public readonly id?: string;
  public readonly companyId: string;
  public readonly sourceQuotationId: string;
  public readonly sourceQuotationNumber: string;
  public readonly number: string;
  public readonly customerId: string;
  public readonly priceListId: string | null;
  public readonly currencyCode: string;
  public readonly orderDate: Date;
  public readonly customer: Readonly<SalesOrderCustomerSnapshot>;
  public readonly subjectAr: string | null;
  public readonly subjectEn: string | null;
  public readonly briefAr: string | null;
  public readonly briefEn: string | null;
  public readonly projectName: string | null;
  public readonly projectNameAr: string | null;
  public readonly projectNameEn: string | null;
  public readonly attentionName: string | null;
  public readonly attentionNameAr: string | null;
  public readonly attentionNameEn: string | null;
  public readonly scopeType: QuotationScopeType | null;
  public readonly discountType: DiscountType | null;
  public readonly discountValue: number;
  public readonly discountAmount: number;
  public readonly subtotal: number;
  public readonly taxAmount: number;
  public readonly totalAmount: number;
  public readonly notes: string | null;
  public readonly notesAr: string | null;
  public readonly notesEn: string | null;
  public readonly termsAndConditions: string | null;
  public readonly termsAndConditionsAr: string | null;
  public readonly termsAndConditionsEn: string | null;
  public readonly sourceApprovedAt: Date;
  public readonly sourceApprovedByName: string;
  public readonly sourceApprovedByRole: string;
  public readonly createdByUserId: string | null;
  public readonly createdByName: string;
  public readonly createdByRole: string;
  public readonly lines: ReadonlyArray<Readonly<SalesOrderLineSnapshot>>;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  private _status: SalesOrderStatus;
  private _confirmedAt: Date | null;
  private _confirmedByUserId: string | null;
  private _confirmedByName: string | null;
  private _confirmedByRole: string | null;
  private _cancelledAt: Date | null;
  private _cancelledByUserId: string | null;
  private _cancelledByName: string | null;
  private _cancelledByRole: string | null;
  private _cancellationReason: string | null;

  constructor(props: SalesOrderProps) {
    this.id = normalizeOptional(props.id) ?? undefined;
    this.companyId = required(props.companyId, "Company id");
    this.sourceQuotationId = required(
      props.sourceQuotationId,
      "Source quotation id",
    );
    this.sourceQuotationNumber = required(
      props.sourceQuotationNumber,
      "Source quotation number",
    );
    this.number = required(props.number, "Sales Order number");
    this._status = props.status ?? "DRAFT";
    this.customerId = required(props.customerId, "Customer id");
    this.priceListId = normalizeOptional(props.priceListId);
    this.currencyCode = required(props.currencyCode, "Currency code")
      .toUpperCase();
    this.orderDate = validDate(props.orderDate, "Order date");

    if (!CURRENCY_CODE_PATTERN.test(this.currencyCode)) {
      throw new SalesOrderDomainError(
        "Currency code must be a valid three-letter ISO-style code.",
      );
    }

    this._confirmedAt = props.confirmedAt ?? null;
    this._confirmedByUserId = normalizeOptional(props.confirmedByUserId);
    this._confirmedByName = normalizeOptional(props.confirmedByName);
    this._confirmedByRole = normalizeOptional(props.confirmedByRole);

    this._cancelledAt = props.cancelledAt ?? null;
    this._cancelledByUserId = normalizeOptional(props.cancelledByUserId);
    this._cancelledByName = normalizeOptional(props.cancelledByName);
    this._cancelledByRole = normalizeOptional(props.cancelledByRole);
    this._cancellationReason = normalizeOptional(props.cancellationReason);

    if (this._status === "CONFIRMED") {
      validDate(this._confirmedAt ?? undefined!, "Confirmation date");
      required(this._confirmedByName ?? "", "Confirming actor name");
      required(this._confirmedByRole ?? "", "Confirming actor role");
    } else if (this._status === "CANCELLED") {
      validDate(this._cancelledAt ?? undefined!, "Cancellation date");
      required(this._cancelledByName ?? "", "Cancelling actor name");
      required(this._cancelledByRole ?? "", "Cancelling actor role");
      required(this._cancellationReason ?? "", "Cancellation reason");
    } else if (this._status !== "DRAFT") {
      throw new SalesOrderDomainError("Invalid Sales Order status.");
    }

    this.customer = Object.freeze({
      name: required(props.customer.name, "Customer name"),
      nameAr: normalizeOptional(props.customer.nameAr),
      nameEn: normalizeOptional(props.customer.nameEn),
      email: normalizeOptional(props.customer.email),
      phone: normalizeOptional(props.customer.phone),
      taxNumber: normalizeOptional(props.customer.taxNumber),
      billingAddress: normalizeOptional(props.customer.billingAddress),
    });
    this.subjectAr = normalizeOptional(props.subjectAr);
    this.subjectEn = normalizeOptional(props.subjectEn);
    this.briefAr = normalizeOptional(props.briefAr);
    this.briefEn = normalizeOptional(props.briefEn);
    this.projectName = normalizeOptional(props.projectName);
    this.projectNameAr = normalizeOptional(props.projectNameAr);
    this.projectNameEn = normalizeOptional(props.projectNameEn);
    this.attentionName = normalizeOptional(props.attentionName);
    this.attentionNameAr = normalizeOptional(props.attentionNameAr);
    this.attentionNameEn = normalizeOptional(props.attentionNameEn);
    this.scopeType = props.scopeType ?? null;
    this.discountType = props.discountType ?? null;
    this.discountValue = commercial(props.discountValue, "Discount value");
    this.discountAmount = commercial(props.discountAmount, "Discount amount");
    this.subtotal = commercial(props.subtotal, "Subtotal");
    this.taxAmount = commercial(props.taxAmount, "Tax amount");
    this.totalAmount = commercial(props.totalAmount, "Total amount");
    this.notes = normalizeOptional(props.notes);
    this.notesAr = normalizeOptional(props.notesAr);
    this.notesEn = normalizeOptional(props.notesEn);
    this.termsAndConditions = normalizeOptional(props.termsAndConditions);
    this.termsAndConditionsAr = normalizeOptional(
      props.termsAndConditionsAr,
    );
    this.termsAndConditionsEn = normalizeOptional(
      props.termsAndConditionsEn,
    );
    this.sourceApprovedAt = validDate(
      props.sourceApprovedAt,
      "Source approval date",
    );
    this.sourceApprovedByName = required(
      props.sourceApprovedByName,
      "Source approver name",
    );
    this.sourceApprovedByRole = required(
      props.sourceApprovedByRole,
      "Source approver role",
    );
    this.createdByUserId = normalizeOptional(props.createdByUserId);
    this.createdByName = required(props.createdByName, "Creator name");
    this.createdByRole = required(props.createdByRole, "Creator role");
    this.lines = Object.freeze(normalizeLines(props.lines));
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static restore(props: SalesOrderProps): SalesOrder {
    if (!props.id?.trim()) {
      throw new SalesOrderDomainError(
        "Sales Order id is required when restoring from persistence.",
      );
    }

    return new SalesOrder(props);
  }

  get status(): SalesOrderStatus {
    return this._status;
  }

  get confirmedAt(): Date | null {
    return this._confirmedAt;
  }

  get confirmedByUserId(): string | null {
    return this._confirmedByUserId;
  }

  get confirmedByName(): string | null {
    return this._confirmedByName;
  }

  get confirmedByRole(): string | null {
    return this._confirmedByRole;
  }

  get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  get cancelledByUserId(): string | null {
    return this._cancelledByUserId;
  }

  get cancelledByName(): string | null {
    return this._cancelledByName;
  }

  get cancelledByRole(): string | null {
    return this._cancelledByRole;
  }

  get cancellationReason(): string | null {
    return this._cancellationReason;
  }

  confirm(actor: SalesOrderActor, at: Date = new Date()): void {
    if (this._status !== "DRAFT") {
      throw new SalesOrderDomainError(
        `Sales Order cannot transition from ${this._status} to CONFIRMED.`,
      );
    }

    const name = required(actor.name, "Confirming actor name");
    const role = required(actor.role, "Confirming actor role");
    const confirmedAt = validDate(at, "Confirmation date");

    this._status = "CONFIRMED";
    this._confirmedAt = confirmedAt;
    this._confirmedByUserId = normalizeOptional(actor.userId);
    this._confirmedByName = name;
    this._confirmedByRole = role;
  }

  cancel(actor: SalesOrderActor, reason: string, at: Date = new Date()): void {
    if (this._status === "CANCELLED") {
      throw new SalesOrderDomainError("Sales Order is already cancelled.");
    }
    if (this._status !== "DRAFT" && this._status !== "CONFIRMED") {
      throw new SalesOrderDomainError(
        `Sales Order cannot transition from ${this._status} to CANCELLED.`,
      );
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new SalesOrderDomainError("Cancellation reason is required.");
    }

    const name = required(actor.name, "Cancelling actor name");
    const role = required(actor.role, "Cancelling actor role");
    const cancelledAt = validDate(at, "Cancellation date");

    this._status = "CANCELLED";
    this._cancelledAt = cancelledAt;
    this._cancelledByUserId = normalizeOptional(actor.userId);
    this._cancelledByName = name;
    this._cancelledByRole = role;
    this._cancellationReason = trimmedReason;
  }
}

function normalizeLines(
  lines: SalesOrderLineSnapshot[],
): Readonly<SalesOrderLineSnapshot>[] {
  if (lines.length === 0) {
    throw new SalesOrderDomainError(
      "A Sales Order requires at least one line.",
    );
  }

  const ordered = [...lines].sort((left, right) =>
    left.position - right.position,
  );

  return ordered.map((line, index) => {
    if (line.position !== index + 1) {
      throw new SalesOrderDomainError(
        "Sales Order line positions must be contiguous from 1.",
      );
    }

    return Object.freeze({
      ...line,
      id: normalizeOptional(line.id) ?? undefined,
      sourceQuotationLineId: required(
        line.sourceQuotationLineId,
        "Source quotation line id",
      ),
      catalogItemId: normalizeOptional(line.catalogItemId),
      taxRateId: normalizeOptional(line.taxRateId),
      itemCode: normalizeOptional(line.itemCode),
      itemName: required(line.itemName, "Line item name"),
      itemNameAr: normalizeOptional(line.itemNameAr),
      itemNameEn: normalizeOptional(line.itemNameEn),
      description: normalizeOptional(line.description),
      descriptionAr: normalizeOptional(line.descriptionAr),
      descriptionEn: normalizeOptional(line.descriptionEn),
      unitName: normalizeOptional(line.unitName),
      unitNameAr: normalizeOptional(line.unitNameAr),
      unitNameEn: normalizeOptional(line.unitNameEn),
      quantity: positive(line.quantity, "Line quantity"),
      unitPrice: commercial(line.unitPrice, "Line unit price"),
      discountValue: commercial(line.discountValue, "Line discount value"),
      discountAmount: commercial(line.discountAmount, "Line discount amount"),
      taxPercentage: commercial(line.taxPercentage, "Line tax percentage"),
      taxAmount: commercial(line.taxAmount, "Line tax amount"),
      subtotal: commercial(line.subtotal, "Line subtotal"),
      totalAmount: commercial(line.totalAmount, "Line total amount"),
    });
  });
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new SalesOrderDomainError(`${label} is required.`);
  }
  return normalized;
}

function normalizeOptional(
  value: string | null | undefined,
): string | null {
  return value?.trim() || null;
}

function commercial(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new SalesOrderDomainError(`${label} must be a non-negative number.`);
  }
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SalesOrderDomainError(`${label} must be greater than zero.`);
  }
  return value;
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new SalesOrderDomainError(`${label} is invalid.`);
  }
  return value;
}
