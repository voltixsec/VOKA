import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

export type CompanyLocale = 'EN' | 'AR';

export type CompanyProps = {
  name: string;
  slug: string;
  defaultLocale: CompanyLocale;
  defaultCurrency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCompanyProps = {
  name: string;
  slug?: string;
  defaultLocale?: CompanyLocale;
  defaultCurrency?: string;
  timezone?: string;
};

export class Company extends Entity<CompanyProps> {
  private constructor(props: CompanyProps, id?: UniqueEntityID) {
    super(props, id);
  }

  public get name(): string {
    return this.props.name;
  }

  public get slug(): string {
    return this.props.slug;
  }

  public get defaultLocale(): CompanyLocale {
    return this.props.defaultLocale;
  }

  public get defaultCurrency(): string {
    return this.props.defaultCurrency;
  }

  public get timezone(): string {
    return this.props.timezone;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public static create(
    input: CreateCompanyProps,
    id?: UniqueEntityID,
  ): Result<Company, DomainError> {
    const name = input.name.trim();

    const nameGuard = Guard.againstEmptyString(name, 'Company name');

    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'Company name is required.',
          'INVALID_COMPANY_NAME',
        ),
      );
    }

    const slug = Company.normalizeSlug(input.slug ?? name);

    if (!slug) {
      return Result.failure(
        new DomainError(
          'Company slug is invalid.',
          'INVALID_COMPANY_SLUG',
        ),
      );
    }

    const currency = (
      input.defaultCurrency ?? 'KWD'
    ).trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      return Result.failure(
        new DomainError(
          'Company currency must be a valid three-letter currency code.',
          'INVALID_COMPANY_CURRENCY',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new Company(
        {
          name,
          slug,
          defaultLocale: input.defaultLocale ?? 'EN',
          defaultCurrency: currency,
          timezone: input.timezone?.trim() || 'Asia/Kuwait',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: CompanyProps,
    id: UniqueEntityID,
  ): Company {
    return new Company(props, id);
  }

  public rename(name: string): Result<void, DomainError> {
    const normalizedName = name.trim();
    const guard = Guard.againstEmptyString(
      normalizedName,
      'Company name',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ?? 'Company name is required.',
          'INVALID_COMPANY_NAME',
        ),
      );
    }

    this.props.name = normalizedName;
    this.touch();

    return Result.success(undefined);
  }

  public activate(): void {
    this.props.isActive = true;
    this.touch();
  }

  public deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  private static normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}