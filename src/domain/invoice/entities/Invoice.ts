import { QuotationCalculator, type QuotationTotals } from "../../quotation/services/QuotationCalculator";
import type { CalculatedQuotationLine, QuotationLineInput } from "../../quotation/types/QuotationLine";
import type { Discount } from "../../quotation/types/DiscountType";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "VOID";
export type InvoiceSettlementStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER";
export type InvoiceActor = { userId?: string | null; name: string; role: string };

export class InvoiceDomainError extends Error {
  readonly name = "InvoiceDomainError";
}

export type InvoiceProps = {
  id?: string;
  companyId: string;
  number: string;
  status?: InvoiceStatus;
  settlementStatus?: InvoiceSettlementStatus;
  origin?: "DIRECT" | "QUOTATION" | "SALES_ORDER" | "CONTRACT";
  sourceKind?: string | null;
  sourceId?: string | null;
  sourceQuotationFamilyId?: string | null;
  sourceQuotationRevisionNumber?: number | null;
  customerId: string;
  priceListId?: string | null;
  currencyCode?: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  customer: { name: string; nameAr?: string | null; nameEn?: string | null; email?: string | null; phone?: string | null; taxNumber?: string | null; billingAddress?: string | null };
  lines: QuotationLineInput[];
  discount?: Discount | null;
  paidAmount?: number;
  notes?: string | null;
  termsAndConditions?: string | null;
  createdBy: InvoiceActor;
  issuedAt?: Date | null;
  issuedBy?: InvoiceActor | null;
  voidedAt?: Date | null;
  voidedBy?: InvoiceActor | null;
  voidReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const text = (value: string | null | undefined) => value?.trim() || null;
const required = (value: string, label: string) => {
  const normalized = value?.trim();
  if (!normalized) throw new InvoiceDomainError(`${label} is required.`);
  return normalized;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export class Invoice {
  readonly id?: string;
  readonly companyId: string;
  readonly number: string;
  readonly origin: "DIRECT" | "QUOTATION" | "SALES_ORDER" | "CONTRACT";
  readonly sourceKind: string | null;
  readonly sourceId: string | null;
  readonly sourceQuotationFamilyId: string | null;
  readonly sourceQuotationRevisionNumber: number | null;
  readonly customerId: string;
  readonly priceListId: string | null;
  readonly currencyCode: string;
  readonly invoiceDate: Date;
  readonly dueDate: Date | null;
  readonly customer: Readonly<InvoiceProps["customer"]>;
  readonly lines: ReadonlyArray<CalculatedQuotationLine>;
  readonly discount: Discount | null;
  readonly totals: Readonly<QuotationTotals>;
  readonly paidAmount: number;
  readonly outstandingAmount: number;
  readonly settlementStatus: InvoiceSettlementStatus;
  readonly notes: string | null;
  readonly termsAndConditions: string | null;
  readonly createdBy: Readonly<InvoiceActor>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  private _status: InvoiceStatus;
  private _issuedAt: Date | null;
  private _issuedBy: InvoiceActor | null;
  private _voidedAt: Date | null;
  private _voidedBy: InvoiceActor | null;
  private _voidReason: string | null;

  constructor(props: InvoiceProps) {
    this.id = text(props.id) ?? undefined;
    this.companyId = required(props.companyId, "Company id");
    this.number = required(props.number, "Invoice number");
    this.customerId = required(props.customerId, "Customer id");
    this.priceListId = text(props.priceListId);
    this.currencyCode = required(props.currencyCode ?? "KWD", "Currency code").toUpperCase();
    if (!/^[A-Z]{3}$/.test(this.currencyCode)) throw new InvoiceDomainError("Currency code is invalid.");
    this.invoiceDate = props.invoiceDate ?? new Date();
    this.dueDate = props.dueDate ?? null;
    if (Number.isNaN(this.invoiceDate.getTime()) || (this.dueDate && Number.isNaN(this.dueDate.getTime()))) throw new InvoiceDomainError("Invoice dates are invalid.");
    if (this.dueDate && this.dueDate < this.invoiceDate) throw new InvoiceDomainError("Invoice due date cannot precede invoice date.");
    this.origin = props.origin ?? "DIRECT";
    this.sourceKind = text(props.sourceKind);
    this.sourceId = text(props.sourceId);
    if (this.origin !== "DIRECT" && (!this.sourceKind || !this.sourceId)) throw new InvoiceDomainError("Upstream invoice provenance is incomplete.");
    this.sourceQuotationFamilyId = text(props.sourceQuotationFamilyId);
    this.sourceQuotationRevisionNumber = props.sourceQuotationRevisionNumber ?? null;
    if (this.sourceQuotationRevisionNumber !== null && (!Number.isSafeInteger(this.sourceQuotationRevisionNumber) || this.sourceQuotationRevisionNumber < 0)) throw new InvoiceDomainError("Source quotation revision is invalid.");
    this.customer = Object.freeze({ ...props.customer, name: required(props.customer.name, "Customer name") });
    if (!props.lines.length) throw new InvoiceDomainError("Invoice requires at least one line.");
    this.discount = props.discount ?? null;
    const calculated = QuotationCalculator.calculate(props.lines, this.discount);
    this.lines = Object.freeze(calculated.lines);
    this.totals = Object.freeze(calculated.totals);
    this.paidAmount = money(props.paidAmount ?? 0);
    if (this.paidAmount < 0 || this.paidAmount > this.totals.totalAmount) throw new InvoiceDomainError("Paid amount is outside invoice total.");
    this.outstandingAmount = money(this.totals.totalAmount - this.paidAmount);
    this.settlementStatus = this.paidAmount === 0 ? "UNPAID" : this.outstandingAmount === 0 ? "PAID" : "PARTIALLY_PAID";
    if (props.settlementStatus && props.settlementStatus !== this.settlementStatus) throw new InvoiceDomainError("Stored settlement state does not match authoritative amounts.");
    this.notes = text(props.notes);
    this.termsAndConditions = text(props.termsAndConditions);
    this.createdBy = Object.freeze({ ...props.createdBy, name: required(props.createdBy.name, "Creator name"), role: required(props.createdBy.role, "Creator role") });
    this._status = props.status ?? "DRAFT";
    this._issuedAt = props.issuedAt ?? null;
    this._issuedBy = props.issuedBy ?? null;
    this._voidedAt = props.voidedAt ?? null;
    this._voidedBy = props.voidedBy ?? null;
    this._voidReason = text(props.voidReason);
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static restore(props: InvoiceProps) { return new Invoice(props); }
  get status() { return this._status; }
  get issuedAt() { return this._issuedAt; }
  get issuedBy() { return this._issuedBy ? { ...this._issuedBy } : null; }
  get voidedAt() { return this._voidedAt; }
  get voidedBy() { return this._voidedBy ? { ...this._voidedBy } : null; }
  get voidReason() { return this._voidReason; }

  issue(actor: InvoiceActor, at = new Date()) {
    if (this._status !== "DRAFT") throw new InvoiceDomainError("Only draft invoices can be issued.");
    this._status = "ISSUED";
    this._issuedAt = at;
    this._issuedBy = { userId: actor.userId ?? null, name: required(actor.name, "Issuer name"), role: required(actor.role, "Issuer role") };
  }

  void(actor: InvoiceActor, reason: string, at = new Date()) {
    if (this._status !== "ISSUED") throw new InvoiceDomainError("Only issued invoices can be voided.");
    if (this.paidAmount > 0) throw new InvoiceDomainError("An invoice with payments cannot be voided; reconciliation is required.");
    this._status = "VOID";
    this._voidedAt = at;
    this._voidedBy = { userId: actor.userId ?? null, name: required(actor.name, "Voiding actor name"), role: required(actor.role, "Voiding actor role") };
    this._voidReason = required(reason, "Void reason");
  }
}
