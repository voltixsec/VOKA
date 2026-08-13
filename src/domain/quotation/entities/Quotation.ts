import { QuotationDomainError } from "../errors/QuotationDomainError";
import { LocalizationStatus } from "../types/LocalizationStatus";
import {
  QuotationCalculator,
  type QuotationTotals,
} from "../services/QuotationCalculator";
import type { Discount } from "../types/DiscountType";
import type {
  CalculatedQuotationLine,
  QuotationLineInput,
} from "../types/QuotationLine";
import {
  isQuotationScopeType,
  type QuotationScopeType,
} from "../types/QuotationScopeType";
import type { QuotationStatus } from "../types/QuotationStatus";
import {
  CustomerSnapshot,
  type CustomerSnapshotProps,
} from "../value-objects/CustomerSnapshot";
import { QuotationNumber } from "../value-objects/QuotationNumber";
import type { CompanyDocumentBrandSnapshot } from "../../document/CompanyDocumentBrandSnapshot";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export interface QuotationProposalProps {
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
}

export interface QuotationApprovalIdentity {
  name: string;
  role: string;
}

export interface QuotationProps
  extends QuotationProposalProps {
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
  notesAr?: string | null;
  notesEn?: string | null;
  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  sentAt?: Date | null;
  approvedAt?: Date | null;
  approvedByName?: string | null;
  approvedByRole?: string | null;
  documentBrandSnapshot?: CompanyDocumentBrandSnapshot | null;
  verificationToken?: string | null;
  rejectedAt?: Date | null;
  cancelledAt?: Date | null;
  // New localization lifecycle fields
  localizationStatus?: LocalizationStatus;
  localizationRequestedAt?: Date | null;
  localizationCompletedAt?: Date | null;
  localizationLastError?: string | null;
  localizationSourceLocale?: "ar" | "en" | null;
  localizationSourceSignature?: string | null;
  localizationClaimToken?: string | null;
  localizationLeaseUntil?: Date | null;
  localizationAttemptCount?: number;
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
  private _notesAr: string | null;
  private _notesEn: string | null;
  private _termsAndConditions: string | null;
  private _termsAndConditionsAr: string | null;
  private _termsAndConditionsEn: string | null;
  private _subjectAr: string | null;
  private _subjectEn: string | null;
  private _briefAr: string | null;
  private _briefEn: string | null;
  private _projectName: string | null;
  private _projectNameAr: string | null;
  private _projectNameEn: string | null;
  private _attentionName: string | null;
  private _attentionNameAr: string | null;
  private _attentionNameEn: string | null;
  private _scopeType: QuotationScopeType | null;
  private _sentAt: Date | null;
  private _approvedAt: Date | null;
  private _approvedByName: string | null;
  private _approvedByRole: string | null;
  private _documentBrandSnapshot: CompanyDocumentBrandSnapshot | null;
  private _verificationToken: string | null;
  private _rejectedAt: Date | null;
  private _cancelledAt: Date | null;
  // Localization lifecycle fields
  private _localizationStatus: LocalizationStatus = LocalizationStatus.COMPLETED;
  private _localizationRequestedAt: Date | null = null;
  private _localizationCompletedAt: Date | null = null;
  private _localizationLastError: string | null = null;
  private _localizationSourceLocale: "ar" | "en" | null = null;
  private _localizationSourceSignature: string | null = null;
  private _localizationClaimToken: string | null = null;
  private _localizationLeaseUntil: Date | null = null;
  private _localizationAttemptCount: number = 0;

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
    this._localizationStatus = props.localizationStatus ?? LocalizationStatus.COMPLETED;
    this._localizationRequestedAt = props.localizationRequestedAt ?? null;
    this._localizationCompletedAt = props.localizationCompletedAt ?? null;
    this._localizationLastError = props.localizationLastError ?? null;
    this._localizationSourceLocale = props.localizationSourceLocale ?? null;
    this._localizationSourceSignature = props.localizationSourceSignature ?? null;
    this._localizationClaimToken = props.localizationClaimToken ?? null;
    this._localizationLeaseUntil = props.localizationLeaseUntil ?? null;
    this._localizationAttemptCount = props.localizationAttemptCount ?? 0;
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
    this._notes =
      props.notes?.trim() || null;
    this._notesAr =
      this.normalizeOptionalText(props.notesAr);
    this._notesEn =
      this.normalizeOptionalText(props.notesEn);
    this._termsAndConditions =
      props.termsAndConditions?.trim() || null;
    this._termsAndConditionsAr =
      this.normalizeOptionalText(props.termsAndConditionsAr);
    this._termsAndConditionsEn =
      this.normalizeOptionalText(props.termsAndConditionsEn);
    this._subjectAr =
      this.normalizeOptionalText(props.subjectAr);
    this._subjectEn =
      this.normalizeOptionalText(props.subjectEn);
    this._briefAr =
      this.normalizeOptionalText(props.briefAr);
    this._briefEn =
      this.normalizeOptionalText(props.briefEn);
    this._projectName =
      this.normalizeOptionalText(props.projectName);
    this._projectNameAr =
      this.normalizeOptionalText(
        props.projectNameAr,
      );
    this._projectNameEn =
      this.normalizeOptionalText(
        props.projectNameEn,
      );
    this._attentionName =
      this.normalizeOptionalText(props.attentionName);
    this._attentionNameAr =
      this.normalizeOptionalText(
        props.attentionNameAr,
      );
    this._attentionNameEn =
      this.normalizeOptionalText(
        props.attentionNameEn,
      );
    this._scopeType =
      this.normalizeScopeType(props.scopeType);
    this._sentAt = props.sentAt ?? null;
    this._approvedAt = props.approvedAt ?? null;
    this._approvedByName =
      props.approvedByName?.trim() || null;
    this._approvedByRole =
      props.approvedByRole?.trim() || null;
    this._documentBrandSnapshot = props.documentBrandSnapshot
      ? structuredClone(props.documentBrandSnapshot)
      : null;
    this._verificationToken = props.verificationToken?.trim() || null;
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

  /**
   * Rebuilds an existing quotation aggregate from persistence data.
   *
   * Derived totals are recalculated from the stored lines and discount
   * to preserve domain integrity.
   */
  static restore(props: QuotationProps): Quotation {
    if (!props.id?.trim()) {
      throw new QuotationDomainError(
        "Quotation id is required when restoring from persistence.",
      );
    }

    return new Quotation(props);
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

  get notesAr(): string | null {
    return this._notesAr;
  }

  get notesEn(): string | null {
    return this._notesEn;
  }

  get termsAndConditions(): string | null {
    return this._termsAndConditions;
  }

  get termsAndConditionsAr(): string | null {
    return this._termsAndConditionsAr;
  }

  get termsAndConditionsEn(): string | null {
    return this._termsAndConditionsEn;
  }

  get subjectAr(): string | null {
    return this._subjectAr;
  }

  get subjectEn(): string | null {
    return this._subjectEn;
  }

  get briefAr(): string | null {
    return this._briefAr;
  }

  get briefEn(): string | null {
    return this._briefEn;
  }

  get projectName(): string | null {
    return this._projectName;
  }

  get projectNameAr(): string | null {
    return this._projectNameAr;
  }

  get projectNameEn(): string | null {
    return this._projectNameEn;
  }

  get attentionName(): string | null {
    return this._attentionName;
  }

  get attentionNameAr(): string | null {
    return this._attentionNameAr;
  }

  get attentionNameEn(): string | null {
    return this._attentionNameEn;
  }

  get scopeType(): QuotationScopeType | null {
    return this._scopeType;
  }

  get sentAt(): Date | null {
    return this._sentAt;
  }

  get approvedAt(): Date | null {
    return this._approvedAt;
  }

  get approvedByName(): string | null {
    return this._approvedByName;
  }

  get approvedByRole(): string | null {
    return this._approvedByRole;
  }

  get rejectedAt(): Date | null {
    return this._rejectedAt;
  }

  get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  // Localization getters
  get localizationStatus(): LocalizationStatus {
    return this._localizationStatus;
  }

  get localizationRequestedAt(): Date | null {
    return this._localizationRequestedAt;
  }

  get localizationCompletedAt(): Date | null {
    return this._localizationCompletedAt;
  }

  get localizationLastError(): string | null {
    return this._localizationLastError;
  }

  get localizationSourceLocale(): "ar" | "en" | null {
    return this._localizationSourceLocale;
  }

  get localizationSourceSignature(): string | null {
    return this._localizationSourceSignature;
  }

  get localizationClaimToken(): string | null {
    return this._localizationClaimToken;
  }

  get localizationLeaseUntil(): Date | null {
    return this._localizationLeaseUntil;
  }

  get localizationAttemptCount(): number {
    return this._localizationAttemptCount;
  }

  // Domain transition methods
  markLocalizationPending(sourceLocale: "ar" | "en", requestedAt: Date): void {
    this._localizationStatus = LocalizationStatus.PENDING;
    this._localizationRequestedAt = requestedAt;
    this._localizationCompletedAt = null;
    this._localizationLastError = null;
    this._localizationSourceLocale = sourceLocale;
  }

  get documentBrandSnapshot(): CompanyDocumentBrandSnapshot | null {
    return this._documentBrandSnapshot
      ? structuredClone(this._documentBrandSnapshot)
      : null;
  }

  get verificationToken(): string | null { return this._verificationToken; }

  startLocalizationGeneration(
    sourceLocale: "ar" | "en",
    sourceSignature: string,
    requestedAt: Date,
  ): void {
    this._localizationStatus = LocalizationStatus.PENDING;
    this._localizationRequestedAt = requestedAt;
    this._localizationCompletedAt = null;
    this._localizationLastError = null;
    this._localizationSourceLocale = sourceLocale;
    this._localizationSourceSignature = sourceSignature;
    this._localizationClaimToken = null;
    this._localizationLeaseUntil = null;
    this._localizationAttemptCount = 0;
  }

  markLocalizationCompleted(completedAt?: Date): void {
    this._localizationStatus = LocalizationStatus.COMPLETED;
    this._localizationLastError = null;
    if (completedAt !== undefined) {
      this._localizationCompletedAt = completedAt;
    }
  }

  setLocalizationSourceLocale(sourceLocale: "ar" | "en"): void {
    this._localizationSourceLocale = sourceLocale;
  }

  markLocalizationFailed(error: string): void {
    this._localizationStatus = LocalizationStatus.FAILED;
    this._localizationLastError =
      error === "TRANSLATION_TIMEOUT" ||
      error === "TRANSLATION_PROVIDER_ERROR" ||
      error === "TRANSLATION_INVALID_RESPONSE" ||
      error === "TRANSLATION_UNEXPECTED_ERROR"
        ? error
        : "TRANSLATION_UNEXPECTED_ERROR";
    this._localizationCompletedAt = null;
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
    notesAr?: string | null,
    notesEn?: string | null,
    termsAndConditionsAr?: string | null,
    termsAndConditionsEn?: string | null,
  ): void {
    this.assertDraft();
    this._notes = notes?.trim() || null;
    this._termsAndConditions =
      termsAndConditions?.trim() || null;

    if (notesAr !== undefined) {
      this._notesAr =
        this.normalizeOptionalText(notesAr);
    }

    if (notesEn !== undefined) {
      this._notesEn =
        this.normalizeOptionalText(notesEn);
    }

    if (termsAndConditionsAr !== undefined) {
      this._termsAndConditionsAr =
        this.normalizeOptionalText(
          termsAndConditionsAr,
        );
    }

    if (termsAndConditionsEn !== undefined) {
      this._termsAndConditionsEn =
        this.normalizeOptionalText(
          termsAndConditionsEn,
        );
    }
  }

  updateProposal(
    proposal: QuotationProposalProps,
  ): void {
    this.assertDraft();

    if (proposal.subjectAr !== undefined) {
      this._subjectAr =
        this.normalizeOptionalText(proposal.subjectAr);
    }

    if (proposal.subjectEn !== undefined) {
      this._subjectEn =
        this.normalizeOptionalText(proposal.subjectEn);
    }

    if (proposal.briefAr !== undefined) {
      this._briefAr =
        this.normalizeOptionalText(proposal.briefAr);
    }

    if (proposal.briefEn !== undefined) {
      this._briefEn =
        this.normalizeOptionalText(proposal.briefEn);
    }

    if (proposal.projectName !== undefined) {
      this._projectName =
        this.normalizeOptionalText(
          proposal.projectName,
        );
    }

    if (proposal.projectNameAr !== undefined) {
      this._projectNameAr =
        this.normalizeOptionalText(
          proposal.projectNameAr,
        );
    }

    if (proposal.projectNameEn !== undefined) {
      this._projectNameEn =
        this.normalizeOptionalText(
          proposal.projectNameEn,
        );
    }

    if (proposal.attentionName !== undefined) {
      this._attentionName =
        this.normalizeOptionalText(
          proposal.attentionName,
        );
    }

    if (proposal.attentionNameAr !== undefined) {
      this._attentionNameAr =
        this.normalizeOptionalText(
          proposal.attentionNameAr,
        );
    }

    if (proposal.attentionNameEn !== undefined) {
      this._attentionNameEn =
        this.normalizeOptionalText(
          proposal.attentionNameEn,
        );
    }

    if (proposal.scopeType !== undefined) {
      this._scopeType =
        this.normalizeScopeType(proposal.scopeType);
    }
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

  approve(
    documentBrandSnapshot: CompanyDocumentBrandSnapshot,
    approval: QuotationApprovalIdentity = {
      name: "Authorized Approver",
      role: "APPROVER",
    },
    at: Date = new Date(),
    verificationToken?: string,
  ): void {
    this.assertTransition(
      ["SENT"],
      "APPROVED",
    );

    const approvedByName =
      approval.name.trim();

    const approvedByRole =
      approval.role.trim();

    if (
      !approvedByName ||
      !approvedByRole
    ) {
      throw new QuotationDomainError(
        "Approval identity is required.",
      );
    }

    this._status = "APPROVED";
    this._approvedAt = at;
    this._approvedByName =
      approvedByName;
    this._approvedByRole =
      approvedByRole;
    if (!this._documentBrandSnapshot) {
      this._documentBrandSnapshot = structuredClone(documentBrandSnapshot);
    }
    if (!this._verificationToken && verificationToken?.trim()) {
      this._verificationToken = verificationToken.trim();
    }
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

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | null {
    return value?.trim() || null;
  }

  private normalizeScopeType(
    value: unknown,
  ): QuotationScopeType | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (!isQuotationScopeType(value)) {
      throw new QuotationDomainError(
        "Quotation scope type is invalid.",
      );
    }

    return value;
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
