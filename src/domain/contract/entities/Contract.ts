import {
  CommercialDocumentProvenance,
  type CommercialCustomerSnapshot,
  type CommercialLineSnapshot,
} from "../../commercial";
import type { CompanyDocumentBrandSnapshot } from "../../document/CompanyDocumentBrandSnapshot";
import type { DiscountType, QuotationScopeType } from "../../quotation";
import { QuotationCalculator } from "../../quotation/services/QuotationCalculator";
import { ContractDomainError } from "../errors/ContractDomainError";
import { ContractMilestone, type ContractMilestoneProps } from "./ContractMilestone";
import { ContractStatus } from "../types/ContractStatus";
import { ContractNumber } from "../value-objects/ContractNumber";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export interface ContractProps {
  id?: string;
  companyId: string;
  number: string;
  status?: ContractStatus;
  provenance: CommercialDocumentProvenance;
  customerId: string;
  priceListId?: string | null;
  currencyCode?: string;
  contractDate?: Date;
  startDate?: Date | null;
  endDate?: Date | null;
  customer: CommercialCustomerSnapshot;
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
  discountValue?: number;
  lines: CommercialLineSnapshot[];
  milestones?: ContractMilestoneProps[];
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  documentBrandSnapshot?: CompanyDocumentBrandSnapshot | null;
  createdByUserId?: string | null;
  createdByName: string;
  createdByRole: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Contract {
  public readonly id?: string;
  public readonly companyId: string;
  public readonly number: ContractNumber;
  public readonly status: ContractStatus;
  public readonly provenance: CommercialDocumentProvenance;
  public readonly customerId: string;
  public readonly priceListId: string | null;
  public readonly currencyCode: string;
  public readonly contractDate: Date;
  public readonly startDate: Date | null;
  public readonly endDate: Date | null;
  public readonly customer: Readonly<CommercialCustomerSnapshot>;
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
  private readonly _documentBrandSnapshot: CompanyDocumentBrandSnapshot | null;
  public readonly createdByUserId: string | null;
  public readonly createdByName: string;
  public readonly createdByRole: string;
  public readonly lines: ReadonlyArray<Readonly<CommercialLineSnapshot>>;
  public readonly milestones: ReadonlyArray<ContractMilestone>;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(props: ContractProps) {
    this.id = props.id?.trim() || undefined;
    this.companyId = required(props.companyId, "Company id");
    this.number = ContractNumber.create(props.number);
    this.status = props.status ?? ContractStatus.DRAFT;

    if (this.status !== ContractStatus.DRAFT) {
      throw new ContractDomainError("Contract MVP currently supports DRAFT status only.");
    }

    if (!(props.provenance instanceof CommercialDocumentProvenance)) {
      throw new ContractDomainError("Contract provenance must be a valid CommercialDocumentProvenance object.");
    }
    this.provenance = props.provenance;

    this.customerId = required(props.customerId, "Customer id");
    this.priceListId = props.priceListId?.trim() || null;
    this.currencyCode = (props.currencyCode ?? "KWD").trim().toUpperCase();

    if (!CURRENCY_CODE_PATTERN.test(this.currencyCode)) {
      throw new ContractDomainError("Currency code must be a valid three-letter ISO-style code.");
    }

    this.contractDate = validDate(props.contractDate ?? new Date(), "Contract date");
    this.startDate = props.startDate ? validDate(props.startDate, "Start date") : null;
    this.endDate = props.endDate ? validDate(props.endDate, "End date") : null;

    if (this.startDate && this.endDate && this.endDate.getTime() < this.startDate.getTime()) {
      throw new ContractDomainError("Contract end date cannot be before start date.");
    }

    this.customer = Object.freeze({
      name: required(props.customer.name, "Customer name"),
      nameAr: props.customer.nameAr?.trim() || null,
      nameEn: props.customer.nameEn?.trim() || null,
      email: props.customer.email?.trim() || null,
      phone: props.customer.phone?.trim() || null,
      taxNumber: props.customer.taxNumber?.trim() || null,
      billingAddress: props.customer.billingAddress?.trim() || null,
    });

    this.subjectAr = props.subjectAr?.trim() || null;
    this.subjectEn = props.subjectEn?.trim() || null;
    this.briefAr = props.briefAr?.trim() || null;
    this.briefEn = props.briefEn?.trim() || null;
    this.projectName = props.projectName?.trim() || null;
    this.projectNameAr = props.projectNameAr?.trim() || null;
    this.projectNameEn = props.projectNameEn?.trim() || null;
    this.attentionName = props.attentionName?.trim() || null;
    this.attentionNameAr = props.attentionNameAr?.trim() || null;
    this.attentionNameEn = props.attentionNameEn?.trim() || null;
    this.scopeType = props.scopeType ?? null;

    this.discountType = props.discountType ?? null;
    this.discountValue = nonNegative(props.discountValue ?? 0, "Discount value");

    if (props.lines.length === 0) {
      throw new ContractDomainError("A Contract requires at least one line.");
    }

    const calculated = QuotationCalculator.calculate(
      props.lines.map((l) => ({
        id: l.id,
        catalogItemId: l.catalogItemId,
        taxRateId: l.taxRateId,
        position: l.position,
        type: l.type,
        itemCode: l.itemCode,
        itemName: l.itemName,
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
        description: l.description,
        descriptionAr: l.descriptionAr,
        descriptionEn: l.descriptionEn,
        unitName: l.unitName,
        unitNameAr: l.unitNameAr,
        unitNameEn: l.unitNameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discountType ? { type: l.discountType, value: l.discountValue } : null,
        taxPercentage: l.taxPercentage ?? 0,
      })),
      this.discountType ? { type: this.discountType, value: this.discountValue } : null,
    );

    this.subtotal = calculated.totals.subtotal;
    this.discountAmount = calculated.totals.discountAmount;
    this.taxAmount = calculated.totals.taxAmount;
    this.totalAmount = calculated.totals.totalAmount;

    this.lines = Object.freeze(
      calculated.lines.map((line, idx) => ({
        id: props.lines[idx]?.id,
        sourceLineId: props.lines[idx]?.sourceLineId || null,
        catalogItemId: line.catalogItemId,
        taxRateId: line.taxRateId,
        position: line.position,
        type: line.type,
        itemCode: line.itemCode,
        itemName: line.itemName,
        itemNameAr: line.itemNameAr,
        itemNameEn: line.itemNameEn,
        description: line.description,
        descriptionAr: line.descriptionAr,
        descriptionEn: line.descriptionEn,
        unitName: line.unitName,
        unitNameAr: line.unitNameAr,
        unitNameEn: line.unitNameEn,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountType: line.discount?.type || null,
        discountValue: line.discount?.value || 0,
        discountAmount: line.discountAmount,
        taxPercentage: line.taxPercentage ?? 0,
        taxAmount: line.taxAmount,
        subtotal: line.subtotal,
        totalAmount: line.totalAmount,
      })),
    );

    const milestones = (props.milestones || []).map((m) => new ContractMilestone(m));
    // Verify milestone contiguity
    milestones.sort((a, b) => a.position - b.position);
    milestones.forEach((m, idx) => {
      if (m.position !== idx + 1) {
        throw new ContractDomainError("Contract milestone positions must be contiguous starting from 1.");
      }
    });

    // Check percentage milestone sum validation if all are percentage
    const allPercentage = milestones.length > 0 && milestones.every((m) => m.amountType === "PERCENTAGE");
    if (allPercentage) {
      const sum = milestones.reduce((acc, m) => acc + (m.percentage || 0), 0);
      if (sum > 100) {
        throw new ContractDomainError("Milestone percentage total cannot exceed 100%.");
      }
    }

    this.milestones = Object.freeze(milestones);

    this.notes = props.notes?.trim() || null;
    this.notesAr = props.notesAr?.trim() || null;
    this.notesEn = props.notesEn?.trim() || null;
    this.termsAndConditions = props.termsAndConditions?.trim() || null;
    this.termsAndConditionsAr = props.termsAndConditionsAr?.trim() || null;
    this.termsAndConditionsEn = props.termsAndConditionsEn?.trim() || null;

    this._documentBrandSnapshot = props.documentBrandSnapshot
      ? structuredClone(props.documentBrandSnapshot)
      : null;

    this.createdByUserId = props.createdByUserId?.trim() || null;
    this.createdByName = required(props.createdByName, "Creator name");
    this.createdByRole = required(props.createdByRole, "Creator role");

    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get documentBrandSnapshot(): CompanyDocumentBrandSnapshot | null {
    return this._documentBrandSnapshot ? structuredClone(this._documentBrandSnapshot) : null;
  }

  static restore(props: ContractProps): Contract {
    if (!props.id?.trim()) {
      throw new ContractDomainError("Contract id is required when restoring from persistence.");
    }
    return new Contract(props);
  }
}

function required(value: string, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ContractDomainError(`${label} is required.`);
  }
  return normalized;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ContractDomainError(`${label} must be a non-negative number.`);
  }
  return value;
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ContractDomainError(`${label} is invalid.`);
  }
  return value;
}
