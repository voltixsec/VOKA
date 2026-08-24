import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../../../../../lib/generated/prisma/client";
import type {
  CreateInvoiceRequest, IInvoiceRepository, InvoiceListResult,
  PaymentRecord, RecordPaymentRequest,
} from "../../../../application/invoice";
import { Invoice, InvoiceDomainError, type InvoiceActor } from "../../../../domain/invoice";
import type { Discount, QuotationLineInput } from "../../../../domain/quotation";

const money = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const stable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]),
  );
  return value;
};
const requestFingerprint = (request: CreateInvoiceRequest) => createHash("sha256")
  .update(JSON.stringify(stable({ ...request, actor: undefined })))
  .digest("hex");
const actorData = (actor: InvoiceActor) => ({
  userId: actor.userId?.trim() || null,
  name: actor.name.trim(),
  role: actor.role.trim(),
});

export class PrismaInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly db: PrismaClient) {}

  private include() {
    return { lines: { orderBy: { position: "asc" as const } } };
  }

  private toDomain(record: any): Invoice {
    return Invoice.restore({
      id: record.id, companyId: record.companyId, number: record.number,
      status: record.status, settlementStatus: record.settlementStatus,
      origin: record.origin, sourceKind: record.sourceKind, sourceId: record.sourceId,
      sourceQuotationFamilyId: record.sourceQuotationFamilyId,
      sourceQuotationRevisionNumber: record.sourceQuotationRevisionNumber,
      customerId: record.customerId, priceListId: record.priceListId,
      currencyCode: record.currencyCode, invoiceDate: record.invoiceDate, dueDate: record.dueDate,
      customer: {
        name: record.customerName, nameAr: record.customerNameAr, nameEn: record.customerNameEn,
        email: record.customerEmail, phone: record.customerPhone,
        taxNumber: record.customerTaxNo, billingAddress: record.billingAddress,
      },
      lines: record.lines.map((line: any) => ({
        id: line.id, sourceLineId: line.sourceLineId, catalogItemId: line.catalogItemId,
        taxRateId: line.taxRateId, position: line.position, type: line.type,
        itemCode: line.itemCode, itemName: line.itemName, itemNameAr: line.itemNameAr,
        itemNameEn: line.itemNameEn, description: line.description, unitName: line.unitName,
        quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
        discount: line.discountType ? { type: line.discountType, value: Number(line.discountValue) } : null,
        taxPercentage: Number(line.taxPercentage),
      })),
      discount: record.discountType ? { type: record.discountType, value: Number(record.discountValue) } : null,
      paidAmount: Number(record.paidAmount), notes: record.notes,
      termsAndConditions: record.termsAndConditions,
      createdBy: { userId: record.createdByUserId, name: record.createdByName, role: record.createdByRole },
      issuedAt: record.issuedAt,
      issuedBy: record.issuedByName ? { userId: record.issuedByUserId, name: record.issuedByName, role: record.issuedByRole } : null,
      voidedAt: record.voidedAt,
      voidedBy: record.voidedByName ? { userId: record.voidedByUserId, name: record.voidedByName, role: record.voidedByRole } : null,
      voidReason: record.voidReason, createdAt: record.createdAt, updatedAt: record.updatedAt,
    });
  }

  private async nextNumber(tx: any, companyId: string, date: Date) {
    const yearMonth = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const sequence = await tx.invoiceNumberSequence.upsert({
      where: { companyId_yearMonth: { companyId, yearMonth } },
      create: { companyId, yearMonth, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    return `INV-${yearMonth}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
  }

  private async directSnapshot(tx: any, request: CreateInvoiceRequest) {
    if (!request.customerId?.trim() || !request.lines?.length) throw new InvoiceDomainError("Direct invoice requires customer and lines.");
    const customer = await tx.customer.findFirst({ where: { id: request.customerId, companyId: request.companyId, isDeleted: false } });
    if (!customer) throw new InvoiceDomainError("Customer not found.");
    const currencyCode = request.currencyCode?.trim().toUpperCase() || "KWD";
    if (request.priceListId) {
      const priceList = await tx.priceList.findFirst({ where: { id: request.priceListId, companyId: request.companyId, currencyCode, isActive: true }, select: { id: true } });
      if (!priceList) throw new InvoiceDomainError("Price list is unavailable for this tenant and currency.");
    }
    const lines: QuotationLineInput[] = [];
    for (const requested of request.lines) {
      if (requested.catalogItemId) {
        const item = await tx.catalogItem.findFirst({
          where: { id: requested.catalogItemId, companyId: request.companyId, isActive: true },
          include: { unit: true },
        });
        if (!item) throw new InvoiceDomainError("Catalog item not found.");
        const taxRateId = requested.taxRateId ?? item.taxRateId;
        const tax = taxRateId ? await tx.taxRate.findFirst({
          where: { id: taxRateId, isActive: true, OR: [{ companyId: request.companyId }, { companyId: null, isSystem: true }] },
        }) : null;
        if (taxRateId && !tax) throw new InvoiceDomainError("Tax rate not found.");
        const listed = request.priceListId ? await tx.priceListItem.findFirst({ where: { priceListId: request.priceListId, catalogItemId: item.id } }) : null;
        lines.push({
          position: requested.position, type: item.type, catalogItemId: item.id, taxRateId,
          itemCode: item.code, itemName: item.name, itemNameAr: item.nameAr, itemNameEn: item.nameEn,
          description: requested.description ?? item.description,
          unitName: item.unit?.name ?? null, quantity: requested.quantity,
          unitPrice: Number(listed?.price ?? item.salePrice), discount: requested.discount,
          taxPercentage: Number(tax?.percentage ?? 0),
        });
      } else {
        let taxPercentage = 0;
        if (requested.taxRateId) {
          const tax = await tx.taxRate.findFirst({ where: { id: requested.taxRateId, isActive: true, OR: [{ companyId: request.companyId }, { companyId: null, isSystem: true }] } });
          if (!tax) throw new InvoiceDomainError("Tax rate not found.");
          taxPercentage = Number(tax.percentage);
        }
        lines.push({ ...requested, catalogItemId: null, taxPercentage });
      }
    }
    return {
      origin: "DIRECT" as const, sourceKind: null, sourceId: null,
      sourceQuotationFamilyId: null, sourceQuotationRevisionNumber: null,
      customerId: customer.id, priceListId: request.priceListId ?? null, currencyCode,
      customer: { name: customer.name, nameAr: customer.nameAr, nameEn: customer.nameEn, email: customer.email, phone: customer.phone, taxNumber: customer.taxNumber, billingAddress: customer.addressLine1 },
      lines, discount: request.discount ?? null,
    };
  }

  private async sourceSnapshot(tx: any, request: CreateInvoiceRequest) {
    if (!request.sourceKind || !request.sourceId) return this.directSnapshot(tx, request);
    const base = { id: request.sourceId, companyId: request.companyId };
    const record = request.sourceKind === "QUOTATION"
      ? await tx.quotation.findFirst({ where: { ...base, status: "APPROVED", isCurrentRevision: true, isDeleted: false }, include: { lines: true } })
      : await tx.salesOrder.findFirst({ where: { ...base, status: "CONFIRMED" }, include: { lines: true } });
    if (!record) throw new InvoiceDomainError("Eligible upstream source not found.");
    return {
      origin: request.sourceKind, sourceKind: request.sourceKind, sourceId: record.id,
      sourceQuotationFamilyId: request.sourceKind === "QUOTATION" ? record.familyId : record.sourceQuotationFamilyId,
      sourceQuotationRevisionNumber: request.sourceKind === "QUOTATION" ? record.revisionNumber : record.sourceQuotationRevisionNumber,
      customerId: record.customerId, priceListId: record.priceListId, currencyCode: record.currencyCode,
      customer: { name: record.customerName, nameAr: record.customerNameAr, nameEn: record.customerNameEn, email: record.customerEmail, phone: record.customerPhone, taxNumber: record.customerTaxNo, billingAddress: record.billingAddress },
      lines: record.lines.map((line: any) => ({
        sourceLineId: line.id, catalogItemId: line.catalogItemId, taxRateId: line.taxRateId,
        position: line.position, type: line.type, itemCode: line.itemCode, itemName: line.itemName,
        itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn, description: line.description,
        unitName: line.unitName, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
        discount: line.discountType ? { type: line.discountType, value: Number(line.discountValue) } : null,
        taxPercentage: Number(line.taxPercentage),
      })),
      discount: record.discountType ? { type: record.discountType, value: Number(record.discountValue) } as Discount : null,
    };
  }

  async create(request: CreateInvoiceRequest): Promise<Invoice> {
    return this.db.$transaction(async (tx: any) => {
      const fingerprint = requestFingerprint(request);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${request.companyId}:invoice-create:${request.requestKey}`}))`;
      const prior = await tx.invoice.findFirst({
        where: { companyId: request.companyId, creationRequestKey: request.requestKey },
        include: this.include(),
      });
      if (prior) {
        if (prior.creationRequestFingerprint !== fingerprint) throw new InvoiceDomainError("Invoice request key conflicts with another request.");
        return this.toDomain(prior);
      }
      if (request.sourceKind && request.sourceId) {
        const fromSource = await tx.invoice.findFirst({
          where: { companyId: request.companyId, sourceKind: request.sourceKind, sourceId: request.sourceId },
          include: this.include(),
        });
        if (fromSource) return this.toDomain(fromSource);
      }
      const snapshot = await this.sourceSnapshot(tx, request);
      const invoiceDate = request.invoiceDate ?? new Date();
      const number = await this.nextNumber(tx, request.companyId, invoiceDate);
      const invoice = new Invoice({
        companyId: request.companyId, number, ...snapshot, invoiceDate,
        dueDate: request.dueDate ?? null, notes: request.notes,
        termsAndConditions: request.termsAndConditions, createdBy: request.actor,
      });
      const created = await tx.invoice.create({
        data: {
          companyId: invoice.companyId, number: invoice.number, creationRequestKey: request.requestKey,
          creationRequestFingerprint: fingerprint, status: invoice.status,
          settlementStatus: invoice.settlementStatus, origin: invoice.origin,
          sourceKind: invoice.sourceKind, sourceId: invoice.sourceId,
          sourceQuotationFamilyId: invoice.sourceQuotationFamilyId,
          sourceQuotationRevisionNumber: invoice.sourceQuotationRevisionNumber,
          customerId: invoice.customerId, priceListId: invoice.priceListId,
          currencyCode: invoice.currencyCode, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate,
          customerName: invoice.customer.name, customerNameAr: invoice.customer.nameAr,
          customerNameEn: invoice.customer.nameEn, customerEmail: invoice.customer.email,
          customerPhone: invoice.customer.phone, customerTaxNo: invoice.customer.taxNumber,
          billingAddress: invoice.customer.billingAddress,
          subtotal: invoice.totals.subtotal, discountType: invoice.discount?.type,
          discountValue: invoice.discount?.value ?? 0, discountAmount: invoice.totals.discountAmount,
          taxAmount: invoice.totals.taxAmount, totalAmount: invoice.totals.totalAmount,
          paidAmount: 0, outstandingAmount: invoice.totals.totalAmount,
          notes: invoice.notes, termsAndConditions: invoice.termsAndConditions,
          createdByUserId: invoice.createdBy.userId, createdByName: invoice.createdBy.name, createdByRole: invoice.createdBy.role,
          lines: { create: invoice.lines.map((line) => ({
            sourceLineId: (line as any).sourceLineId, catalogItemId: line.catalogItemId,
            taxRateId: line.taxRateId, position: line.position, type: line.type,
            itemCode: line.itemCode, itemName: line.itemName, itemNameAr: line.itemNameAr,
            itemNameEn: line.itemNameEn, description: line.description, unitName: line.unitName,
            quantity: line.quantity, unitPrice: line.unitPrice, discountType: line.discount?.type,
            discountValue: line.discount?.value ?? 0, discountAmount: line.discountAmount,
            taxPercentage: line.taxPercentage ?? 0, taxAmount: line.taxAmount,
            subtotal: line.subtotal, totalAmount: line.totalAmount,
          })) },
          events: { create: { companyId: invoice.companyId, actorUserId: invoice.createdBy.userId, action: "CREATED", details: { origin: invoice.origin } } },
        }, include: this.include(),
      });
      return this.toDomain(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findById(companyId: string, invoiceId: string) {
    const record = await this.db.invoice.findFirst({ where: { id: invoiceId, companyId }, include: this.include() });
    return record ? this.toDomain(record) : null;
  }

  async list(input: Parameters<IInvoiceRepository["list"]>[0]): Promise<InvoiceListResult> {
    const where: any = { companyId: input.companyId, customerId: input.customerId, status: input.status, settlementStatus: input.settlementStatus };
    if (input.search?.trim()) where.OR = [{ number: { contains: input.search.trim(), mode: "insensitive" } }, { customerName: { contains: input.search.trim(), mode: "insensitive" } }];
    const [records, total] = await Promise.all([
      this.db.invoice.findMany({ where, include: this.include(), orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }], skip: input.skip, take: input.take }),
      this.db.invoice.count({ where }),
    ]);
    return { invoices: records.map((record) => this.toDomain(record)), total };
  }

  async issue(companyId: string, invoiceId: string, actor: InvoiceActor) {
    return this.transition(companyId, invoiceId, actor, "ISSUE");
  }

  async void(companyId: string, invoiceId: string, actor: InvoiceActor, reason: string) {
    return this.transition(companyId, invoiceId, actor, "VOID", reason);
  }

  private async transition(companyId: string, invoiceId: string, actor: InvoiceActor, action: "ISSUE" | "VOID", reason?: string) {
    return this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:invoice-transition:${invoiceId}`}))`;
      const record = await tx.invoice.findFirst({ where: { id: invoiceId, companyId }, include: this.include() });
      if (!record) return null;
      const invoice = this.toDomain(record);
      const trusted = actorData(actor);
      if (action === "ISSUE") invoice.issue(trusted); else invoice.void(trusted, reason ?? "");
      await tx.invoice.update({
        where: { id: invoiceId, companyId },
        data: action === "ISSUE"
          ? { status: "ISSUED", issuedAt: invoice.issuedAt, issuedByUserId: trusted.userId, issuedByName: trusted.name, issuedByRole: trusted.role }
          : { status: "VOID", voidedAt: invoice.voidedAt, voidedByUserId: trusted.userId, voidedByName: trusted.name, voidedByRole: trusted.role, voidReason: invoice.voidReason },
      });
      await tx.invoiceEvent.create({ data: { companyId, invoiceId, actorUserId: trusted.userId, action: action === "ISSUE" ? "ISSUED" : "VOIDED", details: reason ? { reason } : undefined } });
      return invoice;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordPayment(request: RecordPaymentRequest) {
    return this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${request.companyId}:${request.invoiceId}`}))`;
      const existing = await tx.payment.findFirst({ where: { companyId: request.companyId, requestKey: request.requestKey } });
      if (existing) {
        const sameRequest = existing.invoiceId === request.invoiceId
          && Number(existing.amount) === money(request.amount)
          && existing.method === request.method
          && existing.receivedAt.getTime() === request.receivedAt.getTime()
          && existing.reference === (request.reference?.trim() || null)
          && existing.notes === (request.notes?.trim() || null);
        if (!sameRequest) throw new InvoiceDomainError("Payment request key conflicts with another payment.");
        const invoice = await tx.invoice.findFirst({ where: { id: request.invoiceId, companyId: request.companyId }, include: this.include() });
        if (!invoice) throw new InvoiceDomainError("Invoice not found.");
        return { invoice: this.toDomain(invoice), payment: this.payment(existing), created: false };
      }
      if (!Number.isFinite(request.amount) || money(request.amount) <= 0) throw new InvoiceDomainError("Payment amount must be positive.");
      const invoice = await tx.invoice.findFirst({ where: { id: request.invoiceId, companyId: request.companyId }, include: this.include() });
      if (!invoice) throw new InvoiceDomainError("Invoice not found.");
      if (invoice.status !== "ISSUED") throw new InvoiceDomainError("Payments require an issued invoice.");
      const amount = money(request.amount);
      const outstanding = Number(invoice.outstandingAmount);
      if (amount > outstanding) throw new InvoiceDomainError("Payment cannot exceed outstanding balance.");
      const paidAmount = money(Number(invoice.paidAmount) + amount);
      const outstandingAmount = money(Number(invoice.totalAmount) - paidAmount);
      const settlementStatus = outstandingAmount === 0 ? "PAID" : "PARTIALLY_PAID";
      const trusted = actorData(request.actor);
      const payment = await tx.payment.create({ data: {
        companyId: request.companyId, invoiceId: request.invoiceId, requestKey: request.requestKey,
        amount, currencyCode: invoice.currencyCode, method: request.method,
        receivedAt: request.receivedAt, reference: request.reference?.trim() || null,
        notes: request.notes?.trim() || null, recordedByUserId: trusted.userId,
        recordedByName: trusted.name, recordedByRole: trusted.role,
      }});
      const updated = await tx.invoice.update({ where: { id: invoice.id, companyId: request.companyId }, data: { paidAmount, outstandingAmount, settlementStatus }, include: this.include() });
      await tx.invoiceEvent.create({ data: { companyId: request.companyId, invoiceId: invoice.id, actorUserId: trusted.userId, action: "PAYMENT_RECORDED", details: { paymentId: payment.id, amount, settlementStatus } } });
      return { invoice: this.toDomain(updated), payment: this.payment(payment), created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private payment(record: any): PaymentRecord {
    return { id: record.id, invoiceId: record.invoiceId, amount: Number(record.amount), currencyCode: record.currencyCode, method: record.method, receivedAt: record.receivedAt, reference: record.reference, notes: record.notes, recordedByName: record.recordedByName, recordedByRole: record.recordedByRole, createdAt: record.createdAt };
  }

  async listPayments(companyId: string, invoiceId: string, skip: number, take: number) {
    const invoice = await this.db.invoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true } });
    if (!invoice) return null;
    const where = { companyId, invoiceId };
    const [records, total] = await Promise.all([
      this.db.payment.findMany({ where, orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], skip, take }),
      this.db.payment.count({ where }),
    ]);
    return { payments: records.map((record) => this.payment(record)), total };
  }
}
