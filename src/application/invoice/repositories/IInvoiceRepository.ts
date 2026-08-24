import type { Invoice, InvoiceActor, PaymentMethod } from "../../../domain/invoice";
import type { Discount, QuotationLineInput } from "../../../domain/quotation";

export type InvoiceLineRequest = QuotationLineInput;
export type CreateInvoiceRequest = {
  companyId: string;
  requestKey: string;
  customerId?: string;
  priceListId?: string | null;
  currencyCode?: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  lines?: InvoiceLineRequest[];
  discount?: Discount | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  sourceKind?: "QUOTATION" | "SALES_ORDER";
  sourceId?: string;
  actor: InvoiceActor;
};

export type InvoiceListResult = { invoices: Invoice[]; total: number };
export type PaymentRecord = {
  id: string; invoiceId: string; amount: number; currencyCode: string;
  method: PaymentMethod; receivedAt: Date; reference: string | null;
  notes: string | null; recordedByName: string; recordedByRole: string; createdAt: Date;
};
export type RecordPaymentRequest = {
  companyId: string; invoiceId: string; requestKey: string; amount: number;
  method: PaymentMethod; receivedAt: Date; reference?: string | null;
  notes?: string | null; actor: InvoiceActor;
};

export interface IInvoiceRepository {
  create(request: CreateInvoiceRequest): Promise<Invoice>;
  findById(companyId: string, invoiceId: string): Promise<Invoice | null>;
  list(input: { companyId: string; customerId?: string; status?: string; settlementStatus?: string; search?: string; skip: number; take: number }): Promise<InvoiceListResult>;
  issue(companyId: string, invoiceId: string, actor: InvoiceActor): Promise<Invoice | null>;
  void(companyId: string, invoiceId: string, actor: InvoiceActor, reason: string): Promise<Invoice | null>;
  recordPayment(request: RecordPaymentRequest): Promise<{ invoice: Invoice; payment: PaymentRecord; created: boolean }>;
  listPayments(companyId: string, invoiceId: string, skip: number, take: number): Promise<{ payments: PaymentRecord[]; total: number } | null>;
}
