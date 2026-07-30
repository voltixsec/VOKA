import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type CustomerType = 'COMPANY' | 'INDIVIDUAL';

export type CustomerStatus =
  | 'LEAD'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'BLOCKED';

export type CustomerLocale = 'EN' | 'AR';

export type CustomerProps = {
  companyId: string;
  code: string;
  type: CustomerType;
  status: CustomerStatus;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  preferredLocale: CustomerLocale | null;
  preferredCurrency: string | null;
  creditLimit: number | null;
  paymentTermDays: number | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCustomerProps = {
  companyId: string;
  code: string;
  name: string;
  type?: CustomerType;
  status?: CustomerStatus;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  taxNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  preferredLocale?: CustomerLocale | null;
  preferredCurrency?: string | null;
  creditLimit?: number | null;
  paymentTermDays?: number | null;
  notes?: string | null;
};

export class Customer extends Entity<CustomerProps> {
  private constructor(props: CustomerProps, id?: UniqueEntityID) {
    super(props, id);
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get code(): string {
    return this.props.code;
  }

  public get type(): CustomerType {
    return this.props.type;
  }

  public get status(): CustomerStatus {
    return this.props.status;
  }

  public get name(): string {
    return this.props.name;
  }

  public get legalName(): string | null {
    return this.props.legalName;
  }

  public get email(): string | null {
    return this.props.email;
  }

  public get phone(): string | null {
    return this.props.phone;
  }

  public get mobile(): string | null {
    return this.props.mobile;
  }

  public get taxNumber(): string | null {
    return this.props.taxNumber;
  }

  public get addressLine1(): string | null {
    return this.props.addressLine1;
  }

  public get addressLine2(): string | null {
    return this.props.addressLine2;
  }

  public get city(): string | null {
    return this.props.city;
  }

  public get state(): string | null {
    return this.props.state;
  }

  public get postalCode(): string | null {
    return this.props.postalCode;
  }

  public get countryCode(): string | null {
    return this.props.countryCode;
  }

  public get preferredLocale(): CustomerLocale | null {
    return this.props.preferredLocale;
  }

  public get preferredCurrency(): string | null {
    return this.props.preferredCurrency;
  }

  public get creditLimit(): number | null {
    return this.props.creditLimit;
  }

  public get paymentTermDays(): number | null {
    return this.props.paymentTermDays;
  }

  public get notes(): string | null {
    return this.props.notes;
  }

  public get isDeleted(): boolean {
    return this.props.isDeleted;
  }

  public get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public static create(
    input: CreateCustomerProps,
    id?: UniqueEntityID,
  ): Result<Customer, DomainError> {
    const companyId = input.companyId.trim();
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();

    const companyIdGuard = Guard.againstEmptyString(
      companyId,
      'Customer company ID',
    );

    if (!companyIdGuard.succeeded) {
      return Result.failure(
        new DomainError(
          companyIdGuard.message ?? 'Customer company ID is required.',
          'INVALID_CUSTOMER_COMPANY_ID',
        ),
      );
    }

    const codeGuard = Guard.againstEmptyString(code, 'Customer code');

    if (!codeGuard.succeeded) {
      return Result.failure(
        new DomainError(
          codeGuard.message ?? 'Customer code is required.',
          'INVALID_CUSTOMER_CODE',
        ),
      );
    }

    if (!/^[A-Z0-9][A-Z0-9-_]{0,49}$/.test(code)) {
      return Result.failure(
        new DomainError(
          'Customer code may only contain letters, numbers, hyphens, and underscores.',
          'INVALID_CUSTOMER_CODE',
        ),
      );
    }

    const nameGuard = Guard.againstEmptyString(name, 'Customer name');

    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'Customer name is required.',
          'INVALID_CUSTOMER_NAME',
        ),
      );
    }

    const email = Customer.normalizeOptional(input.email);

    if (email && !Customer.isValidEmail(email)) {
      return Result.failure(
        new DomainError(
          'Customer email address is invalid.',
          'INVALID_CUSTOMER_EMAIL',
        ),
      );
    }

    const countryCode = Customer.normalizeCountryCode(
      input.countryCode,
    );

    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      return Result.failure(
        new DomainError(
          'Customer country code must be a two-letter ISO code.',
          'INVALID_CUSTOMER_COUNTRY_CODE',
        ),
      );
    }

    const preferredCurrency = Customer.normalizeCurrency(
      input.preferredCurrency,
    );

    if (
      preferredCurrency &&
      !/^[A-Z]{3}$/.test(preferredCurrency)
    ) {
      return Result.failure(
        new DomainError(
          'Customer currency must be a three-letter currency code.',
          'INVALID_CUSTOMER_CURRENCY',
        ),
      );
    }

    if (
      input.creditLimit !== undefined &&
      input.creditLimit !== null &&
      (!Number.isFinite(input.creditLimit) || input.creditLimit < 0)
    ) {
      return Result.failure(
        new DomainError(
          'Customer credit limit cannot be negative.',
          'INVALID_CUSTOMER_CREDIT_LIMIT',
        ),
      );
    }

    if (
      input.paymentTermDays !== undefined &&
      input.paymentTermDays !== null &&
      (!Number.isInteger(input.paymentTermDays) ||
        input.paymentTermDays < 0)
    ) {
      return Result.failure(
        new DomainError(
          'Customer payment term days must be a non-negative integer.',
          'INVALID_CUSTOMER_PAYMENT_TERMS',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new Customer(
        {
          companyId,
          code,
          type: input.type ?? 'COMPANY',
          status: input.status ?? 'LEAD',
          name,
          legalName: Customer.normalizeOptional(input.legalName),
          email: email?.toLowerCase() ?? null,
          phone: Customer.normalizeOptional(input.phone),
          mobile: Customer.normalizeOptional(input.mobile),
          taxNumber: Customer.normalizeOptional(input.taxNumber),
          addressLine1: Customer.normalizeOptional(
            input.addressLine1,
          ),
          addressLine2: Customer.normalizeOptional(
            input.addressLine2,
          ),
          city: Customer.normalizeOptional(input.city),
          state: Customer.normalizeOptional(input.state),
          postalCode: Customer.normalizeOptional(input.postalCode),
          countryCode,
          preferredLocale: input.preferredLocale ?? null,
          preferredCurrency,
          creditLimit: input.creditLimit ?? null,
          paymentTermDays: input.paymentTermDays ?? null,
          notes: Customer.normalizeOptional(input.notes),
          isDeleted: false,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: CustomerProps,
    id: UniqueEntityID,
  ): Customer {
    return new Customer(props, id);
  }

  public rename(name: string): Result<void, DomainError> {
    const normalizedName = name.trim();
    const guard = Guard.againstEmptyString(
      normalizedName,
      'Customer name',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ?? 'Customer name is required.',
          'INVALID_CUSTOMER_NAME',
        ),
      );
    }

    this.props.name = normalizedName;
    this.touch();

    return Result.success(undefined);
  }

  public changeStatus(status: CustomerStatus): void {
    this.props.status = status;
    this.touch();
  }

  public updateContactDetails(input: {
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
  }): Result<void, DomainError> {
    const email = Customer.normalizeOptional(input.email);

    if (email && !Customer.isValidEmail(email)) {
      return Result.failure(
        new DomainError(
          'Customer email address is invalid.',
          'INVALID_CUSTOMER_EMAIL',
        ),
      );
    }

    if (input.email !== undefined) {
      this.props.email = email?.toLowerCase() ?? null;
    }

    if (input.phone !== undefined) {
      this.props.phone = Customer.normalizeOptional(input.phone);
    }

    if (input.mobile !== undefined) {
      this.props.mobile = Customer.normalizeOptional(input.mobile);
    }

    this.touch();

    return Result.success(undefined);
  }

  public softDelete(): void {
    if (this.props.isDeleted) {
      return;
    }

    const now = new Date();

    this.props.isDeleted = true;
    this.props.deletedAt = now;
    this.props.updatedAt = now;
  }

  public restoreDeleted(): void {
    if (!this.props.isDeleted) {
      return;
    }

    this.props.isDeleted = false;
    this.props.deletedAt = null;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  private static normalizeOptional(
    value?: string | null,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
  }

  private static normalizeCountryCode(
    value?: string | null,
  ): string | null {
    const normalized = Customer.normalizeOptional(value);

    return normalized?.toUpperCase() ?? null;
  }

  private static normalizeCurrency(
    value?: string | null,
  ): string | null {
    const normalized = Customer.normalizeOptional(value);

    return normalized?.toUpperCase() ?? null;
  }

  private static isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
